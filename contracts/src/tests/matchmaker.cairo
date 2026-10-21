//! The matchmaker's library (#639, `docs/architecture/matchmaker.md`): the crowns, the packed
//! slots, the pool over a memory store, and fuzz tests of the pool's invariants.

use core::dict::{Felt252Dict, Felt252DictTrait};
use core::hash::HashStateTrait;
use core::poseidon::PoseidonTrait;
use paved::helpers::bitmap::Bitmap;
use paved::matchmaker::crowns::{
    OFFER_MAX, OFFER_MIN, TOP_BUCKET, bucket_of, loss_of, offer_of, settle,
};
use paved::matchmaker::pool::{
    ATTACK_SHIELD, INITIAL_SHIELD, PoolStore, PoolTrait, QUEUE_ATTACK, QUEUE_INITIAL,
};
use paved::matchmaker::village::{
    Queue, QueuePacking, STATUS_NONE, STATUS_POOL, STATUS_SHIELDED, Village, VillagePacking,
};
use starknet::ContractAddress;

const TWO_POW_32: felt252 = 0x100000000;
const TWO_POW_64: felt252 = 0x10000000000000000;
const START: u64 = 1_800_000_000;

// The memory store

#[derive(Destruct)]
pub struct MemoryStore {
    registry: felt252,
    sizes: Felt252Dict<u32>,
    slots: Felt252Dict<felt252>,
    villages: Felt252Dict<felt252>,
    queues: Felt252Dict<felt252>,
    entries: Felt252Dict<felt252>,
}

fn store() -> MemoryStore {
    MemoryStore {
        registry: 0,
        sizes: Default::default(),
        slots: Default::default(),
        villages: Default::default(),
        queues: Default::default(),
        entries: Default::default(),
    }
}

impl MemoryPoolStore of PoolStore<MemoryStore> {
    fn read_registry(ref self: MemoryStore) -> felt252 {
        self.registry
    }
    fn write_registry(ref self: MemoryStore, registry: felt252) {
        self.registry = registry;
    }
    fn read_bucket_size(ref self: MemoryStore, bucket: u8) -> u32 {
        self.sizes.get(bucket.into())
    }
    fn write_bucket_size(ref self: MemoryStore, bucket: u8, size: u32) {
        self.sizes.insert(bucket.into(), size);
    }
    fn read_slot(ref self: MemoryStore, bucket: u8, index: u32) -> ContractAddress {
        self.slots.get(bucket.into() * TWO_POW_32 + index.into()).try_into().unwrap()
    }
    fn write_slot(ref self: MemoryStore, bucket: u8, index: u32, village: ContractAddress) {
        self.slots.insert(bucket.into() * TWO_POW_32 + index.into(), village.into());
    }
    fn read_village(ref self: MemoryStore, address: ContractAddress) -> Village {
        VillagePacking::unpack(self.villages.get(address.into()))
    }
    fn write_village(ref self: MemoryStore, address: ContractAddress, village: Village) {
        self.villages.insert(address.into(), VillagePacking::pack(village));
    }
    fn read_queue(ref self: MemoryStore, queue: u8) -> Queue {
        QueuePacking::unpack(self.queues.get(queue.into()))
    }
    fn write_queue(ref self: MemoryStore, queue: u8, value: Queue) {
        self.queues.insert(queue.into(), QueuePacking::pack(value));
    }
    fn read_entry(ref self: MemoryStore, queue: u8, seq: u64) -> ContractAddress {
        self.entries.get(queue.into() * TWO_POW_64 + seq.into()).try_into().unwrap()
    }
    fn write_entry(ref self: MemoryStore, queue: u8, seq: u64, village: ContractAddress) {
        self.entries.insert(queue.into() * TWO_POW_64 + seq.into(), village.into());
    }
}

fn village(id: u32) -> ContractAddress {
    let address: felt252 = 0x1000 + id.into();
    address.try_into().unwrap()
}

fn npc(id: u8) -> ContractAddress {
    let address: felt252 = id.into();
    address.try_into().unwrap()
}

