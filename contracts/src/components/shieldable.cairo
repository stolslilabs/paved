//! Shieldable component: the matchmaker's shields (#639, `docs/architecture/matchmaker.md`,
//! section 7). A system embeds it, raises a shield when a village must leave the pool for a while,
//! drops it when the village attacks, and puts back the villages `release` returns; this component
//! knows only shields and their queues, not buckets or crowns.
//!
//! - Shields are FIFO queues of one duration each, so a queue's head expires first.
//! - A dropped shield leaves a stale entry, recognised by the village's own shield: an entry is
//!   live iff the village's shield is up and names that queue and sequence.
//!
//! Invariant (fuzzed in `paved::tests::matchmaker_system`): a village whose shield is up is the
//! live entry `seq` of queue `queue`, with `head <= seq < tail`.
//!
//! Storage, flat: `shield_queues`, `shield_entries`, `shields` (new names only,
//! `docs/architecture/upgrades.md`, "Storage layout discipline").

use starknet::ContractAddress;

/// The queue of the shield an attack gives its defender.
pub const QUEUE_ATTACK: u8 = 0;
/// The queue of a new village's initial shield.
pub const QUEUE_INITIAL: u8 = 1;
/// The attack shield: 8 hours from the attack's start (owner decisions, 2026-10-20 and 21).
pub const ATTACK_SHIELD: u64 = 8 * 3600;
/// The initial shield of a new village: 3 days, as in Clash of Clans (owner decision, 2026-10-21).
pub const INITIAL_SHIELD: u64 = 3 * 86400;

/// A village's shield: up until `until`, entry `seq` of queue `queue`. One felt: `queue` [0, 8) ·
/// `up` [8] · `seq` [64, 128) · `until` [128, 192).
#[derive(Copy, Drop, Serde, Debug, PartialEq, Default)]
pub struct Shield {
    pub queue: u8,
    pub up: bool,
    pub seq: u64,
    pub until: u64,
}

/// A shield queue: its entries are the sequences `head` to `tail - 1`. One felt: `head` [0, 64) ·
/// `tail` [64, 128).
#[derive(Copy, Drop, Serde, Debug, PartialEq, Default)]
pub struct Queue {
    pub head: u64,
    pub tail: u64,
}

const TWO_POW_8: u128 = 0x100;
const TWO_POW_64: u128 = 0x10000000000000000;
const TWO_POW_128: felt252 = 0x100000000000000000000000000000000;
const MASK_8: u128 = 0xff;
const MASK_64: u128 = 0xffffffffffffffff;

pub impl ShieldPacking of starknet::storage_access::StorePacking<Shield, felt252> {
    fn pack(value: Shield) -> felt252 {
        let up: u128 = if value.up {
            TWO_POW_8
        } else {
            0
        };
        let low: u128 = value.queue.into() + up + value.seq.into() * TWO_POW_64;
        let high: u128 = value.until.into();
        low.into() + high.into() * TWO_POW_128
    }

    fn unpack(value: felt252) -> Shield {
        let word: u256 = value.into();
        Shield {
            queue: (word.low & MASK_8).try_into().unwrap(),
            up: (word.low / TWO_POW_8) & 1 == 1,
            seq: (word.low / TWO_POW_64).try_into().unwrap(),
            until: word.high.try_into().unwrap(),
        }
    }
}

pub impl QueuePacking of starknet::storage_access::StorePacking<Queue, felt252> {
    fn pack(value: Queue) -> felt252 {
        let word: u128 = value.head.into() + value.tail.into() * TWO_POW_64;
        word.into()
    }

    fn unpack(value: felt252) -> Queue {
        let word: u256 = value.into();
        Queue {
            head: (word.low & MASK_64).try_into().unwrap(),
            tail: (word.low / TWO_POW_64).try_into().unwrap(),
        }
    }
}

#[starknet::interface]
pub trait IShieldable<TContractState> {
    fn shield(self: @TContractState, village: ContractAddress) -> Shield;
    fn queue(self: @TContractState, queue: u8) -> Queue;
    /// Queue `queue`'s entry at sequence `seq`, live while the village's shield names it.
    fn queue_entry(self: @TContractState, queue: u8, seq: u64) -> ContractAddress;
}

#[starknet::component]
pub mod ShieldableComponent {
    use starknet::ContractAddress;
    use starknet::storage::{Map, StorageMapReadAccess, StorageMapWriteAccess};
    use super::{IShieldable, QUEUE_ATTACK, QUEUE_INITIAL, Queue, Shield};

    pub mod errors {
        pub const UP: felt252 = 'Shields: already up';
        pub const DOWN: felt252 = 'Shields: not up';
    }

    #[storage]
    pub struct Storage {
        /// Shield queue `q`.
        pub shield_queues: Map<u8, Queue>,
        /// Queue `q`'s entry at sequence `n`.
        pub shield_entries: Map<(u8, u64), ContractAddress>,
        /// Each village's shield.
        pub shields: Map<ContractAddress, Shield>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        ShieldRaised: ShieldRaised,
        ShieldDropped: ShieldDropped,
        ShieldReleased: ShieldReleased,
    }

    /// A village shielded until `until`: queue 0 after an attack, 1 for a new village.
    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct ShieldRaised {
        #[key]
        pub village: ContractAddress,
        pub queue: u8,
        pub until: u64,
    }

