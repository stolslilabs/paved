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
trait IPlay<TContractState> {
    fn draw(self: @TContractState, world: IWorldDispatcher, game_id: u32);
    fn discard(self: @TContractState, world: IWorldDispatcher, game_id: u32,);
    fn build(
        self: @TContractState,
        world: IWorldDispatcher,
        game_id: u32,
        orientation: Orientation,
        x: u32,
        y: u32,
        role: Role,
        spot: Spot,
    );
}

#[starknet::contract]
mod play {
    // Core imports

    use paved::models::game::GameTrait;
    use paved::models::game::AssertTrait;
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

    use paved::systems::WORLD;
    use paved::store::{Store, StoreImpl};
    use paved::events::{Built, Scored, Discarded, GameOver};
    use paved::models::game::{Game, GameImpl, GameAssert};
    use paved::models::player::{Player, PlayerImpl, PlayerAssert};
    use paved::models::team::{Team, TeamImpl};
    use paved::models::builder::{Builder, BuilderImpl, ZeroableBuilderImpl, BuilderAssert};
    use paved::models::tile::{Tile, TilePosition, TileImpl};
    use paved::types::alliance::{Alliance, AllianceImpl};
    use paved::types::mode::Mode;
    use paved::types::order::{Order, OrderImpl};
    use paved::types::orientation::Orientation;
    use paved::types::direction::Direction;
    use paved::types::role::Role;
    use paved::types::spot::Spot;
    use paved::types::plan::Plan;
    use paved::types::tournament::TournamentImpl;

    // Local imports

    use super::IPlay;

    // Errors

    mod errors {
        const BUILDER_NOT_FOUND: felt252 = 'Play: Builder not found';
        const TILE_NOT_FOUND: felt252 = 'Play: Tile not found';
        const POSITION_ALREADY_TAKEN: felt252 = 'Play: Position already taken';
        const NOTHING_TO_CLAIM: felt252 = 'Play: Nothing to claim';
    }

    // Storage

    #[storage]
    struct Storage {}

