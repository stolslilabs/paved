// Starknet imports

use starknet::ContractAddress;

#[starknet::interface]
trait IAccount<TContractState> {
    fn create(self: @TContractState, name: felt252);
}

#[dojo::contract]
mod Account {
    // Starknet imports

    use starknet::ContractAddress;

    // Component imports

    use paved::components::manageable::ManageableComponent;

    // Local imports

    use super::IAccount;

    // Components

    component!(path: ManageableComponent, storage: manageable, event: ManageableEvent);
    impl ManageableInternalImpl = ManageableComponent::InternalImpl<ContractState>;

    // Storage

    #[storage]
    struct Storage {
        #[substorage(v0)]
        manageable: ManageableComponent::Storage,
    }

    // Events

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        ManageableEvent: ManageableComponent::Event,
    }

    // Implementations

    #[abi(embed_v0)]
    impl AccountImpl of IAccount<ContractState> {
        fn create(self: @ContractState, name: felt252) {
            // [Effect] Create a player
            self.manageable.create(self.world(), name);
        }
    }
}
