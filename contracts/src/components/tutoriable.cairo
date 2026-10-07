// Component

#[starknet::component]
pub mod TutoriableComponent {
    // Internal imports

    use paved::constants;
    use paved::events::{Built, Discarded, Event as PavedEvent, game_over};
    use paved::models::builder::{Builder, BuilderAssert, BuilderImpl, ZeroableBuilderImpl};
    use paved::models::game::{Game, GameAssert, GameImpl};
    use paved::models::tile::{Tile, TileAssert, TileImpl, TilePosition, TilePositionAssert};
    use paved::store::{Store, StoreImpl};
    use paved::types::mode::{Mode, ModeTrait};
    use paved::types::orientation::{Orientation, OrientationAssert};
    use paved::types::role::Role;
    use paved::types::spot::Spot;
    use starknet::{ContractAddress, get_block_timestamp, get_caller_address, get_contract_address};

    // Storage

    #[storage]
    struct Storage {}

    // Events

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {}

    #[generate_trait]
    pub impl InternalImpl<
        TContractState, +HasComponent<TContractState>,
    > of InternalTrait<TContractState> {
        fn discard(self: @ComponentState<TContractState>, game_id: u32) {
            // [Setup] Datastore
            let store: Store = StoreImpl::new();

            // [Check] Game exists
            let mut game = store.live_game(game_id);
            game.assert_exists();

            // [Check] Game has started
            game.assert_started();

            // [Check] Game is not over
            game.assert_not_over();

            // [Check] The caller is the player of the game: the game has one builder, its
            // player's, and anyone else has none
            let player_id: felt252 = get_caller_address().into();
            let mut builder = game.builder_of(player_id);
            builder.assert_exists();

            // [Check] Tile exists
            let mut tile = store.tile(game, builder.tile_id);
            tile.assert_exists();

            // [Check] Tile can be burnt
            let mode: Mode = game.mode.into();
            let (orientation, _, _, _, _) = mode.parameters(game.tiles);
            orientation.assert_not_valid();

            // [Effect] Builder discard a tile
            let score = game.score;
            builder.discard(ref game);

            // [Event] Tile discarded
            store
                .emit(
                    PavedEvent::Discarded(
                        Discarded {
                            game_id,
                            player_id: player_id,
                            tile_id: tile.id,
                            plan: tile.plan,
                            points: score - game.score,
                        },
                    ),
                );

            // [Effect] Assess game over
            game.assess_over();

            // [Effect] Draw a new tile if relevant
            if !game.is_over() {
                game.reseed(tile);
                let (tile_id, plan) = game.draw_plan();
                let tile = builder.reveal(tile_id, plan);
                store.set_tile(tile);
            }

            // [Effect] Update builder
            game.set_builder(builder);

            // [Effect] Update game
            game.discarded += 1;
            store.set_game_state(game);

            // [Event] Game over
            if game.is_over() {
                store.emit(game_over(game, player_id));
            }
        }

        fn surrender(self: @ComponentState<TContractState>, game_id: u32) {
            // [Setup] Datastore
            let store: Store = StoreImpl::new();

            // [Check] Game exists
            let mut game = store.live_game(game_id);
            game.assert_exists();

            // [Check] Game has started
            game.assert_started();

            // [Check] Game is not over
            game.assert_not_over();

            // [Check] The caller is the player of the game: the game has one builder, its
            // player's, and anyone else has none
            let player_id: felt252 = get_caller_address().into();
            let mut builder = game.builder_of(player_id);
            builder.assert_exists();

            // [Effect] Game over
            game.surrender();

            // [Effect] Update game
            store.set_game_state(game);

            // [Event] Game over
            if game.is_over() {
                store.emit(game_over(game, player_id));
            }
        }

        fn build(self: @ComponentState<TContractState>, game_id: u32) {
            // [Setup] Datastore
            let mut store: Store = StoreImpl::new();

            // [Check] Game exists
            let mut game = store.live_game(game_id);
            game.assert_exists();

            // [Check] Game has started
            game.assert_started();

            // [Check] Game is not over
            game.assert_not_over();

            // [Check] The caller is the player of the game: the game has one builder, its
            // player's, and anyone else has none
            let player_id: felt252 = get_caller_address().into();
            let mut builder = game.builder_of(player_id);
            builder.assert_exists();

            // [Check] Tile exists
            let mut tile = store.tile(game, builder.tile_id);
            tile.assert_exists();

            // [Check] Position not already taken
            let mode: Mode = game.mode.into();
            let (orientation, x, y, role, spot) = mode.parameters(game.tiles);
            let tile_position = store.tile_position(game, x, y);
            tile_position.assert_not_exists();

            // [Check] Tile can be placed
            orientation.assert_is_valid();

            // [Effect] Build tile
            let mut neighbors = store.neighbors(game, x, y);
            builder.build(ref tile, orientation, x, y, ref neighbors);

            // [Event] Tile built
            store
                .emit(
                    PavedEvent::Built(
                        Built {
                            game_id,
                            player_id: player_id,
                            tile_id: tile.id,
                            plan: tile.plan,
                            orientation: orientation.into(),
                            x,
                            y,
                            role: role.into(),
                            spot: spot.into(),
                        },
                    ),
                );

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
            // [Effect] Write the builder before the assessment, which recovers characters
            store.set_builder(builder);

            // [Effect] Assessment
            game.assess(tile, ref store);

            // [Effect] Take back the characters that the assessment recovered
            game.set_builder(store.builder(game, player_id));

            // [Effect] Update game
            game.built += 1;
            store.set_game_state(game);

            // [Event] Game over
            if game.is_over() {
                store.emit(game_over(game, player_id));
            }
        }
    }
}
