// Starknet imports

use starknet::ContractAddress;

// Dojo imports

use dojo::world::IWorldDispatcher;

// Internal imports

use stolsli::types::orientation::Orientation;
use stolsli::types::direction::Direction;
use stolsli::types::role::Role;
use stolsli::types::spot::Spot;

#[starknet::interface]
trait IHost<TContractState> {
    fn create(
        self: @TContractState, world: IWorldDispatcher, name: felt252, duration: u64, mode: u8
    ) -> u32;
    fn rename(self: @TContractState, world: IWorldDispatcher, game_id: u32, name: felt252);
    fn update(self: @TContractState, world: IWorldDispatcher, game_id: u32, duration: u64);
    fn join(self: @TContractState, world: IWorldDispatcher, game_id: u32);
    fn ready(self: @TContractState, world: IWorldDispatcher, game_id: u32, status: bool);
    fn transfer(self: @TContractState, world: IWorldDispatcher, game_id: u32, player_id: felt252);
    fn leave(self: @TContractState, world: IWorldDispatcher, game_id: u32,);
    fn kick(self: @TContractState, world: IWorldDispatcher, game_id: u32, player_id: felt252);
    fn delete(self: @TContractState, world: IWorldDispatcher, game_id: u32,);
    fn start(self: @TContractState, world: IWorldDispatcher, game_id: u32,);
}

#[starknet::contract]
mod host {
    // Core imports

    use stolsli::store::StoreTrait;
    use debug::PrintTrait;

    // Starknet imports

    use starknet::ContractAddress;
    use starknet::info::{
        get_block_timestamp, get_block_number, get_caller_address, get_contract_address, get_tx_info
    };

    // Dojo imports

    use dojo::world::{IWorldDispatcher, IWorldDispatcherTrait};

    // Internal imports

    use stolsli::store::{Store, StoreImpl};
    use stolsli::events::{Built, Scored};
    use stolsli::models::game::{Game, GameImpl, GameAssert};
    use stolsli::models::player::{Player, PlayerImpl, PlayerAssert};
    use stolsli::models::team::{Team, TeamImpl};
    use stolsli::models::builder::{Builder, BuilderImpl, BuilderAssert};
    use stolsli::models::tile::{Tile, TilePosition, TileImpl};
    use stolsli::types::alliance::{Alliance, AllianceImpl};
    use stolsli::types::order::{Order, OrderImpl};
    use stolsli::types::orientation::Orientation;
    use stolsli::types::direction::Direction;
    use stolsli::types::role::Role;
    use stolsli::types::spot::Spot;
    use stolsli::types::plan::Plan;
    use stolsli::types::mode::Mode;

    // Local imports

    use super::IHost;

    // Storage

    #[storage]
    struct Storage {}

