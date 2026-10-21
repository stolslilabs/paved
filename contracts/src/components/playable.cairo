// Component

#[starknet::component]
pub mod PlayableComponent {
    // Internal imports

    use paved::day::day_id;
    use paved::events::{Built, Discarded, Event as PavedEvent, emit_queued, game_over};
    use paved::models::builder::{Builder, BuilderAssert, BuilderImpl, ZeroableBuilderImpl};
    use paved::models::game::{Game, GameAssert, GameImpl};
    use paved::models::tile::{Tile, TileAssert, TileImpl, TilePosition, TilePositionAssert};
    use paved::quests::encode;
    use paved::store::{Store, StoreImpl};
    use paved::structure::placement::{self, NeighborhoodTrait};
    use paved::structure::state::StructuresTrait;
    use paved::types::orientation::Orientation;
    use starknet::{ContractAddress, get_block_timestamp, get_caller_address, get_contract_address};

    // Storage

    #[storage]
    struct Storage {}

    // Events

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {}

    /// A game that ends in the day it started in gets the day id and its end time (`GameEnd`).
    /// One that ends after its day keeps `day_id` 0. Since D-20 nothing is ranked on chain: the
    /// daily leaderboard is the indexer's.
    #[inline(always)]
    fn end_in_day(store: Store, ref game: Game) {
        let time = get_block_timestamp();
        let day = day_id(game.start_time, game.duration());
        if day == day_id(time, game.duration()) {
            // [Effect] Add the day id to the game
            game.day_id = day;
            game.end_time = time;
            store.set_game_end(game);
        }
    }

    #[generate_trait]
    pub impl InternalImpl<
        TContractState, +HasComponent<TContractState>,
    > of InternalTrait<TContractState> {
        /// `random`: the move's VRF draw, when `GameImpl::move_draw` asks for one (#645).
        fn discard(
            self: @ComponentState<TContractState>, game_id: u32, random: Option<felt252>,
        ) -> u128 {
            // [Setup] Datastore
            let store: Store = StoreImpl::new();

            // [Check] Game exists
            let mut game = store.live_game(game_id);
            game.assert_exists();

            // [Check] Game has started
            game.assert_started();

            // [Check] Game is not over
            game.assert_not_over();

            // [Check] Game has not expired (24 h from its start)
            game.assert_not_expired(get_block_timestamp());

            // [Check] The caller is the player of the game: the game has one builder, its
            // player's, and anyone else has none
            let player_id: felt252 = get_caller_address().into();
            let mut builder = game.builder_of(player_id);
            builder.assert_exists();

            // [Check] Tile exists
            let tile = store.tile(game, builder.tile_id);
            tile.assert_exists();

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

            // [Effect] The next tile comes into the hand, and the queue draws one if relevant
            if !game.is_over() {
                let (tile_id, plan, first) = game.advance(random);
                let tile = builder.reveal(tile_id, plan);
                store.set_tile(tile);
                emit_queued(store, game, plan.into(), first);
            }

            // [Effect] Update builder
            game.set_builder(builder);

            // [Effect] The day of the game on game over
            if game.is_over() {
                end_in_day(store, ref game);
            }

            // [Effect] Update game
            game.discarded += 1;
            store.set_game_state(game);

            // [Event] Game over
            if game.is_over() {
                store.emit(game_over(game, player_id));
                // [Return] The tally the caller reports to the quests (0: not over)
                encode(game)
            } else {
                0
            }
        }

        fn surrender(self: @ComponentState<TContractState>, game_id: u32) -> u128 {
            // [Setup] Datastore
            let store: Store = StoreImpl::new();

            // [Check] Game exists
            let mut game = store.live_game(game_id);
            game.assert_exists();

            // [Check] Game has started
            game.assert_started();

            // [Check] Game is not over
            game.assert_not_over();

            // [Info] No expiry check: surrender is how an expired game ends, so that its score
            // (frozen at its last move) is still recorded, as expired, and settled (S1)

            // [Check] The caller is the player of the game: the game has one builder, its
            // player's, and anyone else has none
            let player_id: felt252 = get_caller_address().into();
            let mut builder = game.builder_of(player_id);
            builder.assert_exists();

            // [Effect] Game over
            game.surrender();

            // [Effect] The day of the game on game over
            if game.is_over() {
                end_in_day(store, ref game);
            }

            // [Effect] Update game
            store.set_game_state(game);

            // [Event] Game over
            if game.is_over() {
                store.emit(game_over(game, player_id));
                // [Return] The tally the caller reports to the quests (0: not over)
                encode(game)
            } else {
                0
            }
        }

        fn build(
            self: @ComponentState<TContractState>,
            game_id: u32,
            orientation: Orientation,
            x: u32,
            y: u32,
            random: Option<felt252>,
        ) -> u128 {
            // [Setup] Datastore
            let mut store: Store = StoreImpl::new();

            // [Check] Game exists
            let mut game = store.live_game(game_id);
            game.assert_exists();

            // [Check] Game has started
            game.assert_started();

            // [Check] Game is not over
            game.assert_not_over();

            // [Check] Game has not expired (24 h from its start)
            game.assert_not_expired(get_block_timestamp());

            // [Check] The caller is the player of the game: the game has one builder, its
            // player's, and anyone else has none
            let player_id: felt252 = get_caller_address().into();
            let mut builder = game.builder_of(player_id);
            builder.assert_exists();

            // [Check] Tile exists
            let mut tile = store.tile(game, builder.tile_id);
            tile.assert_exists();

            // [Check] Position not already taken
            let tile_position = store.tile_position(game, x, y);
            tile_position.assert_not_exists();

            // [Effect] Build tile
            let around = NeighborhoodTrait::read(game_id, x, y);
            builder.build(ref tile, orientation, x, y);

            // [Check] The tile fits its neighbours
            placement::assert_fits(tile, @around);

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
                        },
                    ),
                );

            // [Effect] Place the tile on the structure state, and whether a structure closed
            let mut structures = StructuresTrait::new(game_id);
            let (refs, closes) = placement::place_move(ref structures, tile, @around);

            // [Effect] Update tile (written with its position by `flush`, after the assessment)
            structures.track(tile, refs);

            // [Effect] Assess game over
            game.assess_over();

            // [Effect] The next tile comes into the hand, and the queue draws one if relevant
            if !game.is_over() {
                let (tile_id, plan, first) = game.advance(random);
                let new_tile = builder.reveal(tile_id, plan);
                store.set_tile(new_tile);
                emit_queued(store, game, plan.into(), first);
            }

            // [Effect] Update builder: the tile in hand is part of the game state
            game.set_builder(builder);

            // [Effect] Assessment, then what the move changed outside the game state: the record
            // pages and the built tile. A move that closes nothing scores nothing: no assessment
            // (G7a, C1, `placement::place_move`)
            if closes {
                game.assess(tile, refs, @around, ref structures, ref store);
            }
            structures.flush(store);

            // [Effect] The day of the game on game over
            if game.is_over() {
                end_in_day(store, ref game);
            }

            // [Effect] Update game
            game.built += 1;
            store.set_game_state(game);

            // [Event] Game over
            if game.is_over() {
                store.emit(game_over(game, player_id));
                // [Return] The tally the caller reports to the quests (0: not over)
                encode(game)
            } else {
                0
            }
        }
    }
}
