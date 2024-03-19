// Starknet imports

use starknet::ContractAddress;

// Dojo imports

use dojo::world::IWorldDispatcher;

// Internal imports

use paved::types::orientation::Orientation;
use paved::types::direction::Direction;
use paved::types::role::Role;
use paved::types::spot::Spot;

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

    use paved::store::StoreTrait;
    use core::debug::PrintTrait;

    // Starknet imports

    use starknet::ContractAddress;
    use starknet::info::{
        get_block_timestamp, get_block_number, get_caller_address, get_contract_address, get_tx_info
    };

    // Dojo imports

    use dojo::world;
    use dojo::world::IWorldDispatcher;
    use dojo::world::IWorldDispatcherTrait;
    use dojo::world::IWorldProvider;
    use dojo::world::IDojoResourceProvider;

    // Internal imports

    use paved::constants::WORLD;
    use paved::store::{Store, StoreImpl};
    use paved::events::{Built, Scored};
    use paved::models::game::{Game, GameImpl, GameAssert};
    use paved::models::player::{Player, PlayerImpl, PlayerAssert};
    use paved::models::team::{Team, TeamImpl};
    use paved::models::builder::{Builder, BuilderImpl, BuilderAssert};
    use paved::models::tile::{Tile, TilePosition, TileImpl};
    use paved::types::alliance::{Alliance, AllianceImpl};
    use paved::types::order::{Order, OrderImpl};
    use paved::types::orientation::Orientation;
    use paved::types::direction::Direction;
    use paved::types::role::Role;
    use paved::types::spot::Spot;
    use paved::types::plan::Plan;
    use paved::types::mode::Mode;
    use paved::types::deck::Deck;

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
    impl DojoResourceProviderImpl of IDojoResourceProvider<ContractState> {
        fn dojo_resource(self: @ContractState) -> felt252 {
            'host'
        }
    }

    #[abi(embed_v0)]
    impl WorldProviderImpl of IWorldProvider<ContractState> {
        fn world(self: @ContractState) -> IWorldDispatcher {
            IWorldDispatcher { contract_address: WORLD() }
        }
    }

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
            let deck = if Mode::Solo == mode.into() {
                Deck::Base
            } else {
                Deck::Enhanced
            };
            let mut game = GameImpl::new(game_id, name, time, duration, mode, deck);

            // [Effect] Join the game
            let builder_index = game.join();

            // [Effect] Create a new builder
            let builder = BuilderImpl::new(game.id, player.id, builder_index, player.order);
            store.set_builder(builder);

            // [Effect] Start the game if solo mode
            if Mode::Solo == game.mode.into() {
                // [Effect] Start game
                let tile = game.start(time);

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
            game.ready(builder.index, status);
            store.set_game(game);
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
            store.swap_builders(ref game, ref builder, ref host);
            store.set_game(game);
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
            store.remove_builder(ref game, ref builder);

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
            store.remove_builder(ref game, ref kicked);

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
            game.assert_startable();

            // [Effect] Store game
            let time = get_block_timestamp();
            let tile = game.start(time);
            store.set_game(game);

            // [Effect] Store tile
            store.set_tile(tile);
        }
    }
}
