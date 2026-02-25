use core::traits::TryInto;

use paved::models::economy::{EconomyConfig, EconomyConfigTrait, EconomyStateTrait, EconomyState};
use paved::types::mode::Mode;

#[starknet::interface]
pub trait IEconomy<TContractState> {
    fn configure(
        self: @TContractState,
        target_mode: u8,
        target_fixed: felt252,
        target_a: felt252,
        target_b: felt252,
        target_t0: u64,
        team_bps: u16,
        burn_bps: u16,
        max_multiplier_fp: u32,
        fp_scale: u32,
        manual_target_override: bool,
        target_override: felt252,
    );
    fn get_config(self: @TContractState) -> EconomyConfig;
    fn get_state(self: @TContractState) -> EconomyState;
    fn preview_multiplier(self: @TContractState, time: u64) -> (felt252, felt252, u32);
    fn snapshot_for_spawn(self: @TContractState, mode: Mode) -> (felt252, felt252, u32);
    fn record_mint(self: @TContractState, amount: felt252);
    fn record_burn(self: @TContractState, amount: felt252);
}

#[dojo::contract]
pub mod Economy {
    use core::traits::TryInto;
    use starknet::get_block_timestamp;

    use paved::helpers::economy_curve::compute_multiplier_fp;
    use paved::models::economy::{
        EconomyConfig, EconomyConfigTrait, EconomyState, EconomyStateTrait
    };
    use paved::store::{StoreImpl, Store};
    use paved::types::mode::Mode;

    use super::IEconomy;

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {}

    #[abi(embed_v0)]
    impl EconomyImpl of IEconomy<ContractState> {
        fn configure(
            self: @ContractState,
            target_mode: u8,
            target_fixed: felt252,
            target_a: felt252,
            target_b: felt252,
            target_t0: u64,
            team_bps: u16,
            burn_bps: u16,
            max_multiplier_fp: u32,
            fp_scale: u32,
            manual_target_override: bool,
            target_override: felt252,
        ) {
            let store: Store = StoreImpl::new(self.world(@"paved").dispatcher);
            let config = EconomyConfig {
                id: 1,
                target_mode,
                target_fixed,
                target_a,
                target_b,
                target_t0,
                team_bps,
                burn_bps,
                max_multiplier_fp,
                fp_scale,
                manual_target_override,
                target_override,
            };
            config.validate();
            store.set_economy_config(config);
        }

        fn get_config(self: @ContractState) -> EconomyConfig {
            let store: Store = StoreImpl::new(self.world(@"paved").dispatcher);
            store.economy_config()
        }

        fn get_state(self: @ContractState) -> EconomyState {
            let store: Store = StoreImpl::new(self.world(@"paved").dispatcher);
            store.economy_state()
        }

        fn preview_multiplier(self: @ContractState, time: u64) -> (felt252, felt252, u32) {
            let store: Store = StoreImpl::new(self.world(@"paved").dispatcher);
            let config = store.economy_config();
            config.validate();
            let state = store.economy_state();
            let supply_u256: u256 = state.last_supply.try_into().unwrap();
            let target_u256: u256 = config.target_at(time);
            let multiplier_fp = compute_multiplier_fp(supply_u256, target_u256);
            (supply_u256.try_into().unwrap(), target_u256.try_into().unwrap(), multiplier_fp,)
        }

        fn snapshot_for_spawn(self: @ContractState, mode: Mode) -> (felt252, felt252, u32) {
            let _ = mode;
            self.preview_multiplier(get_block_timestamp())
        }

        fn record_mint(self: @ContractState, amount: felt252) {
            let store: Store = StoreImpl::new(self.world(@"paved").dispatcher);
            let mut economy = store.economy_state();
            economy.total_minted += amount;
            economy.last_supply += amount;
            store.set_economy_state(economy);
        }

        fn record_burn(self: @ContractState, amount: felt252) {
            let store: Store = StoreImpl::new(self.world(@"paved").dispatcher);
            let mut economy = store.economy_state();
            economy.total_burned += amount;

            let burn_u256: u256 = amount.try_into().unwrap();
            let supply_u256: u256 = economy.last_supply.try_into().unwrap();
            let remaining = if burn_u256 > supply_u256 {
                0_u256
            } else {
                supply_u256 - burn_u256
            };
            economy.last_supply = remaining.try_into().unwrap();

            store.set_economy_state(economy);
        }
    }
}
