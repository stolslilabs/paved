// Starknet imports

use starknet::ContractAddress;

#[starknet::interface]
trait IAccount<TContractState> {
    fn create(self: @TContractState, name: felt252, master: ContractAddress);
}

#[dojo::contract]
mod Account {
    // Starknet imports

    use starknet::ContractAddress;
    use starknet::info::{
        get_block_timestamp, get_block_number, get_caller_address, get_contract_address
    };

    // Component imports

    use paved::components::emitter::EmitterComponent;
    use paved::components::manageable::ManageableComponent;

    // Local imports

    use super::IAccount;

    // Components

    component!(path: EmitterComponent, storage: emitter, event: EmitterEvent);
    impl EmitterImpl = EmitterComponent::EmitterImpl<ContractState>;
    component!(path: ManageableComponent, storage: manageable, event: ManageableEvent);
    impl ManageableInternalImpl = ManageableComponent::InternalImpl<ContractState>;

    // Storage

    #[storage]
    struct Storage {
        #[substorage(v0)]
        emitter: EmitterComponent::Storage,
        #[substorage(v0)]
        manageable: ManageableComponent::Storage,
    }

    // Events

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        EmitterEvent: EmitterComponent::Event,
        #[flat]
        ManageableEvent: ManageableComponent::Event,
    }

    // Implementations

    #[abi(embed_v0)]
    impl AccountImpl of IAccount<ContractState> {
        fn create(self: @ContractState, name: felt252, master: ContractAddress) {
            // [Effect] Create a player
            self.manageable.create(self.world(), name, master);
        }
    }
}