/// Checks the pool's invariants over `villages` (every address that ever joined) and the whole
/// registry.
fn assert_invariants(ref s: MemoryStore, villages: Span<ContractAddress>) {
    assert_buckets(ref s, villages);
    assert_villages(ref s, villages);
}

/// Bit b set iff bucket b is non-empty, and every slot below a size holds a pool village that says
/// so (so no village is in two slots); the pool count matches the sizes.
fn assert_buckets(ref s: MemoryStore, villages: Span<ContractAddress>) {
    let mut bits: u256 = s.read_registry().into();
    // Bit b set iff bucket b is non-empty; every slot below a size holds a pool village that says
    // so (so no village is in two slots)
    let mut pooled: u32 = 0;
    let mut bucket: u8 = 0;
    loop {
        let size = s.read_bucket_size(bucket);
        assert((bits % 2 == 1) == (size > 0), 'bit != non-empty');
        bits /= 2;
        let mut index: u32 = 0;
        while index < size {
            let address = s.read_slot(bucket, index);
            let v = s.read_village(address);
            assert(v.status == STATUS_POOL, 'slot village not in pool');
            assert(v.bucket == bucket && v.index == index, 'slot village elsewhere');
            index += 1;
        }
        pooled += size;
        if bucket == TOP_BUCKET {
            break;
        }
        bucket += 1;
    }
    assert(bits == 0, 'bit past the top bucket');
    let mut in_pool: u32 = 0;
    for address in villages {
        if s.read_village(*address).status == STATUS_POOL {
            in_pool += 1;
        }
    }
    assert(in_pool == pooled, 'pool count != sizes');
}

/// Every village in exactly one place: its slot, or its live queue entry.
fn assert_villages(ref s: MemoryStore, villages: Span<ContractAddress>) {
    for address in villages {
        let v = s.read_village(*address);
        if v.status == STATUS_POOL {
            assert(v.bucket == bucket_of(v.crowns), 'pool village wrong bucket');
            assert(v.index < s.read_bucket_size(v.bucket), 'pool index past size');
            assert(s.read_slot(v.bucket, v.index) == *address, 'pool slot not village');
        } else if v.status == STATUS_SHIELDED {
            let queue = s.read_queue(v.queue);
            assert(queue.head <= v.seq && v.seq < queue.tail, 'shield entry not live');
            assert(s.read_entry(v.queue, v.seq) == *address, 'shield entry not village');
        } else {
            assert(v.npc, 'joined village out of pool');
        }
    }
}

// Crowns

#[test]
fn test_bucket_of() {
    assert_eq!(bucket_of(0), 0);
    assert_eq!(bucket_of(99), 0);
    assert_eq!(bucket_of(100), 1);
    assert_eq!(bucket_of(24_999), 249);
    assert_eq!(bucket_of(25_000), TOP_BUCKET);
    assert_eq!(bucket_of(0xffffffff), TOP_BUCKET);
}

#[test]
fn test_offer_of() {
    assert_eq!(offer_of(1000, 1000), 25);
    assert_eq!(offer_of(1000, 1019), 25);
    assert_eq!(offer_of(1000, 1020), 26);
    assert_eq!(offer_of(1020, 1000), 24);
    assert_eq!(offer_of(1019, 1000), 25);
    assert_eq!(offer_of(0, 300), 40);
    assert_eq!(offer_of(0, 10_000), OFFER_MAX);
    assert_eq!(offer_of(300, 0), 10);
    assert_eq!(offer_of(10_000, 0), OFFER_MIN);
}

#[test]
#[fuzzer(runs: 64, seed: 639)]
fn test_offer_is_bounded_and_monotonic(attacker: u32, defender: u32) {
    let offer = offer_of(attacker, defender);
    assert(offer >= OFFER_MIN && offer <= OFFER_MAX, 'offer out of bounds');
    if defender < 0xffffffff {
        assert(offer_of(attacker, defender + 1) >= offer, 'offer not monotonic');
    }
}

#[test]
fn test_loss_of() {
    assert_eq!(loss_of(10), 2);
    assert_eq!(loss_of(25), 6);
    assert_eq!(loss_of(40), 10);
    assert_eq!(loss_of(0), 2);
    assert_eq!(loss_of(255), 10);
}

