// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts for Cairo v0.9.0 (presets/erc20.cairo)

/// # ERC20 Preset
///
/// The ERC20 contract offers basic functionality and provides a
/// fixed-supply mechanism for token distribution. The fixed supply is
/// set in the constructor.

pub use paved::mocks::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};
use starknet::ContractAddress;

#[starknet::interface]
pub trait IERC20Faucet<TState> {
    fn mint(ref self: TState);
    fn mint_to(ref self: TState, recipient: ContractAddress, amount: u256) -> bool;
    fn burn(ref self: TState, amount: u256) -> bool;
}

#[dojo::contract]
pub mod Token {
    use core::traits::TryInto;
    use paved::store::{Store, StoreImpl};
    use paved::mocks::erc20::erc20::ERC20Component;
    use starknet::{ContractAddress, get_caller_address};
    pub const FAUCET_AMOUNT: u256 = 1_000_000_000_000_000_000_000_000; // 1E6 * 1E18

    component!(path: ERC20Component, storage: erc20, event: ERC20Event);

    #[abi(embed_v0)]
    impl ERC20Impl = ERC20Component::ERC20Impl<ContractState>;
    #[abi(embed_v0)]
    impl ERC20MetadataImpl = ERC20Component::ERC20MetadataImpl<ContractState>;
    #[abi(embed_v0)]
    impl ERC20CamelOnlyImpl = ERC20Component::ERC20CamelOnlyImpl<ContractState>;
    pub impl InternalImpl = ERC20Component::InternalImpl<ContractState>;

    #[storage]
    struct Storage {
        #[substorage(v0)]
        erc20: ERC20Component::Storage
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        #[flat]
        ERC20Event: ERC20Component::Event
    }

    /// Sets the token `name` and `symbol`.
    /// Mints `fixed_supply` tokens to `recipient`.
    #[constructor]
    fn constructor(ref self: ContractState) {}

    #[external(v0)]
    fn mint(ref self: ContractState) {
        self.erc20._mint(get_caller_address(), FAUCET_AMOUNT);
        self.record_mint(FAUCET_AMOUNT);
    }

    #[external(v0)]
    fn mint_to(ref self: ContractState, recipient: ContractAddress, amount: u256) -> bool {
        self.erc20._mint(recipient, amount);
        self.record_mint(amount);
        true
    }

    #[external(v0)]
    fn burn(ref self: ContractState, amount: u256) -> bool {
        self.erc20._burn(get_caller_address(), amount);
        self.record_burn(amount);
        true
    }

    #[generate_trait]
    impl EconomyStateMirrorImpl of EconomyStateMirrorTrait {
        fn record_mint(ref self: ContractState, amount: u256) {
            let store: Store = StoreImpl::new(self.world(@"paved").dispatcher);
            let mut state = store.economy_state();
            let amount_felt: felt252 = amount.try_into().unwrap();
            state.last_supply += amount_felt;
            state.total_minted += amount_felt;
            store.set_economy_state(state);
        }

        fn record_burn(ref self: ContractState, amount: u256) {
            let store: Store = StoreImpl::new(self.world(@"paved").dispatcher);
            let mut state = store.economy_state();

            let amount_felt: felt252 = amount.try_into().unwrap();
            state.total_burned += amount_felt;

            let supply_u256: u256 = state.last_supply.try_into().unwrap();
            let remaining = if amount > supply_u256 {
                0_u256
            } else {
                supply_u256 - amount
            };
            state.last_supply = remaining.try_into().unwrap();

            store.set_economy_state(state);
        }
    }
}
