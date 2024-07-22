// Component

#[starknet::component]
mod TutoriableComponent {
    // Core imports

    use core::debug::PrintTrait;

    // Starknet imports

    use starknet::ContractAddress;
    use starknet::info::{get_contract_address, get_caller_address, get_block_timestamp};

    // Dojo imports

    use dojo::world;
    use dojo::world::IWorldDispatcher;
    use dojo::world::IWorldDispatcherTrait;
    use dojo::world::IWorldProvider;
    use dojo::world::IDojoResourceProvider;

    // Internal imports

    use paved::constants;
    use paved::store::{Store, StoreImpl};
    use paved::models::game::{Game, GameImpl, GameAssert};
    use paved::models::player::{Player, PlayerImpl, PlayerAssert};
    use paved::models::builder::{Builder, BuilderImpl, ZeroableBuilderImpl, BuilderAssert};
    use paved::models::tile::{Tile, TilePosition, TileImpl, TileAssert, TilePositionAssert};
    use paved::types::orientation::Orientation;
    use paved::types::role::Role;
    use paved::types::spot::Spot;
    use paved::types::mode::{Mode, ModeTrait};

    // Storage

    #[storage]
    struct Storage {}

    // Events

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {}

    #[generate_trait]
    impl InternalImpl<
        TContractState, +HasComponent<TContractState>
    > of InternalTrait<TContractState> {
        fn _surrender(
            self: @ComponentState<TContractState>, world: IWorldDispatcher, game_id: u32
        ) {
            // [Setup] Datastore
            let store: Store = StoreImpl::new(world);

            // [Check] Game exists
            let mut game = store.game(game_id);
            game.assert_exists();

            // [Check] Game has started
            game.assert_started();

            // [Check] Game is not over
            game.assert_not_over();

            // [Check] Player exists
            let caller = get_caller_address();
            let mut player = store.player(caller.into());
            player.assert_exists();

            // [Check] Builder exists
            let mut builder = store.builder(game, caller.into());
            builder.assert_exists();

            // [Effect] Game over
            game.surrender();

            // [Effect] Update game
            store.set_game(game);
        }

        fn _build(self: @ComponentState<TContractState>, world: IWorldDispatcher, game_id: u32,) {
            // [Setup] Datastore
            let mut store: Store = StoreImpl::new(world);

            // [Check] Game exists
            let mut game = store.game(game_id);
            game.assert_exists();

            // [Check] Game has started
            game.assert_started();

            // [Check] Game is not over
            game.assert_not_over();

            // [Check] Player exists
            let caller = get_caller_address();
            let player = store.player(caller.into());
            player.assert_exists();

            // [Check] Builder exists
            let mut builder = store.builder(game, caller.into());
            builder.assert_exists();

            // [Check] Tile exists
            let mut tile = store.tile(game, builder.tile_id);
            tile.assert_exists();

            // [Check] Position not already taken
            let mode: Mode = game.mode.into();
            let (orientation, x, y, role, spot) = mode.parameters(game.tiles);
            let tile_position = store.tile_position(game, x, y);
            tile_position.assert_not_exists();

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

            // [Effect] Assess game over
            game.assess_over();

            // [Effect] Draw a new tile if relevant
            if !game.is_over() {
                let (tile_id, plan) = game.draw_plan();
                let new_tile = builder.reveal(tile_id, plan);
                store.set_tile(new_tile);
            }

            // [Effect] Update builder
            store.set_builder(builder);

            // [Effect] Assessment
            game.assess(tile, ref store);

            // [Effect] Update game
            game.built += 1;
            store.set_game(game);
        }
    }
}