#[test]
fn test_settle_win() {
    let outcome = settle(500, 600, 30, 3, false);
    assert_eq!(outcome.attacker, 530);
    assert_eq!(outcome.defender, 570);
    assert_eq!(outcome.gained, 30);
    let outcome = settle(500, 600, 30, 1, false);
    assert_eq!(outcome.gained, 10);
    let outcome = settle(500, 600, 31, 2, false);
    assert_eq!(outcome.gained, 20);
}

#[test]
fn test_settle_win_capped_by_defender() {
    let outcome = settle(500, 7, 30, 3, false);
    assert_eq!(outcome.attacker, 507);
    assert_eq!(outcome.defender, 0);
    assert_eq!(outcome.gained, 7);
}

#[test]
fn test_settle_loss() {
    let outcome = settle(500, 600, 30, 0, false);
    assert_eq!(outcome.attacker, 493);
    assert_eq!(outcome.defender, 607);
    assert_eq!(outcome.lost, 7);
    let outcome = settle(3, 600, 40, 0, false);
    assert_eq!(outcome.attacker, 0);
    assert_eq!(outcome.defender, 603);
    assert_eq!(outcome.lost, 3);
}

#[test]
fn test_settle_against_npc() {
    let outcome = settle(500, 200, 30, 3, true);
    assert_eq!(outcome.attacker, 530);
    assert_eq!(outcome.defender, 200);
    let outcome = settle(500, 200, 30, 0, true);
    assert_eq!(outcome.attacker, 493);
    assert_eq!(outcome.defender, 200);
}

#[test]
#[should_panic(expected: ('Matchmaker: invalid stars',))]
fn test_settle_refuses_four_stars() {
    settle(500, 600, 30, 4, false);
}

#[test]
#[fuzzer(runs: 64, seed: 639)]
fn test_settle_conserves_crowns(attacker: u32, defender: u32, offer: u8, stars: u8) {
    assert_settle_conserves(attacker, defender, offer, stars);
}

#[test]
#[fuzzer(runs: 64, seed: 639)]
fn test_settle_conserves_crowns_near_the_bound(attacker: u8, defender: u8, offer: u8, stars: u8) {
    // Both counts within 255 of u32's bound, where a receiver can overflow
    let attacker: u32 = 0xffffffff - attacker.into();
    let defender: u32 = 0xffffffff - defender.into();
    assert_settle_conserves(attacker, defender, offer, stars);
}

/// Crowns are conserved between players, and the amount reported is what moved.
fn assert_settle_conserves(attacker: u32, defender: u32, offer: u8, stars: u8) {
    let offer = OFFER_MIN + offer % (OFFER_MAX - OFFER_MIN + 1);
    let stars = stars % 4;
    let outcome = settle(attacker, defender, offer, stars, false);
    let before: u64 = attacker.into() + defender.into();
    let after: u64 = outcome.attacker.into() + outcome.defender.into();
    assert(before == after, 'crowns not conserved');
    assert(outcome.gained <= offer.into() && outcome.lost <= 10, 'too much moved');
    // The reported amount is what moved
    if stars == 0 {
        assert(outcome.gained == 0, 'gain at 0 stars');
        assert(attacker - outcome.attacker == outcome.lost, 'loss not what moved');
    } else {
        assert(outcome.lost == 0, 'loss on a win');
        assert(outcome.attacker - attacker == outcome.gained, 'gain not what moved');
    }
}

#[test]
fn test_settle_win_capped_by_the_attackers_room() {
    let outcome = settle(0xffffffff, 100, 10, 3, false);
    assert_eq!(outcome.gained, 0);
    assert_eq!(outcome.attacker, 0xffffffff);
    assert_eq!(outcome.defender, 100);
    let outcome = settle(0xfffffffb, 100, 30, 3, false);
    assert_eq!(outcome.gained, 4);
    assert_eq!(outcome.attacker, 0xffffffff);
    assert_eq!(outcome.defender, 96);
}

