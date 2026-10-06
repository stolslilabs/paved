// Starknet imports

use paved::models::player::Player;
use starknet::ContractAddress;

#[starknet::interface]
pub trait IAccount<TContractState> {
    fn create(ref self: TContractState, name: felt252, master: ContractAddress);
    fn player(self: @TContractState, id: felt252) -> Player;
}

#[starknet::contract]
pub mod Account {
    // Component imports

    use paved::components::manageable::ManageableComponent;
    use paved::components::ownable::OwnableComponent;

    // Internal imports

    use paved::events::Event as PavedEvent;
    use paved::models::player::Player;
    use paved::store::{StoreImpl, StoreTrait};
    use starknet::ContractAddress;

    // Local imports

    use super::IAccount;

    // Components

    component!(path: ManageableComponent, storage: manageable, event: ManageableEvent);
    impl ManageableInternalImpl = ManageableComponent::InternalImpl<ContractState>;
    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);
    #[abi(embed_v0)]
    impl OwnableImpl = OwnableComponent::OwnableImpl<ContractState>;
    impl OwnableInternalImpl = OwnableComponent::InternalImpl<ContractState>;

    // Storage

    #[storage]
    struct Storage {
        #[substorage(v0)]
        manageable: ManageableComponent::Storage,
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
    }

    // Events

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        #[flat]
        PavedEvent: PavedEvent,
        #[flat]
        ManageableEvent: ManageableComponent::Event,
        #[flat]
        OwnableEvent: OwnableComponent::Event,
    }

    // Constructor

    #[constructor]
    fn constructor(ref self: ContractState, owner: ContractAddress) {
        // [Effect] Initialize components
        self.ownable.initialize(owner);
    }

    // Implementations

    #[abi(embed_v0)]
    impl AccountImpl of IAccount<ContractState> {
        fn create(ref self: ContractState, name: felt252, master: ContractAddress) {
            // [Effect] Create a player
            self.manageable.create(name, master);
        }

        fn player(self: @ContractState, id: felt252) -> Player {
            // [Return] Player, zero if not registered
            StoreImpl::new().player(id)
        }
    }
}
