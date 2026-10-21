//! The matchmaker's pool (#639, `docs/architecture/matchmaker.md`, sections 4, 5 and 7), ported
//! from the owner's POC (bal7hazar/matchmaker at 8639f232, `models/registry.cairo`,
//! `models/league.cairo`, `store.cairo`) to pure Cairo: the rules run over `PoolStore`, which the
//! `Matchmaker` system implements on its storage and the tests on memory.
//!
//! - Buckets of `BUCKET_WIDTH` crowns, with a registry: bit `b` of one felt is set iff bucket `b`
//! is
//!   non-empty. The registry is read once per call and written only when a bit flips.
//! - A bucket is a dense array of slots; a removal moves the last slot into the hole (O(1)).
//! - The search takes the nearest non-empty bucket (`Bitmap::nearest_significant_bit`), so someone
//!   is always found while anyone else is in the pool, and never the attacker itself.
//! - Shields are FIFO queues of one duration each, so a queue's head expires first. A dropped
//!   shield leaves a stale entry, recognised by the village's own `queue` and `seq`.
//!
//! Invariants (fuzzed in `paved::tests::matchmaker`): every village that joined is either in
//! exactly one bucket slot (`STATUS_POOL`) or in exactly one live queue entry
//! (`STATUS_SHIELDED`); the slot `(b, i)` of `i < size(b)` holds a village whose slot says `b`,
//! `i`; bit `b` of the registry is set iff `size(b) > 0`; a pool village's bucket is
//! `bucket_of(crowns)`.

use paved::helpers::bitmap::Bitmap;
use paved::matchmaker::crowns::{Settlement, bucket_of, settle};
use paved::matchmaker::village::{Queue, STATUS_NONE, STATUS_POOL, STATUS_SHIELDED, Village};
use starknet::ContractAddress;

/// The queue of the shield an attack gives its defender.
pub const QUEUE_ATTACK: u8 = 0;
/// The queue of a new village's initial shield.
pub const QUEUE_INITIAL: u8 = 1;
/// The attack shield: 8 hours (owner decision, 2026-10-20).
pub const ATTACK_SHIELD: u64 = 8 * 3600;
/// The initial shield of a new village: 3 days (proposed, as in Clash of Clans).
pub const INITIAL_SHIELD: u64 = 3 * 86400;
/// The expired shields each attack start puts back in the pool.
pub const RELEASES_PER_ATTACK: u32 = 2;

pub mod errors {
    pub const ALREADY_JOINED: felt252 = 'Matchmaker: already joined';
    pub const NOT_JOINED: felt252 = 'Matchmaker: not joined';
    pub const NOT_NPC: felt252 = 'Matchmaker: not an npc';
    pub const IS_NPC: felt252 = 'Matchmaker: npc cannot play';
    pub const OPPONENT_SHIELDED: felt252 = 'Matchmaker: opponent shielded';
    pub const SELF_MATCH: felt252 = 'Matchmaker: self match';
}

/// The storage the pool runs on.
pub trait PoolStore<S> {
    fn read_registry(ref self: S) -> felt252;
    fn write_registry(ref self: S, registry: felt252);
    fn read_bucket_size(ref self: S, bucket: u8) -> u32;
    fn write_bucket_size(ref self: S, bucket: u8, size: u32);
    fn read_slot(ref self: S, bucket: u8, index: u32) -> ContractAddress;
    fn write_slot(ref self: S, bucket: u8, index: u32, village: ContractAddress);
    fn read_village(ref self: S, address: ContractAddress) -> Village;
    fn write_village(ref self: S, address: ContractAddress, village: Village);
    fn read_queue(ref self: S, queue: u8) -> Queue;
    fn write_queue(ref self: S, queue: u8, value: Queue);
    fn read_entry(ref self: S, queue: u8, seq: u64) -> ContractAddress;
    fn write_entry(ref self: S, queue: u8, seq: u64, village: ContractAddress);
}

/// The registry in memory: written back by `flush` only if a bit flipped.
#[derive(Copy, Drop, Debug, PartialEq)]
pub struct Registry {
    pub bits: u256,
    pub dirty: bool,
}