#[test]
fn test_settle_loss_capped_by_the_defenders_room() {
    let outcome = settle(100, 0xfffffffe, 40, 0, false);
    assert_eq!(outcome.lost, 1);
    assert_eq!(outcome.attacker, 99);
    assert_eq!(outcome.defender, 0xffffffff);
}

#[test]
fn test_settle_npc_win_capped_by_the_attackers_room() {
    let outcome = settle(0xfffffffe, 100, 30, 3, true);
    assert_eq!(outcome.gained, 1);
    assert_eq!(outcome.attacker, 0xffffffff);
    assert_eq!(outcome.defender, 100);
}

// Packing

#[test]
#[fuzzer(runs: 64, seed: 639)]
fn test_village_packing_round_trips(
    crowns: u32, bucket: u8, index: u32, draws: u32, seq: u64, shield_until: u64, flags: u8,
) {
    let value = Village {
        crowns,
        bucket,
        index,
        status: flags % 3,
        queue: (flags / 3) % 2,
        draws,
        npc: flags >= 128,
        seq,
        shield_until: shield_until % 0x100000000000000,
    };
    assert(VillagePacking::unpack(VillagePacking::pack(value)) == value, 'village round trip');
}

#[test]
fn test_village_packing_zero_is_default() {
    assert(VillagePacking::unpack(0) == Default::default(), 'zero is not default');
    assert(VillagePacking::pack(Default::default()) == 0, 'default is not zero');
}

#[test]
#[fuzzer(runs: 32, seed: 639)]
fn test_queue_packing_round_trips(head: u64, tail: u64) {
    let value = Queue { head, tail };
    assert(QueuePacking::unpack(QueuePacking::pack(value)) == value, 'queue round trip');
}

// The pool

#[test]
fn test_join_puts_a_village_in_bucket_zero() {
    let mut s = store();
    let v = PoolTrait::join(ref s, village(1), START, false);
    assert_eq!(v.status, STATUS_POOL);
    assert_eq!(v.bucket, 0);
    assert_eq!(v.index, 0);
    assert_eq!(s.read_registry(), 1);
    assert_invariants(ref s, array![village(1)].span());
}

#[test]
#[should_panic(expected: ('Matchmaker: already joined',))]
fn test_join_twice_fails() {
    let mut s = store();
    PoolTrait::join(ref s, village(1), START, false);
    PoolTrait::join(ref s, village(1), START, false);
}

#[test]
fn test_join_shielded_queues_the_village() {
    let mut s = store();
    let v = PoolTrait::join(ref s, village(1), START, true);
    assert_eq!(v.status, STATUS_SHIELDED);
    assert_eq!(v.queue, QUEUE_INITIAL);
    assert_eq!(v.shield_until, START + INITIAL_SHIELD);
    assert_eq!(s.read_registry(), 0);
    assert_eq!(s.read_queue(QUEUE_INITIAL), Queue { head: 0, tail: 1 });
    assert_invariants(ref s, array![village(1)].span());
}

#[test]
fn test_remove_swaps_with_the_last_slot() {
    let mut s = store();
    PoolTrait::join(ref s, village(1), START, false);
    PoolTrait::join(ref s, village(2), START, false);
    PoolTrait::join(ref s, village(3), START, false);
    // Village 1 leaves bucket 0 (crowns to bucket 1): village 3 takes its index
    PoolTrait::set_crowns(ref s, village(1), 150);
    let moved = s.read_village(village(3));
    assert_eq!(moved.index, 0);
    assert_eq!(s.read_slot(0, 0), village(3));
    assert_eq!(s.read_bucket_size(0), 2);
    assert_eq!(s.read_bucket_size(1), 1);
    assert_eq!(s.read_registry(), 3);
    assert_invariants(ref s, array![village(1), village(2), village(3)].span());
}

#[test]
fn test_registry_bit_clears_when_a_bucket_empties() {
    let mut s = store();
    PoolTrait::join(ref s, village(1), START, false);
    PoolTrait::set_crowns(ref s, village(1), 250);
    assert_eq!(s.read_registry(), 4);
    PoolTrait::set_crowns(ref s, village(1), 25_000);
    let expected: u256 = Bitmap::set_bit_at(0_u256, TOP_BUCKET, true);
    let registry: u256 = s.read_registry().into();
    assert_eq!(registry, expected);
}

