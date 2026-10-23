//! Crownable component: the crown counts of the matchmaker (#639,
//! `docs/architecture/matchmaker.md`, section 6). A system embeds it and settles its attacks
//! through it; the curves and the settlement's arithmetic are the pure `paved::matchmaker::crowns`.
//! This component knows only crown counts, not buckets or shields: the system makes a village's
//! place follow its crowns.
//!
//! Since #643 (`docs/architecture/pvp-attacks.md`, section 5) it also holds the 0-star cost of an
//! open attack: `hold` takes it from the attacker's count at the attack's start, `release` gives it
//! back before the settlement, so walking away from an attack loses it.
//!
//! Storage, flat: `crown_counts`, `crown_holds` (new names only, `docs/architecture/upgrades.md`,
//! "Storage layout discipline").

use starknet::ContractAddress;

#[starknet::interface]
pub trait ICrownable<TContractState> {
    fn crowns(self: @TContractState, village: ContractAddress) -> u32;
    /// The crowns held from `village` during its open attack (0: none).
    fn held(self: @TContractState, village: ContractAddress) -> u32;
}

#[starknet::component]
pub mod CrownableComponent {
    use core::cmp::min;
    use paved::matchmaker::crowns::{Settlement, settle};
    use starknet::ContractAddress;
    use starknet::storage::{Map, StorageMapReadAccess, StorageMapWriteAccess};
    use super::ICrownable;

    pub mod errors {
        pub const ALREADY_HELD: felt252 = 'Crowns: already held';
    }

    #[storage]
    pub struct Storage {
        /// Each village's crowns (0 for a new one).
        pub crown_counts: Map<ContractAddress, u32>,
        /// The crowns held from an attacker during its open attack (#643).
        pub crown_holds: Map<ContractAddress, u32>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        CrownsSettled: CrownsSettled,
        CrownsSet: CrownsSet,
        CrownsHeld: CrownsHeld,
        CrownsReleased: CrownsReleased,
    }

    /// An attack settled: its stars, the offer and the cost fixed at the draw, the crowns that
    /// moved and both counts after it.
    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct CrownsSettled {
        #[key]
        pub attacker: ContractAddress,
        #[key]
        pub defender: ContractAddress,
        pub stars: u8,
        pub offer: u8,
        pub cost: u8,
        pub gained: u32,
        pub lost: u32,
        pub attacker_crowns: u32,
        pub defender_crowns: u32,
    }

    /// A village's crowns set (an NPC placed, or the season reset of #644).
    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct CrownsSet {
        #[key]
        pub village: ContractAddress,
        pub crowns: u32,
    }

    /// An attack started: `held` crowns taken from the attacker's count (its 0-star cost, at most
    /// its crowns), and its count after it.
    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct CrownsHeld {
        #[key]
        pub village: ContractAddress,
        pub held: u32,
        pub crowns: u32,
    }

    /// The hold given back before the attack's settlement, and the count after it.
    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct CrownsReleased {
        #[key]
        pub village: ContractAddress,
        pub released: u32,
        pub crowns: u32,
    }

    #[embeddable_as(CrownableImpl)]
    pub impl Crownable<
        TContractState, +HasComponent<TContractState>,
    > of ICrownable<ComponentState<TContractState>> {
        fn crowns(self: @ComponentState<TContractState>, village: ContractAddress) -> u32 {
            self.crown_counts.read(village)
        }

        fn held(self: @ComponentState<TContractState>, village: ContractAddress) -> u32 {
            self.crown_holds.read(village)
        }
    }

    #[generate_trait]
    pub impl InternalImpl<
        TContractState, +HasComponent<TContractState>,
    > of InternalTrait<TContractState> {
        fn crowns_of(self: @ComponentState<TContractState>, village: ContractAddress) -> u32 {
            self.crown_counts.read(village)
        }

        fn held_of(self: @ComponentState<TContractState>, village: ContractAddress) -> u32 {
            self.crown_holds.read(village)
        }

        /// Holds `cost` crowns of `village`, at most its count: taken from its count until
        /// `release`. Returns its count after it. A hold already up stays (`'Crowns: already
        /// held'`).
        fn hold(
            ref self: ComponentState<TContractState>, village: ContractAddress, cost: u8,
        ) -> u32 {
            assert(self.crown_holds.read(village) == 0, errors::ALREADY_HELD);
            let crowns = self.crown_counts.read(village);
            let held = min(cost.into(), crowns);
            if held == 0 {
                return crowns;
            }
            let after = crowns - held;
            self.crown_counts.write(village, after);
            self.crown_holds.write(village, held);
            self.emit(CrownsHeld { village, held, crowns: after });
            after
        }

        /// Gives `village`'s hold back to its count (nothing if none), at most what the count can
        /// still hold under `u32`'s bound (the count may have grown meanwhile: an attacker's
        /// village can be attacked, and win a 0-star cost, during its own attack). Returns its
        /// count after it.
        fn release(ref self: ComponentState<TContractState>, village: ContractAddress) -> u32 {
            let held = self.crown_holds.read(village);
            let crowns = self.crown_counts.read(village);
            if held == 0 {
                return crowns;
            }
            let room = 0xffffffff - crowns;
            let back = min(held, room);
            let after = crowns + back;
            self.crown_counts.write(village, after);
            self.crown_holds.write(village, 0);
            self.emit(CrownsReleased { village, released: back, crowns: after });
            after
        }

        fn set(ref self: ComponentState<TContractState>, village: ContractAddress, crowns: u32) {
            self.crown_counts.write(village, crowns);
            self.emit(CrownsSet { village, crowns });
        }

        /// Settles an attack's `stars` at the `offer` and `cost` fixed at the draw
        /// (`crowns::settle`). An NPC defender's crowns never change.
        fn settle(
            ref self: ComponentState<TContractState>,
            attacker: ContractAddress,
            defender: ContractAddress,
            offer: u8,
            cost: u8,
            stars: u8,
            npc: bool,
        ) -> Settlement {
            let outcome = settle(
                self.crown_counts.read(attacker),
                self.crown_counts.read(defender),
                offer,
                cost,
                stars,
                npc,
            );
            self.crown_counts.write(attacker, outcome.attacker);
            if !npc {
                self.crown_counts.write(defender, outcome.defender);
            }
            self
                .emit(
                    CrownsSettled {
                        attacker,
                        defender,
                        stars,
                        offer,
                        cost,
                        gained: outcome.gained,
                        lost: outcome.lost,
                        attacker_crowns: outcome.attacker,
                        defender_crowns: outcome.defender,
                    },
                );
            outcome
        }
    }
}