/// What an attack start did: the villages whose shield expired and came back, whether the
/// attacker's own shield was dropped, and the defender's shield end (0 for an NPC).
#[derive(Drop, Debug, PartialEq)]
pub struct Start {
    pub released: Array<ContractAddress>,
    pub dropped: bool,
    pub shield_until: u64,
}

#[generate_trait]
pub impl Pool<S, +PoolStore<S>, +Destruct<S>> of PoolTrait<S> {
    // Registry

    fn load(ref store: S) -> Registry {
        Registry { bits: store.read_registry().into(), dirty: false }
    }

    fn flush(ref store: S, registry: Registry) {
        if registry.dirty {
            store.write_registry(registry.bits.try_into().unwrap());
        }
    }

    // Buckets

    /// Appends `village` to the bucket of its crowns and sets its `bucket`, `index` and status.
    /// The caller writes the village.
    fn insert(
        ref store: S, ref registry: Registry, address: ContractAddress, ref village: Village,
    ) {
        let bucket = bucket_of(village.crowns);
        let size = store.read_bucket_size(bucket);
        store.write_slot(bucket, size, address);
        store.write_bucket_size(bucket, size + 1);
        if size == 0 {
            registry.bits = Bitmap::set_bit_at(registry.bits, bucket, true);
            registry.dirty = true;
        }
        village.bucket = bucket;
        village.index = size;
        village.status = STATUS_POOL;
    }

    /// Removes `village` from its bucket: the last slot moves into its index (the POC's
    /// `remove_player_slot`). The emptied slot is past the size and never read, so not cleared.
    /// Sets the village's status to none; the caller writes the village.
    fn remove(ref store: S, ref registry: Registry, ref village: Village) {
        let bucket = village.bucket;
        let last = store.read_bucket_size(bucket) - 1;
        if village.index != last {
            let moved_address = store.read_slot(bucket, last);
            let mut moved = store.read_village(moved_address);
            moved.index = village.index;
            store.write_village(moved_address, moved);
            store.write_slot(bucket, village.index, moved_address);
        }
        store.write_bucket_size(bucket, last);
        if last == 0 {
            registry.bits = Bitmap::set_bit_at(registry.bits, bucket, false);
            registry.dirty = true;
        }
        village.status = STATUS_NONE;
    }

    /// Sets a village's crowns; a pool village whose bucket changes moves. The caller writes it.
    fn move_crowns(
        ref store: S,
        ref registry: Registry,
        address: ContractAddress,
        ref village: Village,
        crowns: u32,
    ) {
        if village.status == STATUS_POOL && bucket_of(crowns) != village.bucket {
            Self::remove(ref store, ref registry, ref village);
            village.crowns = crowns;
            Self::insert(ref store, ref registry, address, ref village);
        } else {
            village.crowns = crowns;
        }
    }

    // Shields

    /// Appends `village` to shield queue `queue` until `until`. A pool village leaves its bucket
    /// first. The caller writes the village.
    fn shield(
        ref store: S,
        ref registry: Registry,
        address: ContractAddress,
        ref village: Village,
        queue: u8,
        until: u64,
    ) {
        if village.status == STATUS_POOL {
            Self::remove(ref store, ref registry, ref village);
        }
        let mut value = store.read_queue(queue);
        store.write_entry(queue, value.tail, address);
        village.status = STATUS_SHIELDED;
        village.queue = queue;
        village.seq = value.tail;
        village.shield_until = until;
        value.tail += 1;
        store.write_queue(queue, value);
    }

