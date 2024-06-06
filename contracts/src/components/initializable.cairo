// Starknet imports

use starknet::ContractAddress;

// Interfaces

#[starknet::interface]
trait IDojoInit<ContractState> {
    fn dojo_init(self: @ContractState);
}

// Component

#[starknet::component]
mod InitializableComponent {
    // Starknet imports

    use starknet::ContractAddress;

    // Dojo imports

    use dojo::world;
    use dojo::world::IWorldDispatcher;
    use dojo::world::IWorldDispatcherTrait;
    use dojo::world::IWorldProvider;
    use dojo::world::IDojoResourceProvider;

    // Internal imports

    use paved::constants;

    // Local imports

    use super::IDojoInit;

    // Errors

    mod errors {
        const CONTRACT_ALREADY_INITIALIZED: felt252 = 'Contract is already initialized';
    }

    // Storage

    #[storage]
    struct Storage {
        initialized: bool,
        world: IWorldDispatcher,
    }

    // Events

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {}

    // Implementations

    #[embeddable_as(WorldProviderImpl)]
    impl WorldProvider<
        TContractState, +HasComponent<TContractState>
    > of IWorldProvider<ComponentState<TContractState>> {
        fn world(self: @ComponentState<TContractState>) -> IWorldDispatcher {
            self.world.read()
        }
    }

    #[embeddable_as(DojoInitImpl)]
    impl DojoInit<
        TContractState, +HasComponent<TContractState>
    > of IDojoInit<ComponentState<TContractState>> {
        fn dojo_init(self: @ComponentState<TContractState>) {}
    }

    #[generate_trait]
    impl InternalImpl<
        TContractState, +HasComponent<TContractState>
    > of InternalTrait<TContractState> {
        fn _initialize(ref self: ComponentState<TContractState>, world: ContractAddress) {
            // [Check] Contract is not initialized
            assert(!self.initialized.read(), errors::CONTRACT_ALREADY_INITIALIZED);
            // [Effect] Initialize contract
            self.initialized.write(true);
            // [Effect] Set world
            self.world.write(IWorldDispatcher { contract_address: world });
        }
    }
}
