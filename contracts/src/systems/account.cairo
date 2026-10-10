// Starknet imports

use paved::models::player::Player;
use starknet::ContractAddress;

#[starknet::interface]
pub trait IAccount<TContractState> {
    fn create(ref self: TContractState, name: felt252, master: ContractAddress);
    fn player(self: @TContractState, id: felt252) -> Player;
    /// Sets the `Economy` that `Daily` pays into, once. The owner only.
    fn set_economy(ref self: TContractState, economy: ContractAddress);
    /// The `Economy` of the paid Daily games (zero until set): `Lobby` reads it at spawn and at
    /// game over.
    fn economy(self: @TContractState) -> ContractAddress;
    /// Sets the `Collection` that `Lobby` mints the games to, once. The owner only.
    fn set_collection(ref self: TContractState, collection: ContractAddress);
    /// The `Collection` of the game NFTs (zero until set): `Lobby` reads it at spawn.
    fn collection(self: @TContractState) -> ContractAddress;
}

#[starknet::contract]
pub mod Account {
    // Component imports

    use core::num::traits::Zero;
    use paved::components::manageable::ManageableComponent;
    use paved::components::ownable::OwnableComponent;

    // Internal imports

    use paved::events::Event as PavedEvent;
    use paved::models::player::Player;
    use paved::store::{StoreImpl, StoreTrait};
    use starknet::ContractAddress;
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};

    // Local imports

    use super::IAccount;

    // Errors

    pub mod errors {
        pub const ECONOMY_SET: felt252 = 'Account: economy already set';
        pub const ZERO_ECONOMY: felt252 = 'Account: economy is zero';
        pub const COLLECTION_SET: felt252 = 'Account: collection already set';
        pub const ZERO_COLLECTION: felt252 = 'Account: collection is zero';
    }

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
        /// The `Economy` of the paid Daily games; written once by the owner.
        economy: ContractAddress,
        /// The `Collection` of the game NFTs; written once by the owner.
        collection: ContractAddress,
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
        EconomySet: EconomySet,
        CollectionSet: CollectionSet,
    }

    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct EconomySet {
        pub economy: ContractAddress,
    }

    #[derive(Drop, Debug, PartialEq, starknet::Event)]
    pub struct CollectionSet {
        pub collection: ContractAddress,
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

        fn set_economy(ref self: ContractState, economy: ContractAddress) {
            // [Check] The owner, once, a real address
            self.ownable.assert_only_owner();
            assert(self.economy.read().is_zero(), errors::ECONOMY_SET);
            assert(economy.is_non_zero(), errors::ZERO_ECONOMY);
            // [Effect] Set it for good
            self.economy.write(economy);
            self.emit(EconomySet { economy });
        }

        fn economy(self: @ContractState) -> ContractAddress {
            self.economy.read()
        }

        fn set_collection(ref self: ContractState, collection: ContractAddress) {
            // [Check] The owner, once, a real address
            self.ownable.assert_only_owner();
            assert(self.collection.read().is_zero(), errors::COLLECTION_SET);
            assert(collection.is_non_zero(), errors::ZERO_COLLECTION);
            // [Effect] Set it for good
            self.collection.write(collection);
            self.emit(CollectionSet { collection });
        }

        fn collection(self: @ContractState) -> ContractAddress {
            self.collection.read()
        }
    }
}
