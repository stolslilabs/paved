// Starknet imports

use starknet::ContractAddress;

// Interfaces

#[starknet::interface]
pub trait IERC20<TContractState> {
    fn transfer(ref self: TContractState, recipient: ContractAddress, amount: u256) -> bool;
    fn transferFrom(
        ref self: TContractState, sender: ContractAddress, recipient: ContractAddress, amount: u256
    ) -> bool;
    fn burn(ref self: TContractState, amount: u256) -> bool;
    fn mint_to(ref self: TContractState, recipient: ContractAddress, amount: u256) -> bool;
}

// Component

#[starknet::component]
pub mod PayableComponent {
    // Starknet imports

    use starknet::ContractAddress;
    use starknet::get_contract_address;

    // Dojo imports

    use dojo::world::IWorldDispatcher;

    // Internal imports

    use super::{IERC20Dispatcher, IERC20DispatcherTrait};

    // Errors

    mod errors {
        pub const ERC20_REWARD_FAILED: felt252 = 'ERC20: reward failed';
        pub const ERC20_PAY_FAILED: felt252 = 'ERC20: pay failed';
        pub const ERC20_REFUND_FAILED: felt252 = 'ERC20: refund failed';
        pub const ERC20_BURN_FAILED: felt252 = 'ERC20: burn failed';
        pub const INVALID_SPLIT: felt252 = 'Payable: invalid split';
    }

    // Storage

    #[storage]
    struct Storage {
        token_address: ContractAddress,
        treasury_address: ContractAddress,
    }

    // Events

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {}

    #[generate_trait]
    pub impl InternalImpl<
        TContractState, +HasComponent<TContractState>
    > of InternalTrait<TContractState> {
        fn initialize(
            ref self: ComponentState<TContractState>,
            world: IWorldDispatcher,
            token_address: ContractAddress
        ) {
            // [Storage] Set token address
            self.token_address.write(token_address);
            self.treasury_address.write(get_contract_address());
        }

        fn pay(self: @ComponentState<TContractState>, caller: ContractAddress, amount: u256) {
            // [Check] Amount is not null, otherwise return
            if amount == 0 {
                return;
            }

            // [Interaction] Transfer
            let contract = get_contract_address();
            let erc20 = IERC20Dispatcher { contract_address: self.token_address.read() };
            let status = erc20.transferFrom(caller, contract, amount);

            // [Check] Status
            assert(status, errors::ERC20_PAY_FAILED);
        }

        fn refund(self: @ComponentState<TContractState>, recipient: ContractAddress, amount: u256) {
            // [Check] Amount is not null, otherwise return
            if amount == 0 {
                return;
            }

            // [Interaction] Transfer
            let erc20 = IERC20Dispatcher { contract_address: self.token_address.read() };
            let status = erc20.transfer(recipient, amount);

            // [Check] Status
            assert(status, errors::ERC20_REFUND_FAILED);
        }

        fn mint(self: @ComponentState<TContractState>, recipient: ContractAddress, amount: u256) {
            // [Check] Amount is not null, otherwise return
            if amount == 0 {
                return;
            }

            // [Interaction] Mint reward to player
            let erc20 = IERC20Dispatcher { contract_address: self.token_address.read() };
            let status = erc20.mint_to(recipient, amount);

            // [Check] Status
            assert(status, errors::ERC20_REWARD_FAILED);
        }

        fn burn_from_contract(self: @ComponentState<TContractState>, amount: u256) {
            // [Check] Amount is not null, otherwise return
            if amount == 0 {
                return;
            }

            // [Interaction] Burn from this contract's balance
            let erc20 = IERC20Dispatcher { contract_address: self.token_address.read() };
            let status = erc20.burn(amount);

            // [Check] Status
            assert(status, errors::ERC20_BURN_FAILED);
        }

        fn pay_split(
            self: @ComponentState<TContractState>,
            caller: ContractAddress,
            total: u256,
            team_amount: u256,
            burn_amount: u256,
        ) {
            // [Check] Split validity must be explicit.
            assert(team_amount + burn_amount <= total, errors::INVALID_SPLIT);

            // [Interaction] Pull total entry amount from player.
            self.pay(caller, total);

            // [Interaction] Route team share to treasury if needed.
            let treasury = self.treasury_address.read();
            let contract = get_contract_address();
            if team_amount != 0 && treasury != contract {
                let erc20 = IERC20Dispatcher { contract_address: self.token_address.read() };
                let status = erc20.transfer(treasury, team_amount);
                assert(status, errors::ERC20_REFUND_FAILED);
            }

            // [Interaction] Burn configured portion.
            self.burn_from_contract(burn_amount);
        }
    }
}
