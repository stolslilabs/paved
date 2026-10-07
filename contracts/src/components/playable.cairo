// Component

#[starknet::component]
pub mod PlayableComponent {
    // Internal imports

    use paved::constants;
    use paved::events::{Built, Discarded, Event as PavedEvent, game_over};
    use paved::leaderboard::{LeaderboardImpl, LeaderboardTrait, Submission};
    use paved::models::builder::{Builder, BuilderAssert, BuilderImpl, ZeroableBuilderImpl};
    use paved::models::game::{Game, GameAssert, GameImpl};
    use paved::models::tile::{Tile, TileAssert, TileImpl, TilePosition, TilePositionAssert};
    use paved::models::tournament::TournamentImpl;
    use paved::store::{Store, StoreImpl};
    use paved::structure::placement::{self, NeighborhoodTrait};
    use paved::structure::state::StructuresTrait;
    use paved::types::orientation::Orientation;
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

    /// A game that ends in the tournament it started in is submitted to the leaderboard, then gets
    /// the tournament id and its end time. One that ends after its tournament closed ranks in
    /// nothing and keeps `tournament_id` 0.
    #[inline(always)]
    fn end_in_tournament(store: Store, ref game: Game, player_id: felt252) {
        let time = get_block_timestamp();
        let tournament_id = TournamentImpl::compute_id(game.start_time, game.duration());
        let id_end = TournamentImpl::compute_id(time, game.duration());
        if tournament_id == id_end {
            // [Effect] Submit to the leaderboard
            let submission = Submission { player_id, game_id: game.id, score: game.score, time };
            LeaderboardImpl::new().submit(tournament_id, submission);

            // [Effect] Add tournament id to game
            game.tournament_id = tournament_id;
            game.end_time = time;
            store.set_game_end(game);
        }
    }

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

            // [Effect] Draw a new tile if relevant
            if !game.is_over() {
                game.reseed(tile);
                let (tile_id, plan) = game.draw_plan();
                let tile = builder.reveal(tile_id, plan);
                store.set_tile(tile);
            }

            // [Effect] Update builder
            game.set_builder(builder);

            // [Effect] Rank the game in its tournament on game over
            if game.is_over() {
                end_in_tournament(store, ref game, player_id);
            }

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

            // [Effect] Rank the game in its tournament on game over
            if game.is_over() {
                end_in_tournament(store, ref game, player_id);
            }

            // [Effect] Update game
            store.set_game_state(game);

            // [Event] Game over
            if game.is_over() {
                store.emit(game_over(game, player_id));
            }
        }

        fn build(
            self: @ComponentState<TContractState>,
            game_id: u32,
            orientation: Orientation,
            x: u32,
            y: u32,
            role: Role,
            spot: Spot,
        ) {
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
                            role: role.into(),
                            spot: spot.into(),
                        },
                    ),
                );

            // [Check] Character to place: its structure is idle
            let mut structures = StructuresTrait::new(game_id);
            let placing = role != Role::None && spot != Spot::None;
            if placing {
                game.assert_structure_idle(tile, spot, @around, ref structures);
            }

            // [Effect] Place the tile on the structure state
            let refs = game.place_structures(tile, @around, ref structures);

            if placing {
                // [Effect] Place character
                let character = builder.place(role, ref tile, spot);
                game.occupy_structure(tile, refs, spot, role, ref structures);

                // [Effect] Update character (written with the structure state, at the end)
                structures.put_character(character);
            }

            // [Effect] Update tile (written with its position by `flush`, after the assessment)
            structures.track(tile, refs);

            // [Effect] Assess game over
            game.assess_over();

            // [Effect] Draw a new tile if relevant
            if !game.is_over() {
                game.reseed(tile);
                let (tile_id, plan) = game.draw_plan();
                let new_tile = builder.reveal(tile_id, plan);
                store.set_tile(new_tile);
            }

            // [Effect] Update builder: the tile in hand and the roles placed are part of the game
            // state, which the assessment recovers characters into
            game.set_builder(builder);

            // [Effect] Assessment, then what the move changed outside the game state: the record
            // pages, the `Characters` word and the built tile
            game.assess(tile, refs, @around, ref structures, ref store);
            structures.flush(store);

            // [Effect] Rank the game in its tournament on game over
            if game.is_over() {
                end_in_tournament(store, ref game, player_id);
            }

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