#[test]
fn test_draw_alone_finds_no_one() {
    let mut s = store();
    let v = PoolTrait::join(ref s, village(1), START, false);
    let registry = PoolTrait::load(ref s);
    assert!(PoolTrait::draw(ref s, registry, v, 12345).is_none());
}

#[test]
fn test_draw_takes_the_nearest_bucket() {
    let mut s = store();
    PoolTrait::join(ref s, village(1), START, false);
    PoolTrait::join(ref s, village(2), START, false);
    PoolTrait::join(ref s, village(3), START, false);
    PoolTrait::set_crowns(ref s, village(1), 1_000);
    PoolTrait::set_crowns(ref s, village(2), 1_300);
    PoolTrait::set_crowns(ref s, village(3), 5_000);
    let attacker = s.read_village(village(1));
    let registry = PoolTrait::load(ref s);
    let mut random: felt252 = 0;
    while random != 8 {
        let drawn = PoolTrait::draw(ref s, registry, attacker, random).unwrap();
        assert(drawn == village(2), 'not the nearest bucket');
        random += 1;
    }
}

#[test]
fn test_draw_tie_is_broken_by_the_random() {
    let mut s = store();
    PoolTrait::join(ref s, village(1), START, false);
    PoolTrait::join(ref s, village(2), START, false);
    PoolTrait::join(ref s, village(3), START, false);
    PoolTrait::set_crowns(ref s, village(1), 1_000);
    PoolTrait::set_crowns(ref s, village(2), 800);
    PoolTrait::set_crowns(ref s, village(3), 1_200);
    let attacker = s.read_village(village(1));
    let registry = PoolTrait::load(ref s);
    assert(PoolTrait::draw(ref s, registry, attacker, 0).unwrap() == village(3), 'even: above');
    assert(PoolTrait::draw(ref s, registry, attacker, 1).unwrap() == village(2), 'odd: below');
}

#[test]
#[fuzzer(runs: 64, seed: 639)]
fn test_draw_never_returns_the_attacker(random: felt252, count: u8, which: u8) {
    let mut s = store();
    let count: u32 = 2 + (count % 6).into();
    let mut id: u32 = 0;
    while id != count {
        PoolTrait::join(ref s, village(id), START, false);
        id += 1;
    }
    let attacker_id: u32 = which.into() % count;
    let attacker = s.read_village(village(attacker_id));
    let registry = PoolTrait::load(ref s);
    let drawn = PoolTrait::draw(ref s, registry, attacker, random).unwrap();
    assert(drawn != village(attacker_id), 'self match');
    let v = s.read_village(drawn);
    assert(v.status == STATUS_POOL, 'drawn out of pool');
}

#[test]
fn test_shielded_attacker_draws_from_its_crowns_bucket() {
    let mut s = store();
    PoolTrait::join(ref s, village(1), START, true);
    PoolTrait::join(ref s, village(2), START, false);
    let attacker = s.read_village(village(1));
    let registry = PoolTrait::load(ref s);
    assert(PoolTrait::draw(ref s, registry, attacker, 7).unwrap() == village(2), 'wrong opponent');
}

#[test]
fn test_start_shields_the_defender_and_drops_the_attackers_shield() {
    let mut s = store();
    PoolTrait::join(ref s, village(1), START, true);
    PoolTrait::join(ref s, village(2), START, false);
    let start = PoolTrait::start(ref s, village(1), village(2), START + 10);
    assert!(start.dropped);
    assert_eq!(start.shield_until, START + 10 + ATTACK_SHIELD);
    let attacker = s.read_village(village(1));
    let defender = s.read_village(village(2));
    assert_eq!(attacker.status, STATUS_POOL);
    assert_eq!(defender.status, STATUS_SHIELDED);
    assert_eq!(defender.queue, QUEUE_ATTACK);
    assert_invariants(ref s, array![village(1), village(2)].span());
}