    // Events

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        Built: Built,
        Scored: Scored,
    }

    // Implementations

    #[abi(embed_v0)]
    impl HostImpl of IHost<ContractState> {
        fn create(
            self: @ContractState, world: IWorldDispatcher, name: felt252, duration: u64, mode: u8,
        ) -> u32 {
            // [Setup] Datastore
            let store: Store = StoreImpl::new(world);

            // [Check] Player exists
            let caller = get_caller_address();
            let player = store.player(caller.into());
            player.assert_exists();

            // [Effect] Create game
            let game_id = world.uuid() + 1;
            let time = get_block_timestamp();
            let mut game = GameImpl::new(game_id, name, time, duration, mode);

            // [Effect] Join the game
            let builder_index = game.join();

            // [Effect] Create a new builder
            let builder = BuilderImpl::new(game.id, player.id, builder_index, player.order);
            store.set_builder(builder);

            // [Effect] Start the game if solo mode
            if Mode::Solo == game.mode.into() {
                // [Effect] Create starter tile
                let tile_id = game.add_tile();
                let mut tile = TileImpl::new(game_id, tile_id, 0, Plan::RFFFRFCFR);
                tile.orientation = Orientation::South.into();

                // [Effect] Start game
                game.start(time);

                // [Effect] Store tile
                store.set_tile(tile);
            }

            // [Effect] Store game
            store.set_game(game);

            game_id
        }

        fn rename(self: @ContractState, world: IWorldDispatcher, game_id: u32, name: felt252) {
            // [Setup] Datastore
            let store: Store = StoreImpl::new(world);

            // [Check] Player exists
            let caller = get_caller_address();
            let player = store.player(caller.into());
            player.assert_exists();

            // [Check] Game exists
            let mut game = store.game(game_id);
            game.assert_exists();

            // [Check] Builder exists
            let builder = store.builder(game, player.id);
            builder.assert_exists();

            // [Check] Game has not yet started
            game.assert_not_started();

            // [Check] Player is the host
            builder.assert_host();

            // [Effect] Set name
            game.rename(name);

            // [Effect] Store game
            store.set_game(game);
        }

        fn update(self: @ContractState, world: IWorldDispatcher, game_id: u32, duration: u64) {
            // [Setup] Datastore
            let store: Store = StoreImpl::new(world);

            // [Check] Player exists
            let caller = get_caller_address();
            let player = store.player(caller.into());
            player.assert_exists();

            // [Check] Game exists
            let mut game = store.game(game_id);
            game.assert_exists();

            // [Check] Builder exists
            let builder = store.builder(game, player.id);
            builder.assert_exists();

            // [Check] Game has not yet started
            game.assert_not_started();

            // [Check] Player is the host
            builder.assert_host();

            // [Effect] Set duration
            let time = get_block_timestamp();
            game.update(time, duration);

            // [Effect] Store game
            store.set_game(game);
        }

        fn join(self: @ContractState, world: IWorldDispatcher, game_id: u32) {
            // [Setup] Datastore
            let store: Store = StoreImpl::new(world);

            // [Check] Player exists
            let caller = get_caller_address();
            let player = store.player(caller.into());
            player.assert_exists();

            // [Check] Game exists
            let mut game = store.game(game_id);
            game.assert_exists();

            // [Check] Game has not yet started
            game.assert_not_started();

            // [Check] Builder not already exists
            let builder = store.builder(game, player.id);
            builder.assert_not_exists();

            // [Effect] Join the game
            let builder_index = game.join();
            store.set_game(game);

            // [Effect] Create a new builder
            let builder = BuilderImpl::new(game.id, player.id, builder_index, player.order);
            store.set_builder(builder);
        }

        fn ready(self: @ContractState, world: IWorldDispatcher, game_id: u32, status: bool) {
            // [Setup] Datastore
            let store: Store = StoreImpl::new(world);

            // [Check] Player exists
            let caller = get_caller_address();
            let player = store.player(caller.into());
            player.assert_exists();

            // [Check] Game exists
            let mut game = store.game(game_id);
            game.assert_exists();

            // [Check] Game has not yet started
            game.assert_not_started();

            // [Check] Builder exists
            let builder = store.builder(game, player.id);
            builder.assert_exists();

            // [Effect] Ready the builder
            let mut builder = store.builder(game, player.id);
            builder.ready(game, status);
            store.set_builder(builder);
        }

        fn transfer(
            self: @ContractState, world: IWorldDispatcher, game_id: u32, player_id: felt252
        ) {
            // [Setup] Datastore
            let store: Store = StoreImpl::new(world);

            // [Check] Game exists
            let mut game = store.game(game_id);
            game.assert_exists();

            // [Check] Player exists
            let caller = get_caller_address();
            let player = store.player(caller.into());
            player.assert_exists();

            // [Check] Builder exists
            let mut builder = store.builder(game, player.id);
            builder.assert_exists();

            // [Check] Buidler host exists
            let mut host = store.builder(game, player_id);
            host.assert_exists();

            // [Check] Game has not yet started
            game.assert_not_started();

            // [Check] Player is the host
            builder.assert_host();

            // [Effect] Swap builders
            store.swap_builders(ref builder, ref host);
        }

        fn leave(self: @ContractState, world: IWorldDispatcher, game_id: u32,) {
            // [Setup] Datastore
            let store: Store = StoreImpl::new(world);

            // [Check] Game exists
            let mut game = store.game(game_id);
            game.assert_exists();

            // [Check] Player exists
            let caller = get_caller_address();
            let player = store.player(caller.into());
            player.assert_exists();

            // [Check] Builder exists
            let mut builder = store.builder(game, player.id);
            builder.assert_exists();

            // [Check] Game has not yet started
            game.assert_not_started();

            // [Check] Player is not the host
            builder.assert_not_host();

            // [Effect] Delete builder
            store.remove_builder(game, ref builder);

            // [Effect] Leave the game
            game.leave();
            store.set_game(game);
        }

        fn kick(self: @ContractState, world: IWorldDispatcher, game_id: u32, player_id: felt252) {
            // [Setup] Datastore
            let store: Store = StoreImpl::new(world);

            // [Check] Game exists
            let mut game = store.game(game_id);
            game.assert_exists();

            // [Check] Player exists
            let caller = get_caller_address();
            let player = store.player(caller.into());
            player.assert_exists();

            // [Check] Builder exists
            let builder = store.builder(game, player.id);
            builder.assert_exists();

            // [Check] Player is the host
            builder.assert_host();

            // [Check] Game has not yet started
            game.assert_not_started();

            // [Check] Kicked's builder exists
            let mut kicked = store.builder(game, player_id);
            kicked.assert_exists();

            // [Check] Kicked is not the host
            kicked.assert_not_host();

            // [Effect] Delete builder
            store.remove_builder(game, ref kicked);

            // [Effect] Leave the game
            game.leave();
            store.set_game(game);
        }

        fn delete(self: @ContractState, world: IWorldDispatcher, game_id: u32,) {
            // [Setup] Datastore
            let store: Store = StoreImpl::new(world);

            // [Check] Game exists
            let mut game = store.game(game_id);
            game.assert_exists();

            // [Check] Player exists
            let caller = get_caller_address();
            let player = store.player(caller.into());
            player.assert_exists();

            // [Check] Builder exists
            let builder = store.builder(game, player.id);
            builder.assert_exists();

            // [Check] Game has not yet started
            game.assert_not_started();

            // [Check] Player is the host
            builder.assert_host();

            // [Check] Game is deletable
            game.assert_deletable();

            // [Effect] Delete builder
            let mut builder = store.builder(game, player.id);
            builder.remove();
            store.set_builder(builder);

            // [Effect] Delete the game
            game.delete();
            store.set_game(game);
        }

        fn start(self: @ContractState, world: IWorldDispatcher, game_id: u32,) {
            // [Setup] Datastore
            let store: Store = StoreImpl::new(world);

            // [Check] Game exists
            let mut game = store.game(game_id);
            game.assert_exists();

            // [Check] Player exists
            let caller = get_caller_address();
            let player = store.player(caller.into());
            player.assert_exists();

            // [Check] Builder exists
            let builder = store.builder(game, player.id);
            builder.assert_exists();

            // [Check] Game has not yet started
            game.assert_not_started();

            // [Check] Player is the host
            builder.assert_host();

            // [Check] Game startable
            let mut builders = store.builders(game);
            game.assert_startable(ref builders);

            // [Effect] Create starter tile
            let tile_id = game.add_tile();
            let mut tile = TileImpl::new(game_id, tile_id, 0, Plan::RFFFRFCFR);
            tile.orientation = Orientation::South.into();

            // [Effect] Store game
            let time = get_block_timestamp();
            game.start(time);
            store.set_game(game);

            // [Effect] Store tile
            store.set_tile(tile);
        }
    }
}
