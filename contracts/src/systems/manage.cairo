// Starknet imports

use starknet::ContractAddress;

// Dojo imports

use dojo::world::IWorldDispatcher;

#[starknet::interface]
trait IManage<TContractState> {
    fn create(self: @TContractState, world: IWorldDispatcher, name: felt252, order: u8);
    fn rename(self: @TContractState, world: IWorldDispatcher, name: felt252);
    fn reorder(self: @TContractState, world: IWorldDispatcher, order: u8);
    fn buy(self: @TContractState, world: IWorldDispatcher, amount: u8);
    fn claim(self: @TContractState, world: IWorldDispatcher, game_id: u32);
}

#[starknet::contract]
mod manage {
    // Core imports

    use debug::PrintTrait;

    // Starknet imports

    use starknet::ContractAddress;
    use starknet::info::{get_caller_address, get_block_timestamp};

    // Dojo imports

    use dojo::world::{IWorldDispatcher, IWorldDispatcherTrait};

    // Internal imports

    use stolsli::store::{Store, StoreImpl};
    use stolsli::models::game::{Game, GameImpl, GameAssert};
    use stolsli::models::player::{Player, PlayerImpl, PlayerAssert};
    use stolsli::models::builder::{Builder, BuilderImpl, BuilderAssert};

    // Local imports

    use super::IManage;

    // Storage

    #[storage]
    struct Storage {}

    // Implementations

    #[abi(embed_v0)]
    impl ManageImpl of IManage<ContractState> {
        fn create(self: @ContractState, world: IWorldDispatcher, name: felt252, order: u8) {
            // [Setup] Datastore
            let store: Store = StoreImpl::new(world);

            // [Check] Player not already exists
            let caller = get_caller_address();
            let player = store.player(caller.into());
            player.assert_not_exists();

            // [Effect] Create a new player
            let player = PlayerImpl::new(caller.into(), name, order);
            store.set_player(player);
        }

        fn rename(self: @ContractState, world: IWorldDispatcher, name: felt252) {
            // [Setup] Datastore
            let store: Store = StoreImpl::new(world);

            // [Check] Player exists
            let caller = get_caller_address();
            let mut player = store.player(caller.into());
            player.assert_exists();

            // [Effect] Rename
            player.rename(name);

            // [Effect] Update player
            store.set_player(player);
        }

        fn reorder(self: @ContractState, world: IWorldDispatcher, order: u8) {
            // [Setup] Datastore
            let store: Store = StoreImpl::new(world);

            // [Check] Player exists
            let caller = get_caller_address();
            let mut player = store.player(caller.into());
            player.assert_exists();

            // [Effect] Reorder
            player.reorder(order);

            // [Effect] Update player
            store.set_player(player);
        }

        fn buy(self: @ContractState, world: IWorldDispatcher, amount: u8) {
            // [Setup] Datastore
            let store: Store = StoreImpl::new(world);

            // [Check] Player exists
            let caller = get_caller_address();
            let mut player = store.player(caller.into());
            player.assert_exists();

            // [Effect] Buy
            player.buy(amount);

            // [Effect] Update player
            store.set_player(player);
        }

        fn claim(self: @ContractState, world: IWorldDispatcher, game_id: u32) {
            // [Setup] Datastore
            let mut store: Store = StoreImpl::new(world);

            // [Check] Game exists
            let mut game = store.game(game_id);
            game.assert_exists();

            // [Check] Game is over
            let time = get_block_timestamp();
            game.assert_over(time);

            // [Check] Builder exists
            let caller = get_caller_address();
            let mut builder = store.builder(game, caller.into());
            builder.assert_exists();

            // [Effect] Claim points
            let _claimable = builder.claim(game, ref store);
            // TODO: Process transfers

            // [Effect] Update builder
            store.set_builder(builder);
        }
    }
}