#[test]
#[should_panic(expected: ('Matchmaker: opponent shielded',))]
fn test_start_on_a_shielded_defender_fails() {
    let mut s = store();
    PoolTrait::join(ref s, village(1), START, false);
    PoolTrait::join(ref s, village(2), START, false);
    PoolTrait::join(ref s, village(3), START, false);
    PoolTrait::start(ref s, village(1), village(2), START);
    PoolTrait::start(ref s, village(3), village(2), START + 1);
}

#[test]
#[should_panic(expected: ('Matchmaker: self match',))]
fn test_start_on_itself_fails() {
    let mut s = store();
    PoolTrait::join(ref s, village(1), START, false);
    PoolTrait::start(ref s, village(1), village(1), START);
}

#[test]
fn test_start_releases_at_most_two_expired_shields() {
    let mut s = store();
    let mut id: u32 = 0;
    while id != 6 {
        PoolTrait::join(ref s, village(id), START, false);
        id += 1;
    }
    // Villages 1, 2, 3 attacked one after the other by village 0
    PoolTrait::start(ref s, village(0), village(1), START);
    PoolTrait::start(ref s, village(0), village(2), START + 1);
    PoolTrait::start(ref s, village(0), village(3), START + 2);
    // Before the first shield ends: nothing comes back
    let start = PoolTrait::start(ref s, village(0), village(4), START + ATTACK_SHIELD - 1);
    assert_eq!(start.released.len(), 0);
    // Once all ended: the first two come back, in arrival order
    let start = PoolTrait::start(ref s, village(0), village(5), START + ATTACK_SHIELD + 5);
    assert_eq!(start.released, array![village(1), village(2)]);
    assert_eq!(s.read_village(village(3)).status, STATUS_SHIELDED);
    assert_invariants(
        ref s,
        array![village(0), village(1), village(2), village(3), village(4), village(5)].span(),
    );
}

#[test]
fn test_release_takes_the_earliest_end_across_queues() {
    let mut s = store();
    // Village 1: initial shield until START + 3 days; villages 2, 3 in the pool
    PoolTrait::join(ref s, village(1), START, true);
    PoolTrait::join(ref s, village(2), START, false);
    PoolTrait::join(ref s, village(3), START, false);
    // Village 3 attacked late: its shield ends after village 1's
    let late = START + INITIAL_SHIELD - ATTACK_SHIELD + 100;
    PoolTrait::start(ref s, village(2), village(3), late);
    let mut registry = PoolTrait::load(ref s);
    let released = PoolTrait::release(ref s, ref registry, START + INITIAL_SHIELD, 1);
    assert_eq!(released, array![village(1)]);
    let released = PoolTrait::release(ref s, ref registry, late + ATTACK_SHIELD, 2);
    assert_eq!(released, array![village(3)]);
    PoolTrait::flush(ref s, registry);
    assert_invariants(ref s, array![village(1), village(2), village(3)].span());
}

#[test]
fn test_release_discards_stale_entries() {
    let mut s = store();
    // Villages 1 to 3 start shielded; they attack (dropping their shields) right away
    PoolTrait::join(ref s, village(0), START, false);
    PoolTrait::join(ref s, village(1), START, true);
    PoolTrait::join(ref s, village(2), START, true);
    PoolTrait::join(ref s, village(3), START, true);
    PoolTrait::start(ref s, village(1), village(0), START);
    PoolTrait::start(ref s, village(2), village(1), START);
    // Village 1 has a live attack shield now; its initial entry is stale; village 2's too
    let mut registry = PoolTrait::load(ref s);
    let released = PoolTrait::release(ref s, ref registry, START + INITIAL_SHIELD, 2);
    // Stale entries 0 and 1 of the initial queue are popped on the way; the attack queue's
    // shields end first, so villages 0 and 1 come back, and village 3 stays shielded
    assert_eq!(released, array![village(0), village(1)]);
    PoolTrait::flush(ref s, registry);
    assert_eq!(s.read_queue(QUEUE_INITIAL).head, 2);
    assert_eq!(s.read_village(village(3)).status, STATUS_SHIELDED);
    assert_invariants(ref s, array![village(0), village(1), village(2), village(3)].span());
}

