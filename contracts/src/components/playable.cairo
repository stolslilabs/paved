// Component

#[starknet::component]
mod PlayableComponent {
    // Starknet imports

    use starknet::ContractAddress;
    use starknet::info::{get_contract_address, get_caller_address, get_block_timestamp};

    // Dojo imports

    use dojo::world::IWorldDispatcher;
    use dojo::world::IWorldDispatcherTrait;

    // Internal imports

    use paved::constants;
    use paved::store::{Store, StoreImpl};
    use paved::models::game::{Game, GameTrait, GameAssert};
    use paved::models::player::{Player, PlayerTrait, PlayerAssert};
    use paved::models::builder::{Builder, BuilderImpl, ZeroableBuilderImpl, BuilderAssert};
    use paved::models::tile::{Tile, TilePosition, TileImpl, TileAssert, TilePositionAssert};
    use paved::models::tournament::{Tournament, TournamentImpl, TournamentAssert};
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
        fn spawn(
            self: @ComponentState<TContractState>, world: IWorldDispatcher, mode: Mode
        ) -> (u32, u256) {
            // [Setup] Datastore
            let store: Store = StoreImpl::new(world);

            // [Check] Player exists
            let caller = get_caller_address();
            let player = store.player(caller.into());
            player.assert_exists();

            // [Effect] Create game
            let game_id = world.uuid() + 1;
            let time = get_block_timestamp();
            let mut game = GameTrait::new(game_id, time, mode, mode.into(), 0, 0);

            // [Effect] Start game
            let tile = game.start(time);

            // [Effect] Store tile
            store.set_tile(tile);

            // [Effect] Create a new builder
            let builder_index = game.join();
            let mut builder = BuilderImpl::new(game.id, player.id, builder_index);
            let (tile_id, plan) = game.draw_plan();
            let tile = builder.reveal(tile_id, plan);

            // [Effect] Store builder
            store.set_builder(builder);

            // [Effect] Store tile
            store.set_tile(tile);

            // [Effect] Update tournament
            let tournament_id = TournamentImpl::compute_id(time, game.duration());
            let mut tournament = store.tournament(tournament_id);
            tournament.buyin(game.price());

            // [Effect] Store tournament
            store.set_tournament(tournament);

            // [Effect] Store game
            store.set_game(game);

            // [Return] Game ID and amount to pay
            let amount: u256 = game.price().into();
            (game_id, amount)
        }

        fn discard(self: @ComponentState<TContractState>, world: IWorldDispatcher, game_id: u32) {
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
            let player = store.player(caller.into());
            player.assert_exists();

            // [Check] Builder exists
            let mut builder = store.builder(game, caller.into());
            builder.assert_exists();

            // [Check] Tile exists
            let tile = store.tile(game, builder.tile_id);
            tile.assert_exists();

            // [Effect] Builder discard a tile
            builder.discard();

            // [Effect] Assess game over
            game.assess_over();

            // [Effect] Draw a new tile if relevant
            let time = get_block_timestamp();
            if !game.is_over(time) {
                game.reseed(tile);
                let (tile_id, plan) = game.draw_plan();
                let tile = builder.reveal(tile_id, plan);
                store.set_tile(tile);
            }

            // [Event] Update tournament on game over
            let tournament_id = TournamentImpl::compute_id(game.start_time, game.duration());
            let id_end = TournamentImpl::compute_id(time, game.duration());
            if tournament_id == id_end && game.is_over(time) {
                // [Effect] Update tournament
                let mut tournament = store.tournament(tournament_id);
                tournament.score(player.id, builder.score);
                store.set_tournament(tournament);

                // [Effect] Add tournament id to game
                game.tournament_id = tournament_id;
                game.end_time = time;
            }

            // [Effect] Update builder
            builder.discarded += 1;
            store.set_builder(builder);

            // [Effect] Update game
            store.set_game(game);
        }

        fn surrender(self: @ComponentState<TContractState>, world: IWorldDispatcher, game_id: u32) {
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
            builder.assert_exists();

            // [Effect] Game over
            game.surrender();

            // [Event] Update tournament on game over
            let tournament_id = TournamentImpl::compute_id(game.start_time, game.duration());
            let id_end = TournamentImpl::compute_id(time, game.duration());
            if tournament_id == id_end && game.is_over(time) {
                // [Effect] Update tournament
                let mut tournament = store.tournament(tournament_id);
                tournament.score(player.id, builder.score);
                store.set_tournament(tournament);

                // [Effect] Add tournament id to game
                game.tournament_id = tournament_id;
                game.end_time = time;
            }

            // [Effect] Update game
            store.set_game(game);
        }

        fn build(
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
            let time = get_block_timestamp();
            game.assert_not_over(time);

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
            if !game.is_over(time) {
                game.reseed(tile);
                let (tile_id, plan) = game.draw_plan();
                let new_tile = builder.reveal(tile_id, plan);
                store.set_tile(new_tile);
            }

            // [Effect] Update builder
            builder.built += 1;
            store.set_builder(builder);

            // [Effect] Assessment
            game.assess(tile, ref store);

            // [Event] Update tournament on game over
            let tournament_id = TournamentImpl::compute_id(game.start_time, game.duration());
            let id_end = TournamentImpl::compute_id(time, game.duration());
            if tournament_id == id_end && game.is_over(time) {
                // [Effect] Update tournament
                let mut tournament = store.tournament(tournament_id);
                tournament.score(player.id, builder.score);
                store.set_tournament(tournament);

                // [Effect] Add tournament id to game
                game.tournament_id = tournament_id;
                game.end_time = time;
            }

            // [Effect] Update game
            store.set_game(game);
        }

        fn claim(
            self: @ComponentState<TContractState>,
            world: IWorldDispatcher,
            tournament_id: u64,
            rank: u8,
            mode: Mode,
        ) -> u256 {
            // [Setup] Datastore
            let store: Store = StoreImpl::new(world);

            // [Check] Player exists
            let caller = get_caller_address();
            let mut player = store.player(caller.into());
            player.assert_exists();

            // [Check] Tournament exists
            let mut tournament = store.tournament(tournament_id);
            tournament.assert_exists();

            // [Effect] Update claim
            let time = get_block_timestamp();
            let reward = tournament.claim(player.id, rank, time, mode.duration());
            store.set_tournament(tournament);

            // [Return] Pay reward
            reward
        }

        fn sponsor(
            self: @ComponentState<TContractState>,
            world: IWorldDispatcher,
            amount: felt252,
            mode: Mode
        ) -> u256 {
            // [Setup] Datastore
            let store: Store = StoreImpl::new(world);

            // [Check] Tournament exists
            let time = get_block_timestamp();
            let tournament_id = TournamentImpl::compute_id(time, mode.duration());
            let mut tournament = store.tournament(tournament_id);
            tournament.assert_exists();

            // [Effect] Add amount to the current tournament prize pool
            tournament.buyin(amount);
            store.set_tournament(tournament);

            // [Return] Amount to pay
            amount.into()
        }
    }
}
