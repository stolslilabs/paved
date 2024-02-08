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
    fn create(
        self: @TContractState,
        world: IWorldDispatcher,
        endtime: u64,
        points_cap: u32,
        tiles_cap: u32
    ) -> u32;
    fn spawn(
        self: @TContractState, world: IWorldDispatcher, game_id: u32, name: felt252, order: u8
    );
    fn buy(self: @TContractState, world: IWorldDispatcher, game_id: u32,);
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
    fn claim(self: @TContractState, world: IWorldDispatcher, game_id: u32);
    fn finalize(self: @TContractState, world: IWorldDispatcher, game_id: u32);
}

#[starknet::contract]
mod play {
    // Core imports

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
    use stolsli::models::game::{Game, GameImpl, AssertImpl as GameAssertImpl};
    use stolsli::models::team::{Team, TeamImpl};
    use stolsli::models::builder::{Builder, BuilderImpl};
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
        const BUILDER_ALREADY_EXISTS: felt252 = 'Play: Builder already exists';
        const GAME_NOT_FOUND: felt252 = 'Play: Game not found';
        const BUILDER_NOT_FOUND: felt252 = 'Play: Builder not found';
        const TILE_NOT_FOUND: felt252 = 'Play: Tile not found';
        const INVALID_ORDER: felt252 = 'Play: Invalid order';
        const POSITION_ALREADY_TAKEN: felt252 = 'Play: Position already taken';
        const SPOT_ALREADY_TAKEN: felt252 = 'Play: Spot already taken';
        const SPOT_EMPTY: felt252 = 'Play: Spot empty';
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

    // Implemnentations

    #[external(v0)]
    impl PlayImpl of IPlay<ContractState> {
        fn create(
            self: @ContractState,
            world: IWorldDispatcher,
            endtime: u64,
            points_cap: u32,
            tiles_cap: u32
        ) -> u32 {
            // [Check] Owner
            // TODO: Access control

            // [Setup] Datastore
            let store: Store = StoreImpl::new(world);

            // [Effect] Create game
            let game_id = world.uuid() + 1;
            let time = get_block_timestamp();
            let mut game = GameImpl::new(game_id, time, endtime, points_cap, tiles_cap);

            // [Effect] Create starter tile
            let tile_id = game.add_tile();
            let mut tile = TileImpl::new(game_id, tile_id, 0, Plan::RFFFRFCFR);
            tile.orientation = Orientation::South.into();

            // [Effect] Store game
            store.set_game(game);

            // [Effect] Store tile
            store.set_tile(tile);

            game_id
        }

        fn spawn(
            self: @ContractState, world: IWorldDispatcher, game_id: u32, name: felt252, order: u8
        ) {
            // [Setup] Datastore
            let store: Store = StoreImpl::new(world);

            // [Check] Game exists
            let game = store.game(game_id);
            game.assert_exists();

            // [Check] Game is not over
            let time = get_block_timestamp();
            game.assert_not_over(time);

            // [Check] Builder not already exists
            let caller = get_caller_address();
            let builder = store.builder(game, caller.into());
            assert(builder.is_zero(), errors::BUILDER_ALREADY_EXISTS);

            // [Check] Order is valid
            assert(Order::None != order.into(), errors::INVALID_ORDER);

            // [Effect] Create a new builder
            let builder = BuilderImpl::new(game.id, caller.into(), name, order);
            store.set_builder(builder);

            // [Effect] Create team if not already exists
            let team = store.team(game, order.into());
            if team.is_zero() {
                let team = TeamImpl::new(game.id, order);
                store.set_team(team);
            }
        }

        fn buy(self: @ContractState, world: IWorldDispatcher, game_id: u32) {
            // [Setup] Datastore
            let store: Store = StoreImpl::new(world);

            // [Check] Game exists
            let game = store.game(game_id);
            game.assert_exists();

            // [Check] Game is not over
            let time = get_block_timestamp();
            game.assert_not_over(time);

            // [Check] Builder exists
            let caller = get_caller_address();
            let mut builder = store.builder(game, caller.into());
            assert(builder.is_non_zero(), errors::BUILDER_NOT_FOUND);

            // [Effect] Builder buy a new tile
            builder.buy();

            // [Effect] Update builder
            store.set_builder(builder);
        }

        fn draw(self: @ContractState, world: IWorldDispatcher, game_id: u32) {
            // [Setup] Datastore
            let store: Store = StoreImpl::new(world);

            // [Check] Game exists
            let mut game = store.game(game_id);
            game.assert_exists();

            // [Check] Game is not over
            let time = get_block_timestamp();
            game.assert_not_over(time);

            // [Check] Builder exists
            let caller = get_caller_address();
            let mut builder = store.builder(game, caller.into());
            assert(builder.is_non_zero(), errors::BUILDER_NOT_FOUND);

            // [Effect] Builder spawn a new tile
            // TODO: use VRF
            let seed = get_tx_info().unbox().transaction_hash;
            let (tile_id, plan) = game.draw_plan(seed.into());
            let tile = builder.draw(tile_id, plan);

            // [Effect] Store tile
            store.set_tile(tile);

            // [Effect] Update builder
            store.set_builder(builder);

            // [Effect] Update game
            store.set_game(game);
        }

        fn discard(self: @ContractState, world: IWorldDispatcher, game_id: u32) {
            // [Setup] Datastore
            let store: Store = StoreImpl::new(world);

            // [Check] Game exists
            let game = store.game(game_id);
            game.assert_exists();

            // [Check] Game is not over
            let time = get_block_timestamp();
            game.assert_not_over(time);

            // [Check] Builder exists
            let caller = get_caller_address();
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

            // [Check] Game is not over
            let time = get_block_timestamp();
            game.assert_not_over(time);

            // [Check] Builder exists
            let caller = get_caller_address();
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

            // [Effect] Assessment
            let mut scoreds = game.assess(tile, ref store);

            // [Effect] Update game
            store.set_game(game);

            // [Event] Emit events
            let built = Built {
                game_id: game_id,
                tile_id: tile_id,
                x: x,
                y: y,
                builder_id: builder.id,
                builder_name: builder.name,
            };
            emit!(world, built);
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
            assert(builder.is_non_zero(), errors::BUILDER_NOT_FOUND);

            // [Check] Member of the winning alliance
            let winner = AllianceImpl::winner(game, ref store);
            let team = store.team(game, builder.order.into());
            let alliance: Alliance = team.alliance.into();
            assert(alliance == winner, errors::NOTHING_TO_CLAIM);

            // [Effect] Claim points
            let claimable = builder.claim(game, team, ref store);
            // TODO: Process transfers

            // [Effect] Update builder
            store.set_builder(builder);
        }

        fn finalize(self: @ContractState, world: IWorldDispatcher, game_id: u32) {
            // [Setup] Datastore
            let mut store: Store = StoreImpl::new(world);

            // [Check] Game exists
            let mut game = store.game(game_id);
            game.assert_exists();

            // [Check] Game is over
            let time = get_block_timestamp();
            game.assert_over(time);

            // [Effect] Finalize game
            game.finalize(time);

            // [Effect] Update game
            store.set_game(game);
        }
    }
}
