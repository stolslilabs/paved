// Starknet imports

use core::traits::TryInto;
use starknet::ContractAddress;

// Component

#[starknet::component]
pub mod HostableComponent {
    // Internal imports

    use paved::events::{Claimed, Event as PavedEvent, GameSpawned, Sponsored};
    use paved::leaderboard::{LeaderboardImpl, LeaderboardTrait};
    use paved::models::builder::{Builder, BuilderAssert, BuilderImpl};
    use paved::models::game::{Game, GameAssert, GameImpl};
    use paved::models::player::{Player, PlayerAssert, PlayerImpl};
    use paved::models::tile::{Tile, TileImpl, TilePosition};
    use paved::models::tournament::{Tournament, TournamentAssert, TournamentImpl};
    use paved::seed::{DailySeed, SeedSource};
    use paved::store::{Store, StoreImpl};
    use paved::types::mode::{Mode, ModeTrait};
    use starknet::{ContractAddress, get_block_timestamp, get_caller_address, get_contract_address};

    // Storage

    #[storage]
    struct Storage {}

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {}

    #[generate_trait]
    pub impl InternalImpl<
        TContractState, +HasComponent<TContractState>,
    > of InternalTrait<TContractState> {
        fn spawn(self: @ComponentState<TContractState>, mode: Mode) -> (u32, u256) {
            self.spawn_with(mode, @DailySeed {})
        }

        fn spawn_with<S, +SeedSource<S>>(
            self: @ComponentState<TContractState>, mode: Mode, source: @S,
        ) -> (u32, u256) {
            // [Setup] Datastore
            let store: Store = StoreImpl::new();

            // [Check] Player exists
            let caller = get_caller_address();
            let player = store.player(caller.into());
            player.assert_exists();

            // [Effect] Create game
            let game_id = store.uuid();
            let time = get_block_timestamp();
            let mut game = GameImpl::new(game_id, time, mode, player.id);

            // [Effect] Start game
            let seed = source.seed(mode, time, game.id, game.seed);
            let tile = game.start(time, seed);

            // [Effect] Store tile
            store.set_tile(tile);

            // [Effect] The first tile is in the builder's hand (`GameState`, stored with the game)
            let mut builder = BuilderImpl::new(game.id, player.id);
            let (tile_id, plan) = game.draw_plan();
            let tile = builder.reveal(tile_id, plan);

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

            // [Event] Game spawned: a Tutorial game belongs to no tournament (id 0)
            let event_tournament_id = if mode == Mode::Tutorial {
                0
            } else {
                tournament_id
            };
            store
                .emit(
                    PavedEvent::GameSpawned(
                        GameSpawned {
                            game_id,
                            player_id: player.id,
                            mode: game.mode,
                            tournament_id: event_tournament_id,
                            start_time: time,
                            price: game.price(),
                        },
                    ),
                );

            // [Return] Game ID and amount to pay
            let amount: u256 = game.price().into();
            (game_id, amount)
        }

        fn claim(
            self: @ComponentState<TContractState>, tournament_id: u64, rank: u8, mode: Mode,
        ) -> u256 {
            // [Setup] Datastore
            let store: Store = StoreImpl::new();

            // [Check] Player exists
            let caller = get_caller_address();
            let mut player = store.player(caller.into());
            player.assert_exists();

            // [Check] Tournament exists
            let mut tournament = store.tournament(tournament_id);
            tournament.assert_exists();

            // [Effect] Update claim, against the ranking of the leaderboard
            let top = LeaderboardImpl::new().top(tournament_id);
            let time = get_block_timestamp();
            let reward = tournament.claim(top, player.id, rank, time, mode.duration());
            store.set_tournament(tournament);

            // [Event] Reward claimed
            store
                .emit(
                    PavedEvent::Claimed(
                        Claimed { tournament_id, player_id: player.id, rank, reward },
                    ),
                );

            // [Return] Reward to pay
            reward
        }

        fn sponsor(self: @ComponentState<TContractState>, amount: felt252, mode: Mode) -> u256 {
            // [Setup] Datastore
            let store: Store = StoreImpl::new();

            // [Check] Tournament exists
            let time = get_block_timestamp();
            let tournament_id = TournamentImpl::compute_id(time, mode.duration());
            let mut tournament = store.tournament(tournament_id);
            tournament.assert_exists();

            // [Effect] Add amount to the current tournament prize pool
            tournament.buyin(amount);
            store.set_tournament(tournament);

            // [Event] Prize pool sponsored
            store
                .emit(
                    PavedEvent::Sponsored(
                        Sponsored { tournament_id, sponsor: get_caller_address(), amount },
                    ),
                );

            // [Return] Amount to pay
            amount.into()
        }
    }
}
