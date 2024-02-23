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
trait IPlay<TContractState> {
    fn draw(self: @TContractState, world: IWorldDispatcher, game_id: u32);
    fn discard(self: @TContractState, world: IWorldDispatcher, game_id: u32,);
    fn build(
        self: @TContractState,
        world: IWorldDispatcher,
        game_id: u32,
        tile_id: u32,
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

    use stolsli::models::game::AssertTrait;
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
    }

    // Implementations

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

            // [Effect] Player draw fron his deck
            player.draw();

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
            let game = store.game(game_id);
            game.assert_exists();

            // [Check] Game has started
            game.assert_started();

            // [Check] Game is not over
            let time = get_block_timestamp();
            game.assert_not_over(time);

            // [Check] Player exists
            let caller = get_caller_address();
            let player = store.player(caller.into());
            player.assert_exists();

            // [Check] Builder exists
            let mut builder = store.builder(game, caller.into());
            assert(builder.is_non_zero(), errors::BUILDER_NOT_FOUND);

            // [Effect] Builder discard a tile
            builder.discard();

            // [Effect] Update builder
            store.set_builder(builder);
        }

        fn build(
            self: @ContractState,
            world: IWorldDispatcher,
            game_id: u32,
            tile_id: u32,
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
            let mut tile = store.tile(game, tile_id);
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
            store.set_game(game);

            // [Event] Emit events
            emit!(
                world,
                Built {
                    game_id: game_id,
                    tile_id: tile_id,
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
                        event.tile_id = tile_id;
                        event.x = x;
                        event.y = y;
                        emit!(world, event)
                    },
                    Option::None => { break; }
                }
            }
        }
    }
}