    /// A shielded village attacked: its shield dropped before its end.
    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct ShieldDropped {
        #[key]
        pub village: ContractAddress,
    }

    /// A shield ended and was taken down.
    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct ShieldReleased {
        #[key]
        pub village: ContractAddress,
    }

    #[embeddable_as(ShieldableImpl)]
    pub impl Shieldable<
        TContractState, +HasComponent<TContractState>,
    > of IShieldable<ComponentState<TContractState>> {
        fn shield(self: @ComponentState<TContractState>, village: ContractAddress) -> Shield {
            self.shields.read(village)
        }

        fn queue(self: @ComponentState<TContractState>, queue: u8) -> Queue {
            self.shield_queues.read(queue)
        }

        fn queue_entry(
            self: @ComponentState<TContractState>, queue: u8, seq: u64,
        ) -> ContractAddress {
            self.shield_entries.read((queue, seq))
        }
    }

    #[generate_trait]
    pub impl InternalImpl<
        TContractState, +HasComponent<TContractState>,
    > of InternalTrait<TContractState> {
        fn is_up(self: @ComponentState<TContractState>, village: ContractAddress) -> bool {
            self.shields.read(village).up
        }

        /// Raises `village`'s shield until `until`, at the tail of queue `queue`. Every entry of a
        /// queue has the same duration, so the queue stays in expiry order.
        fn raise(
            ref self: ComponentState<TContractState>,
            village: ContractAddress,
            queue: u8,
            until: u64,
        ) {
            // [Check] Not shielded yet
            assert(!self.shields.read(village).up, errors::UP);
            // [Effect] Append to the queue
            let mut value = self.shield_queues.read(queue);
            self.shield_entries.write((queue, value.tail), village);
            self.shields.write(village, Shield { queue, up: true, seq: value.tail, until });
            value.tail += 1;
            self.shield_queues.write(queue, value);
            self.emit(ShieldRaised { village, queue, until });
        }

        /// Drops `village`'s shield before its end; its queue entry turns stale.
        fn lower(ref self: ComponentState<TContractState>, village: ContractAddress) {
            // [Check] Shielded
            assert(self.shields.read(village).up, errors::DOWN);
            // [Effect] Down; the entry is discarded when it reaches the head
            self.shields.write(village, Default::default());
            self.emit(ShieldDropped { village });
        }

        /// Takes down at most `max` shields that ended by `now`, earliest end first, across both
        /// queues, and returns their villages for the system to put back. Stale entries (dropped
        /// shields) are discarded on the way; at most `2 x max` entries are popped in all.
        fn release(
            ref self: ComponentState<TContractState>, now: u64, max: u32,
        ) -> Array<ContractAddress> {
            let mut released: Array<ContractAddress> = array![];
            let mut attack = self.shield_queues.read(QUEUE_ATTACK);
            let mut initial = self.shield_queues.read(QUEUE_INITIAL);
            let (attack_head, initial_head) = (attack.head, initial.head);
            let budget = 2 * max;
            let mut pops: u32 = 0;
            while released.len() < max {
                let first = self.live_head(QUEUE_ATTACK, ref attack, ref pops, budget);
                let second = self.live_head(QUEUE_INITIAL, ref initial, ref pops, budget);
                let (queue, village, shield) = match (first, second) {
                    (
                        Option::Some((a, sa)), Option::Some((b, sb)),
                    ) => {
                        if sb.until < sa.until {
                            (QUEUE_INITIAL, b, sb)
                        } else {
                            (QUEUE_ATTACK, a, sa)
                        }
                    },
                    (Option::Some((a, sa)), Option::None) => (QUEUE_ATTACK, a, sa),
                    (Option::None, Option::Some((b, sb))) => (QUEUE_INITIAL, b, sb),
                    (Option::None, Option::None) => { break; },
                };
                if shield.until > now || pops >= budget {
                    break;
                }
                pops += 1;
                if queue == QUEUE_ATTACK {
                    attack.head += 1;
                } else {
                    initial.head += 1;
                }
                self.shields.write(village, Default::default());
                self.emit(ShieldReleased { village });
                released.append(village);
            }
            if attack.head != attack_head {
                self.shield_queues.write(QUEUE_ATTACK, attack);
            }
            if initial.head != initial_head {
                self.shield_queues.write(QUEUE_INITIAL, initial);
            }
            released
        }
    }

    #[generate_trait]
    impl PrivateImpl<
        TContractState, +HasComponent<TContractState>,
    > of PrivateTrait<TContractState> {
        /// The first live entry of queue `queue` and its shield, popping stale entries while
        /// `pops` is under `budget`. None if the queue is empty or the budget is spent on stale
        /// entries.
        fn live_head(
            self: @ComponentState<TContractState>,
            queue: u8,
            ref value: Queue,
            ref pops: u32,
            budget: u32,
        ) -> Option<(ContractAddress, Shield)> {
            loop {
                if value.head == value.tail {
                    break Option::None;
                }
                let village = self.shield_entries.read((queue, value.head));
                let shield = self.shields.read(village);
                if shield.up && shield.queue == queue && shield.seq == value.head {
                    break Option::Some((village, shield));
                }
                if pops >= budget {
                    break Option::None;
                }
                pops += 1;
                value.head += 1;
            }
        }
    }
}