#[test]
fn test_release_budget_bounds_stale_pops() {
    let mut s = store();
    let mut id: u32 = 0;
    while id != 6 {
        PoolTrait::join(ref s, village(id), START, true);
        id += 1;
    }
    // Villages 0 to 4 drop their initial shields (as an attack start does): five stale entries
    let mut registry = PoolTrait::load(ref s);
    id = 0;
    while id != 5 {
        let mut v = s.read_village(village(id));
        PoolTrait::insert(ref s, ref registry, village(id), ref v);
        s.write_village(village(id), v);
        id += 1;
    }
    // A budget of 2 x 1 pops two stale entries and releases nothing
    let released = PoolTrait::release(ref s, ref registry, START + INITIAL_SHIELD, 1);
    PoolTrait::flush(ref s, registry);
    assert_eq!(released.len(), 0);
    assert_eq!(s.read_queue(QUEUE_INITIAL).head, 2);
    // The next call reaches village 5
    let mut registry = PoolTrait::load(ref s);
    let released = PoolTrait::release(ref s, ref registry, START + INITIAL_SHIELD, 2);
    PoolTrait::flush(ref s, registry);
    assert_eq!(released, array![village(5)]);
    assert_invariants(
        ref s,
        array![village(0), village(1), village(2), village(3), village(4), village(5)].span(),
    );
}

#[test]
fn test_npc_stays_in_the_pool() {
    let mut s = store();
    PoolTrait::set_npc(ref s, npc(1), 150);
    PoolTrait::join(ref s, village(1), START, false);
    let start = PoolTrait::start(ref s, village(1), npc(1), START);
    assert_eq!(start.shield_until, 0);
    let n = s.read_village(npc(1));
    assert_eq!(n.status, STATUS_POOL);
    assert_eq!(n.bucket, 1);
    let outcome = PoolTrait::settle(ref s, village(1), npc(1), 25, 3);
    assert_eq!(outcome.attacker, 25);
    assert_eq!(s.read_village(npc(1)).crowns, 150);
    assert_invariants(ref s, array![npc(1), village(1)].span());
}

#[test]
fn test_npc_removed_leaves_the_pool() {
    let mut s = store();
    PoolTrait::set_npc(ref s, npc(1), 150);
    PoolTrait::set_npc(ref s, npc(1), 290);
    assert_eq!(s.read_village(npc(1)).bucket, 2);
    PoolTrait::remove_npc(ref s, npc(1));
    assert_eq!(s.read_village(npc(1)).status, STATUS_NONE);
    assert_eq!(s.read_registry(), 0);
    assert_invariants(ref s, array![npc(1)].span());
}

#[test]
#[should_panic(expected: ('Matchmaker: npc cannot play',))]
fn test_npc_cannot_attack() {
    let mut s = store();
    PoolTrait::set_npc(ref s, npc(1), 150);
    PoolTrait::join(ref s, village(1), START, false);
    PoolTrait::start(ref s, npc(1), village(1), START);
}

#[test]
#[should_panic(expected: ('Matchmaker: not an npc',))]
fn test_set_npc_refuses_a_player() {
    let mut s = store();
    PoolTrait::join(ref s, village(1), START, false);
    PoolTrait::set_npc(ref s, village(1), 150);
}

#[test]
fn test_settle_moves_both_buckets() {
    let mut s = store();
    PoolTrait::join(ref s, village(1), START, false);
    PoolTrait::join(ref s, village(2), START, false);
    PoolTrait::set_crowns(ref s, village(1), 90);
    PoolTrait::set_crowns(ref s, village(2), 110);
    PoolTrait::start(ref s, village(1), village(2), START);
    let outcome = PoolTrait::settle(ref s, village(1), village(2), 26, 3);
    assert_eq!(outcome.attacker, 116);
    assert_eq!(outcome.defender, 84);
    let attacker = s.read_village(village(1));
    assert_eq!(attacker.bucket, 1);
    // The defender is shielded: only its crowns change, its bucket comes at release
    let defender = s.read_village(village(2));
    assert_eq!(defender.status, STATUS_SHIELDED);
    assert_eq!(defender.crowns, 84);
    let mut registry = PoolTrait::load(ref s);
    PoolTrait::release(ref s, ref registry, START + ATTACK_SHIELD, 2);
    PoolTrait::flush(ref s, registry);
    assert_eq!(s.read_village(village(2)).bucket, 0);
    assert_invariants(ref s, array![village(1), village(2)].span());
}