    /// Puts back at most `max` villages whose shield ended by `now`, earliest end first, across
    /// both queues. Stale entries (dropped shields) are discarded on the way; at most `2 x max`
    /// entries are popped in all. Returns the villages put back.
    fn release(ref store: S, ref registry: Registry, now: u64, max: u32) -> Array<ContractAddress> {
        let mut released: Array<ContractAddress> = array![];
        let mut attack = store.read_queue(QUEUE_ATTACK);
        let mut initial = store.read_queue(QUEUE_INITIAL);
        let (attack_head, initial_head) = (attack.head, initial.head);
        let budget = 2 * max;
        let mut pops: u32 = 0;
        while released.len() < max {
            let first = Self::live_head(ref store, QUEUE_ATTACK, ref attack, ref pops, budget);
            let second = Self::live_head(ref store, QUEUE_INITIAL, ref initial, ref pops, budget);
            let (queue, address, mut village) = match (first, second) {
                (
                    Option::Some((a, va)), Option::Some((b, vb)),
                ) => {
                    if vb.shield_until < va.shield_until {
                        (QUEUE_INITIAL, b, vb)
                    } else {
                        (QUEUE_ATTACK, a, va)
                    }
                },
                (Option::Some((a, va)), Option::None) => (QUEUE_ATTACK, a, va),
                (Option::None, Option::Some((b, vb))) => (QUEUE_INITIAL, b, vb),
                (Option::None, Option::None) => { break; },
            };
            if village.shield_until > now || pops >= budget {
                break;
            }
            pops += 1;
            if queue == QUEUE_ATTACK {
                attack.head += 1;
            } else {
                initial.head += 1;
            }
            village.shield_until = 0;
            Self::insert(ref store, ref registry, address, ref village);
            store.write_village(address, village);
            released.append(address);
        }
        if attack.head != attack_head {
            store.write_queue(QUEUE_ATTACK, attack);
        }
        if initial.head != initial_head {
            store.write_queue(QUEUE_INITIAL, initial);
        }
        released
    }

    /// The first live entry of queue `queue` and its village, popping stale entries while `pops`
    /// is under `budget`. None if the queue is empty or the budget is spent on stale entries.
    fn live_head(
        ref store: S, queue: u8, ref value: Queue, ref pops: u32, budget: u32,
    ) -> Option<(ContractAddress, Village)> {
        loop {
            if value.head == value.tail {
                break Option::None;
            }
            let address = store.read_entry(queue, value.head);
            let village = store.read_village(address);
            if village.status == STATUS_SHIELDED
                && village.queue == queue
                && village.seq == value.head {
                break Option::Some((address, village));
            }
            if pops >= budget {
                break Option::None;
            }
            pops += 1;
            value.head += 1;
        }
    }

    // The draw

    /// The opponent of `attacker` for `random`, or None if no one else is in the pool. The bucket
    /// is the nearest non-empty one to the attacker's (its crowns' bucket when it is shielded), a
    /// tie broken by the random's lowest bit; the slot is the rest of the random modulo the
    /// bucket's size. The attacker is never drawn: alone in its bucket, its bit is masked out;
    /// otherwise the slot is drawn among the others.
    fn draw(
        ref store: S, registry: Registry, attacker: Village, random: felt252,
    ) -> Option<ContractAddress> {
        let random: u256 = random.into();
        let in_pool = attacker.status == STATUS_POOL;
        let center = if in_pool {
            attacker.bucket
        } else {
            bucket_of(attacker.crowns)
        };
        let own_size = if in_pool {
            store.read_bucket_size(attacker.bucket)
        } else {
            0
        };
        let mut bits = registry.bits;
        if in_pool && own_size == 1 {
            bits = Bitmap::set_bit_at(bits, attacker.bucket, false);
        }
        if bits == 0 {
            return Option::None;
        }
        let priority = random.low & 1 == 1;
        let bucket = Bitmap::nearest_significant_bit(bits, center, priority).unwrap();
        let pick = random / 2;
        let index = if in_pool && bucket == attacker.bucket {
            let others: u256 = (own_size - 1).into();
            let index: u32 = (pick % others).try_into().unwrap();
            if index >= attacker.index {
                index + 1
            } else {
                index
            }
        } else {
            let size: u256 = store.read_bucket_size(bucket).into();
            (pick % size).try_into().unwrap()
        };
        Option::Some(store.read_slot(bucket, index))
    }

    // The calls

    /// A new village joins at 0 crowns: in the pool, or behind an initial shield until
    /// `now + INITIAL_SHIELD` (`shielded`). Its draw counter survives (never reset).
    fn join(ref store: S, address: ContractAddress, now: u64, shielded: bool) -> Village {
        let mut village = store.read_village(address);
        assert(village.status == STATUS_NONE, errors::ALREADY_JOINED);
        assert(!village.npc, errors::IS_NPC);
        let mut registry = Self::load(ref store);
        village = Village { draws: village.draws, ..Default::default() };
        if shielded {
            Self::shield(
                ref store, ref registry, address, ref village, QUEUE_INITIAL, now + INITIAL_SHIELD,
            );
        } else {
            Self::insert(ref store, ref registry, address, ref village);
        }
        store.write_village(address, village);
        Self::flush(ref store, registry);
        village
    }