    // Events

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        Built: Built,
        Scored: Scored,
        Discarded: Discarded,
        GameOver: GameOver,
    }

    // Implementations

    #[abi(embed_v0)]
    impl DojoResourceProviderImpl of IDojoResourceProvider<ContractState> {
        fn dojo_resource(self: @ContractState) -> felt252 {
            'play'
        }
    }

    #[abi(embed_v0)]
    impl WorldProviderImpl of IWorldProvider<ContractState> {
        fn world(self: @ContractState) -> IWorldDispatcher {
            IWorldDispatcher { contract_address: WORLD() }
        }
    }

    #[abi(embed_v0)]
    impl PlayImpl of IPlay<ContractState> {
        fn draw(self: @ContractState, world: IWorldDispatcher, game_id: u32) {
            // [Setup] Datastore
            let store: Store = StoreImpl::new(world);

            // [Check] Game exists
            let mut game = store.game(game_id);
            game.assert_exists();

            // [Check] Game has started
            game.assert_started();

            // [Check] Game is not over
            let time = get_block_timestamp();
            game.assert_not_over(time);

            // [Check] Player exists
            let caller = get_caller_address();
            let mut player = store.player(caller.into());
            player.assert_exists();

            // [Check] Builder exists
            let mut builder = store.builder(game, caller.into());
            assert(builder.is_non_zero(), errors::BUILDER_NOT_FOUND);

            // [Effect] Player draw from his deck
            // TODO: Enable for the release
            // player.draw();

            // [Effect] Builder spawn a new tile
            // TODO: use VRF
            let seed = get_tx_info().unbox().transaction_hash;
            let (tile_id, plan) = game.draw_plan(seed.into());
            let tile = builder.reveal(tile_id, plan);

            // [Effect] Store tile
            store.set_tile(tile);

            // [Effect] Update builder
            store.set_builder(builder);

            // [Effect] Update player
            store.set_player(player);

            // [Effect] Update game
            store.set_game(game);
        }

        fn discard(self: @ContractState, world: IWorldDispatcher, game_id: u32) {
            // [Setup] Datastore
            let store: Store = StoreImpl::new(world);

            // [Check] Game exists
            let mut game = store.game(game_id);
            game.assert_exists();

            // [Check] Game has started
            game.assert_started();

            // [Check] Game is not over
            let time = get_block_timestamp();
            game.assert_not_over(time);

            // [Check] Player exists
            let caller = get_caller_address();
            let mut player = store.player(caller.into());
            player.assert_exists();

            // [Check] Builder exists
            let mut builder = store.builder(game, caller.into());
            assert(builder.is_non_zero(), errors::BUILDER_NOT_FOUND);

            // [Check] Tile exists
            let tile = store.tile(game, builder.tile_id);
            assert(tile.is_non_zero(), errors::TILE_NOT_FOUND);

            // [Effect] Builder discard a tile
            let malus = builder.discard(ref game, ref player);

            // [Effect] Update builder
            store.set_builder(builder);

            // [Effect] Update player
            store.set_player(player);

            // [Effect] Update game
            game.assess_over();
            store.set_game(game);

            // [Event] Emit events
            emit!(
                world,
                Discarded {
                    game_id: game.id,
                    tile_id: tile.id,
                    player_id: player.id,
                    player_name: player.name,
                    order_id: builder.order,
                    points: malus,
                },
            );

            // [Event] Emit game over event for solo games if over
            if Mode::Solo == game.mode.into() && game.is_over(time) {
                let tournament_id = TournamentImpl::compute_id(time);
                emit!(
                    world,
                    GameOver {
                        game_id: game.id,
                        tournament_id: tournament_id,
                        game_score: game.score,
                        player_id: player.id,
                        player_name: player.name,
                        player_master: player.master,
                    }
                );
            }
        }

        fn build(
            self: @ContractState,
            world: IWorldDispatcher,
            game_id: u32,
            orientation: Orientation,
            x: u32,
            y: u32,
            role: Role,
            spot: Spot,
        ) {
            // [Setup] Datastore
            let mut store: Store = StoreImpl::new(world);

            // [Check] Game exists
            let mut game = store.game(game_id);
            game.assert_exists();

            // [Check] Game has started
            game.assert_started();

            // [Check] Game is not over
            let time = get_block_timestamp();
            game.assert_not_over(time);

            // [Check] Player exists
            let caller = get_caller_address();
            let mut player = store.player(caller.into());
            player.assert_exists();

            // [Check] Builder exists
            let mut builder = store.builder(game, caller.into());
            assert(builder.is_non_zero(), errors::BUILDER_NOT_FOUND);

            // [Check] Tile exists
            let mut tile = store.tile(game, builder.tile_id);
            assert(tile.is_non_zero(), errors::TILE_NOT_FOUND);

            // [Check] Position not already taken
            let tile_position = store.tile_position(game, x, y);
            assert(tile_position.is_zero(), errors::POSITION_ALREADY_TAKEN);

            // [Effect] Build tile
            let mut neighbors = store.neighbors(game, x, y);
            builder.build(ref tile, orientation, x, y, ref neighbors);
            player.pave();

            // [Check] Character to place
            if role != Role::None && spot != Spot::None {
                // [Check] Structure is idle
                game.assert_structure_idle(tile, spot, ref store);

                // [Effect] Place character
                let character = builder.place(role, ref tile, spot);

                // [Effect] Update character
                store.set_character(character);
            }

            // [Effect] Update tile
            store.set_tile(tile);

            // [Effect] Update builder
            store.set_builder(builder);

            // [Effect] Update player
            store.set_player(player);

            // [Effect] Assessment
            let mut scoreds = game.assess(tile, ref store);

            // [Effect] Update game
            game.assess_over();
            store.set_game(game);

            // [Event] Emit events
            emit!(
                world,
                Built {
                    game_id: game.id,
                    tile_id: tile.id,
                    x: x,
                    y: y,
                    player_id: player.id,
                    player_name: player.name,
                }
            );
            loop {
                match scoreds.pop_front() {
                    Option::Some(scored) => {
                        let mut event = scored;
                        event.tile_id = tile.id;
                        event.x = x;
                        event.y = y;
                        emit!(world, event)
                    },
                    Option::None => { break; }
                };
            };

            // [Event] Emit game over event for solo games if over
            if Mode::Solo == game.mode.into() && game.is_over(time) {
                let tournament_id = TournamentImpl::compute_id(time);
                emit!(
                    world,
                    GameOver {
                        game_id: game.id,
                        tournament_id: tournament_id,
                        game_score: game.score,
                        player_id: player.id,
                        player_name: player.name,
                        player_master: player.master,
                    }
                );
            }
        }
    }
}
