// Starknet imports

use starknet::ContractAddress;

// Interfaces

/// What `Challenge`'s purchase calls on the entry token. Since D-20 nothing here transfers out of
/// the game contract: the prize's `refund` (and `pay`) left with it.

#[starknet::interface]
pub trait IERC20<TContractState> {
    fn transferFrom(
        ref self: TContractState, sender: ContractAddress, recipient: ContractAddress, amount: u256,
    ) -> bool;
}

// Component

#[starknet::component]
pub mod PayableComponent {
    // Starknet imports

    use starknet::ContractAddress;

    // Storage

    #[storage]
    struct Storage {
        token_address: ContractAddress,
    }

    // Events

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {}

    #[generate_trait]
    pub impl InternalImpl<
        TContractState, +HasComponent<TContractState>,
    > of InternalTrait<TContractState> {
        fn initialize(ref self: ComponentState<TContractState>, token_address: ContractAddress) {
            // [Storage] Set token address
            self.token_address.write(token_address);
        }
    }
}
