// Starknet imports

use starknet::ContractAddress;

// Dojo imports

use dojo::world::IWorldDispatcher;

#[starknet::interface]
trait IManage<TContractState> {
    fn initialize(ref self: TContractState, world: ContractAddress);
    fn create(
        self: @TContractState, world: IWorldDispatcher, name: felt252, master: ContractAddress
    );
}

#[starknet::contract]
mod manage {
    // Core imports

    use core::debug::PrintTrait;

    // Starknet imports

    use starknet::ContractAddress;
    use starknet::info::{get_caller_address, get_block_timestamp};

    // Dojo imports

    use dojo::world;
    use dojo::world::IWorldDispatcher;
    use dojo::world::IWorldDispatcherTrait;
    use dojo::world::IWorldProvider;
    use dojo::world::IDojoResourceProvider;

    // Internal imports

    use paved::constants::WORLD;
    use paved::store::{Store, StoreImpl};
    use paved::models::game::{Game, GameImpl, GameAssert};
    use paved::models::player::{Player, PlayerImpl, PlayerAssert};
    use paved::models::builder::{Builder, BuilderImpl, BuilderAssert};

    // Local imports

    use super::IManage;

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

    // Implementations

    #[abi(embed_v0)]
    impl DojoResourceProviderImpl of IDojoResourceProvider<ContractState> {
        fn dojo_resource(self: @ContractState) -> felt252 {
            'manage'
        }
    }

    #[abi(embed_v0)]
    impl WorldProviderImpl of IWorldProvider<ContractState> {
        fn world(self: @ContractState) -> IWorldDispatcher {
            self.world.read()
        }
    }

    #[abi(embed_v0)]
    impl ManageImpl of IManage<ContractState> {
        fn initialize(ref self: ContractState, world: ContractAddress) {
            // [Check] Contract is not initialized
            assert(!self.initialized.read(), errors::CONTRACT_ALREADY_INITIALIZED);
            // [Effect] Initialize contract
            self.initialized.write(true);
            // [Effect] Set world
            self.world.write(IWorldDispatcher { contract_address: world });
        }

        fn create(
            self: @ContractState, world: IWorldDispatcher, name: felt252, master: ContractAddress
        ) {
            // [Setup] Datastore
            let store: Store = StoreImpl::new(world);

            // [Check] Player not already exists
            let caller = get_caller_address();
            let player = store.player(caller.into());
            player.assert_not_exists();

            // [Effect] Create a new player
            let player = PlayerImpl::new(caller.into(), name, master.into());
            store.set_player(player);
        }
    }
}