// Fuzz: random sequences of calls keep the invariants

fn next(ref state: felt252) -> u256 {
    state = PoseidonTrait::new().update(state).update('MATCHMAKER').finalize();
    state.into()
}

/// Runs `steps` random calls; the buckets are checked whole every `every` steps and at the end,
/// the villages after every step. Returns the attacks started and the shields released.
fn run_sequence(seed: felt252, steps: u32, every: u32) -> (u32, u32) {
    let mut attacks: u32 = 0;
    let mut releases: u32 = 0;
    let mut s = store();
    let mut state = seed;
    let mut now = START;
    let mut joined: Array<ContractAddress> = array![];
    let mut players: u32 = 0;
    let mut step: u32 = 0;
    while step != steps {
        let r = next(ref state);
        let op = r % 8;
        if op == 0 || players < 2 {
            let address = village(players);
            PoolTrait::join(ref s, address, now, (r / 8) % 2 == 1);
            joined.append(address);
            players += 1;
        } else if op == 1 {
            let id: u8 = 1 + ((r / 8) % 3).try_into().unwrap();
            let v = s.read_village(npc(id));
            if !v.npc {
                joined.append(npc(id));
            }
            if v.status == STATUS_POOL && (r / 32) % 3 == 0 {
                PoolTrait::remove_npc(ref s, npc(id));
            } else {
                let crowns: u32 = ((r / 64) % 300).try_into().unwrap();
                PoolTrait::set_npc(ref s, npc(id), crowns);
            }
        } else if op == 2 {
            let id: u32 = ((r / 8) % players.into()).try_into().unwrap();
            let crowns: u32 = ((r / 1024) % 30_000).try_into().unwrap();
            PoolTrait::set_crowns(ref s, village(id), crowns);
        } else if op == 3 {
            now += ((r / 8) % (10 * 3600)).try_into().unwrap();
        } else if op == 4 {
            let max: u32 = ((r / 8) % 4).try_into().unwrap();
            let mut registry = PoolTrait::load(ref s);
            releases += PoolTrait::release(ref s, ref registry, now, max).len();
            PoolTrait::flush(ref s, registry);
        } else {
            // An attack: draw, start, settle
            let id: u32 = ((r / 8) % players.into()).try_into().unwrap();
            let attacker = s.read_village(village(id));
            let registry = PoolTrait::load(ref s);
            let random: felt252 = next(ref state).low.into();
            if let Option::Some(defender) = PoolTrait::draw(ref s, registry, attacker, random) {
                assert(defender != village(id), 'fuzz: self match');
                let d = s.read_village(defender);
                assert(d.status == STATUS_POOL, 'fuzz: drawn out of pool');
                let offer = offer_of(attacker.crowns, d.crowns);
                let before: u64 = attacker.crowns.into() + d.crowns.into();
                let start = PoolTrait::start(ref s, village(id), defender, now);
                attacks += 1;
                releases += start.released.len();
                let stars: u8 = ((r / 0x10000) % 4).try_into().unwrap();
                let outcome = PoolTrait::settle(ref s, village(id), defender, offer, stars);
                if !d.npc {
                    let after: u64 = outcome.attacker.into() + outcome.defender.into();
                    assert(before == after, 'fuzz: crowns not conserved');
                }
            }
        }
        assert_villages(ref s, joined.span());
        step += 1;
        if step % every == 0 || step == steps {
            assert_buckets(ref s, joined.span());
        }
    }
    (attacks, releases)
}

#[test]
#[fuzzer(runs: 24, seed: 639)]
fn test_fuzz_pool_invariants(seed: felt252) {
    let (_attacks, _releases) = run_sequence(seed, 24, 1);
}

#[test]
fn test_pool_invariants_long_sequence() {
    let (attacks, releases) = run_sequence('LONG', 160, 16);
    assert(attacks >= 30 && releases >= 10, 'sequence too quiet');
}
