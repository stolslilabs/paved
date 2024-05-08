// Starknet imports

use starknet::ContractAddress;

// Dojo imports

use dojo::world::IWorldDispatcher;

#[starknet::interface]
trait IAccount<TContractState> {
    fn initialize(ref self: TContractState, world: ContractAddress);
    fn create(
        self: @TContractState, world: IWorldDispatcher, name: felt252, master: ContractAddress
    );
}

#[starknet::contract]
mod account {
    // Starknet imports

    use starknet::ContractAddress;
    use starknet::info::{
        get_block_timestamp, get_block_number, get_caller_address, get_contract_address
    };

    // Dojo imports

    use dojo::world;
    use dojo::world::IWorldDispatcher;
    use dojo::world::IWorldDispatcherTrait;
    use dojo::world::IDojoResourceProvider;

    // Component imports

    use paved::components::emitter::EmitterComponent;
    use paved::components::initializable::InitializableComponent;
    use paved::components::ownable::OwnableComponent;
    use paved::components::manageable::ManageableComponent;

    // Local imports

    use super::IAccount;

    // Components

    component!(path: EmitterComponent, storage: emitter, event: EmitterEvent);
    impl EmitterImpl = EmitterComponent::EmitterImpl<ContractState>;
    component!(path: InitializableComponent, storage: initializable, event: InitializableEvent);
    #[abi(embed_v0)]
    impl WorldProviderImpl =
        InitializableComponent::WorldProviderImpl<ContractState>;
    impl InitializableInternalImpl = InitializableComponent::InternalImpl<ContractState>;
    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);
    #[abi(embed_v0)]
    impl OwnableImpl = OwnableComponent::OwnableImpl<ContractState>;
    impl OwnableInternalImpl = OwnableComponent::InternalImpl<ContractState>;
    component!(path: ManageableComponent, storage: manageable, event: ManageableEvent);
    impl ManageableInternalImpl = ManageableComponent::InternalImpl<ContractState>;

    // Storage

    #[storage]
    struct Storage {
        #[substorage(v0)]
        emitter: EmitterComponent::Storage,
        #[substorage(v0)]
        initializable: InitializableComponent::Storage,
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
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
        InitializableEvent: InitializableComponent::Event,
        #[flat]
        OwnableEvent: OwnableComponent::Event,
        #[flat]
        ManageableEvent: ManageableComponent::Event,
    }

    // Implementations

    #[abi(embed_v0)]
    impl DojoResourceProviderImpl of IDojoResourceProvider<ContractState> {
        fn dojo_resource(self: @ContractState) -> felt252 {
            'account'
        }
    }

    #[abi(embed_v0)]
    impl AccountImpl of IAccount<ContractState> {
        fn initialize(ref self: ContractState, world: ContractAddress) {
            // [Effect] Initialize contract
            self.initializable._initialize(world);
            // [Effect] Initialize ownable
            let caller = get_caller_address();
            self.ownable.initializer(caller);
        }

        fn create(
            self: @ContractState, world: IWorldDispatcher, name: felt252, master: ContractAddress
        ) {
            // [Effect] Create a player
            self.manageable._create(world, name, master);
        }
    }
}
