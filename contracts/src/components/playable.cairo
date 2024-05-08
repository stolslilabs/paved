// Component

#[starknet::component]
mod PlayableComponent {
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
    use paved::components::emitter::EmitterTrait;
    use paved::store::{Store, StoreImpl};
    use paved::events::{
        Built, Discarded, GameOver, ScoredCity, ScoredRoad, ScoredForest, ScoredWonder
    };
    use paved::models::game::{Game, GameImpl, GameAssert};
    use paved::models::player::{Player, PlayerImpl, PlayerAssert};
    use paved::models::builder::{Builder, BuilderImpl, ZeroableBuilderImpl, BuilderAssert};
    use paved::models::tile::{Tile, TilePosition, TileImpl, TileAssert, TilePositionAssert};
    use paved::models::tournament::{Tournament, TournamentImpl, TournamentAssert};
    use paved::types::orientation::Orientation;
    use paved::types::role::Role;
    use paved::types::spot::Spot;

    // Storage

    #[storage]
    struct Storage {}

    // Events

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {}

    #[generate_trait]
    impl InternalImpl<
        TContractState, +HasComponent<TContractState>, +EmitterTrait<TContractState>
    > of InternalTrait<TContractState> {
        fn _discard(self: @ComponentState<TContractState>, world: IWorldDispatcher, game_id: u32) {
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
            let player = store.player(caller.into());
            player.assert_exists();

            // [Check] Builder exists
            let mut builder = store.builder(game, caller.into());
            builder.assert_exists();

            // [Check] Tile exists
            let tile = store.tile(game, builder.tile_id);
            tile.assert_exists();

            // [Effect] Builder discard a tile
            let _malus = builder.discard(ref game);

            // [Effect] Assess game over
            game.assess_over();

            // [Effect] Draw a new tile if relevant
            if !game.is_over() {
                let (tile_id, plan) = game.draw_plan();
                let tile = builder.reveal(tile_id, plan);
                store.set_tile(tile);
            }

            // [Effect] Update builder
            store.set_builder(builder);

            // [Effect] Update game
            store.set_game(game);

            // [Event] Emit discard events
            let event = Discarded {
                game_id: game.id,
                tile_id: tile.id,
                player_id: player.id,
                player_name: player.name,
                points: _malus,
            };
            self.get_contract().emit_discarded(world, event);

            // [Event] Emit game over event
            let time = get_block_timestamp();
            let tournament_id = TournamentImpl::compute_id(game.start_time, game.duration());
            let id_end = TournamentImpl::compute_id(time, game.duration());
            if tournament_id == id_end && game.is_over() {
                // [Effect] Update tournament
                let mut tournament = store.tournament(tournament_id);
                tournament.score(player.id, game.score);
                store.set_tournament(tournament);

                // [Event] Emit game over event for solo games if over
                let event = GameOver {
                    game_id: game.id,
                    tournament_id: tournament_id,
                    game_score: game.score,
                    game_start_time: game.start_time,
                    game_end_time: time,
                    player_id: player.id,
                    player_name: player.name,
                    player_master: player.master,
                };
                self.get_contract().emit_game_over(world, event);
            }
        }

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

            // [Effect] Update game
            game.surrender();
            store.set_game(game);

            // [Event] Emit game over event
            let time = get_block_timestamp();
            let tournament_id = TournamentImpl::compute_id(game.start_time, game.duration());
            let id_end = TournamentImpl::compute_id(time, game.duration());
            if tournament_id == id_end && game.is_over() {
                // [Effect] Update tournament
                let mut tournament = store.tournament(tournament_id);
                tournament.score(player.id, game.score);
                store.set_tournament(tournament);

                // [Event] Emit game over event for solo games if over
                let event = GameOver {
                    game_id: game.id,
                    tournament_id: tournament_id,
                    game_score: game.score,
                    game_start_time: game.start_time,
                    game_end_time: time,
                    player_id: player.id,
                    player_name: player.name,
                    player_master: player.master,
                };
                self.get_contract().emit_game_over(world, event);
            }
        }

        fn _build(
            self: @ComponentState<TContractState>,
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

            // [Effect] Reseed and assessment
            game.reseed(tile);
            let (mut cities, mut roads, mut forests, mut wonders) = game.assess(tile, ref store);

            // [Effect] Update game
            store.set_game(game);

            // [Event] Emit events
            let event = Built {
                game_id: game.id,
                tile_id: tile.id,
                x: x,
                y: y,
                player_id: player.id,
                player_name: player.name,
            };
            self.get_contract().emit_built(world, event);

            loop {
                match cities.pop_front() {
                    Option::Some(event) => { self.get_contract().emit_scored_city(world, event) },
                    Option::None => { break; }
                };
            };

            loop {
                match roads.pop_front() {
                    Option::Some(event) => { self.get_contract().emit_scored_road(world, event) },
                    Option::None => { break; }
                };
            };

            loop {
                match forests.pop_front() {
                    Option::Some(event) => { self.get_contract().emit_scored_forest(world, event) },
                    Option::None => { break; }
                };
            };

            loop {
                match wonders.pop_front() {
                    Option::Some(event) => { self.get_contract().emit_scored_wonder(world, event) },
                    Option::None => { break; }
                };
            };

            // [Event] Emit game over event
            let time = get_block_timestamp();
            let tournament_id = TournamentImpl::compute_id(game.start_time, game.duration());
            let id_end = TournamentImpl::compute_id(time, game.duration());
            if tournament_id == id_end && game.is_over() {
                // [Effect] Update tournament
                let mut tournament = store.tournament(tournament_id);
                tournament.score(player.id, game.score);
                store.set_tournament(tournament);

                // [Event] Emit game over event for solo games if over
                let event = GameOver {
                    game_id: game.id,
                    tournament_id: tournament_id,
                    game_score: game.score,
                    game_start_time: game.start_time,
                    game_end_time: time,
                    player_id: player.id,
                    player_name: player.name,
                    player_master: player.master,
                };
                self.get_contract().emit_game_over(world, event);
            }
        }
    }
}
