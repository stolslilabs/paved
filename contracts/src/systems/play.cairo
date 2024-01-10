// Starknet imports

use starknet::ContractAddress;

// Dojo imports

use dojo::world::IWorldDispatcher;

// Internal imports

use stolsli::types::orientation::Orientation;

#[starknet::interface]
trait IPlay<TContractState> {
    fn initialize(self: @TContractState, world: IWorldDispatcher) -> u32;
    fn create(
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
        y: u32
    );
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
    use stolsli::models::game::{Game, GameImpl};
    use stolsli::models::builder::{Builder, BuilderImpl};
    use stolsli::models::tile::{Tile, TilePosition, TileImpl};
    use stolsli::types::order::Order;
    use stolsli::types::orientation::Orientation;
    use stolsli::types::plan::Plan;

    // Local imports

    use super::IPlay;

    // Errors

    mod errors {
        const ALREADY_INITIALIZED: felt252 = 'Play: Already initialized';
        const BUILDER_ALREADY_EXISTS: felt252 = 'Play: Builder already exists';
        const GAME_NOT_FOUND: felt252 = 'Play: Game not found';
        const BUILDER_NOT_FOUND: felt252 = 'Play: Builder not found';
        const TILE_NOT_FOUND: felt252 = 'Play: Tile not found';
        const INVALID_ORDER: felt252 = 'Play: Invalid order';
    }

    // Storage

    #[storage]
    struct Storage {
        initialized: bool,
    }

    // Implemnentations

    #[external(v0)]
    impl PlayImpl of IPlay<ContractState> {
        fn initialize(self: @ContractState, world: IWorldDispatcher) -> u32 {
            // [Check] Not already initialized
            // TODO: Remove this check when we implement seasonal games
            // TODO: Access control
            assert(!self.initialized.read(), errors::ALREADY_INITIALIZED);

            // [Setup] Datastore
            let store: Store = StoreImpl::new(world);

            // [Effect] Create game
            let game_id = world.uuid();
            let mut game = GameImpl::new(game_id);

            // [Effect] Create starter tile
            let tile_id = game.add_tile();
            let mut tile = TileImpl::new(game_id, tile_id, 0, Plan::RFFFFRFFCFFRF);
            tile.orientation = Orientation::South.into();

            // [Effect] Store game
            store.set_game(game);

            // [Effect] Store tile
            store.set_tile(tile);

            game_id
        }

        fn create(
            self: @ContractState, world: IWorldDispatcher, game_id: u32, name: felt252, order: u8
        ) {
            // [Setup] Datastore
            let store: Store = StoreImpl::new(world);

            // [Check] Builder not already exists
            let game = store.game(game_id);
            let caller = get_caller_address();
            let builder = store.builder(game, caller);
            assert(builder.name.is_zero(), errors::BUILDER_ALREADY_EXISTS);

            // [Check] Order is valid
            assert(Order::None != order.into(), errors::INVALID_ORDER);

            // [Effect] Create a new builder
            let builder = BuilderImpl::new(game.id, caller.into(), name, order);
            store.set_builder(builder);
        }

        fn buy(self: @ContractState, world: IWorldDispatcher, game_id: u32) {
            // [Setup] Datastore
            let store: Store = StoreImpl::new(world);

            // [Check] Game exists
            let game = store.game(game_id);
            assert(game.id == game_id, errors::GAME_NOT_FOUND);

            // [Check] Builder exists
            let caller = get_caller_address();
            let mut builder = store.builder(game, caller);
            assert(builder.name != 0, errors::BUILDER_NOT_FOUND);

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
            assert(game.id == game_id, errors::GAME_NOT_FOUND);

            // [Check] Builder exists
            let caller = get_caller_address();
            let mut builder = store.builder(game, caller);
            assert(builder.name != 0, errors::BUILDER_NOT_FOUND);

            // [Effect] Builder spawn a new tile
            // Todo: use VRF
            let seed = get_tx_info().unbox().transaction_hash;
            let tile_id = game.add_tile();
            let tile = builder.draw(seed.into(), tile_id);

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
            assert(game.id == game_id, errors::GAME_NOT_FOUND);

            // [Check] Builder exists
            let caller = get_caller_address();
            let mut builder = store.builder(game, caller);
            assert(builder.name != 0, errors::BUILDER_NOT_FOUND);

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
            y: u32
        ) {
            // [Setup] Datastore
            let store: Store = StoreImpl::new(world);

            // [Check] Game exists
            let game = store.game(game_id);
            assert(game.id == game_id, errors::GAME_NOT_FOUND);

            // [Check] Builder exists
            let caller = get_caller_address();
            let mut builder = store.builder(game, caller);
            assert(builder.name != 0, errors::BUILDER_NOT_FOUND);

            // [Check] Tile exists
            let mut tile = store.tile(game, tile_id);
            assert(tile.builder_id != 0, errors::TILE_NOT_FOUND);

            // [Effect] Build tile
            let mut neighbors = store.neighbors(game, x, y);
            builder.build(ref tile, orientation, x, y, ref neighbors);

            // [Effect] Update game
            store.set_game(game);
        }
    }
}