    /// Puts an NPC village (a Story level, cold start) in the pool at `crowns`, or moves it there.
    fn set_npc(ref store: S, address: ContractAddress, crowns: u32) -> Village {
        let mut village = store.read_village(address);
        let mut registry = Self::load(ref store);
        if village.status == STATUS_NONE {
            village = Village { crowns, npc: true, draws: village.draws, ..Default::default() };
            Self::insert(ref store, ref registry, address, ref village);
        } else {
            assert(village.npc, errors::NOT_NPC);
            Self::move_crowns(ref store, ref registry, address, ref village, crowns);
        }
        store.write_village(address, village);
        Self::flush(ref store, registry);
        village
    }

    /// Takes an NPC village out of the pool.
    fn remove_npc(ref store: S, address: ContractAddress) {
        let mut village = store.read_village(address);
        assert(village.npc && village.status == STATUS_POOL, errors::NOT_NPC);
        let mut registry = Self::load(ref store);
        Self::remove(ref store, ref registry, ref village);
        store.write_village(address, village);
        Self::flush(ref store, registry);
    }

    /// Sets a village's crowns (the season reset of #644), moving its bucket if it is in the pool.
    fn set_crowns(ref store: S, address: ContractAddress, crowns: u32) -> Village {
        let mut village = store.read_village(address);
        assert(village.status != STATUS_NONE, errors::NOT_JOINED);
        let mut registry = Self::load(ref store);
        Self::move_crowns(ref store, ref registry, address, ref village, crowns);
        store.write_village(address, village);
        Self::flush(ref store, registry);
        village
    }

    /// The start of an attack of `attacker` on `defender` at `now`: puts back at most
    /// `RELEASES_PER_ATTACK` expired shields; drops the attacker's own shield; then shields the
    /// defender until `now + ATTACK_SHIELD`, unless it is an NPC. The defender must be in the pool.
    fn start(
        ref store: S, attacker: ContractAddress, defender: ContractAddress, now: u64,
    ) -> Start {
        assert(attacker != defender, errors::SELF_MATCH);
        let mut registry = Self::load(ref store);
        let released = Self::release(ref store, ref registry, now, RELEASES_PER_ATTACK);
        // [Effect] The attacker's shield, if any, is dropped: back in the pool at once
        let mut village = store.read_village(attacker);
        assert(village.status != STATUS_NONE, errors::NOT_JOINED);
        assert(!village.npc, errors::IS_NPC);
        let dropped = village.status == STATUS_SHIELDED;
        if dropped {
            village.shield_until = 0;
            Self::insert(ref store, ref registry, attacker, ref village);
            store.write_village(attacker, village);
        }
        // [Effect] The defender leaves the pool behind an attack shield (an NPC stays)
        let mut target = store.read_village(defender);
        assert(target.status == STATUS_POOL, errors::OPPONENT_SHIELDED);
        let shield_until = if target.npc {
            0
        } else {
            let until = now + ATTACK_SHIELD;
            Self::shield(ref store, ref registry, defender, ref target, QUEUE_ATTACK, until);
            store.write_village(defender, target);
            until
        };
        Self::flush(ref store, registry);
        Start { released, dropped, shield_until }
    }

    /// Settles an attack's `stars` at `offer` (`crowns::settle`): both villages' crowns move, a
    /// pool village's bucket with them; a shielded one keeps its queue place.
    fn settle(
        ref store: S, attacker: ContractAddress, defender: ContractAddress, offer: u8, stars: u8,
    ) -> Settlement {
        let mut a = store.read_village(attacker);
        let mut d = store.read_village(defender);
        let outcome = settle(a.crowns, d.crowns, offer, stars, d.npc);
        let mut registry = Self::load(ref store);
        Self::move_crowns(ref store, ref registry, attacker, ref a, outcome.attacker);
        store.write_village(attacker, a);
        if !d.npc {
            // Re-read: the attacker's move may have moved the defender's slot index
            d = store.read_village(defender);
            Self::move_crowns(ref store, ref registry, defender, ref d, outcome.defender);
            store.write_village(defender, d);
        }
        Self::flush(ref store, registry);
        outcome
    }
}
