//! Crownable component: the crown counts of the matchmaker (#639,
//! `docs/architecture/matchmaker.md`, section 6). A system embeds it and settles its attacks
//! through it; the curves and the settlement's arithmetic are the pure `paved::matchmaker::crowns`.
//! This component knows only crown counts, not buckets or shields: the system makes a village's
//! place follow its crowns.
//!
//! Storage, flat: `crown_counts` (a new name only, `docs/architecture/upgrades.md`, "Storage layout
//! discipline").

use starknet::ContractAddress;

#[starknet::interface]
pub trait ICrownable<TContractState> {
    fn crowns(self: @TContractState, village: ContractAddress) -> u32;
}

#[starknet::component]
pub mod CrownableComponent {
    use paved::matchmaker::crowns::{Settlement, settle};
    use starknet::ContractAddress;
    use starknet::storage::{Map, StorageMapReadAccess, StorageMapWriteAccess};
    use super::ICrownable;

    #[storage]
    pub struct Storage {
        /// Each village's crowns (0 for a new one).
        pub crown_counts: Map<ContractAddress, u32>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        CrownsSettled: CrownsSettled,
        CrownsSet: CrownsSet,
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

    #[embeddable_as(CrownableImpl)]
    pub impl Crownable<
        TContractState, +HasComponent<TContractState>,
    > of ICrownable<ComponentState<TContractState>> {
        fn crowns(self: @ComponentState<TContractState>, village: ContractAddress) -> u32 {
            self.crown_counts.read(village)
        }
    }

    #[generate_trait]
    pub impl InternalImpl<
        TContractState, +HasComponent<TContractState>,
    > of InternalTrait<TContractState> {
        fn crowns_of(self: @ComponentState<TContractState>, village: ContractAddress) -> u32 {
            self.crown_counts.read(village)
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
