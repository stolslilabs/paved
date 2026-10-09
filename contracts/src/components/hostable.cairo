// Starknet imports

use core::traits::TryInto;
use starknet::ContractAddress;

// Component

#[starknet::component]
pub mod HostableComponent {
    // Internal imports

    use paved::events::{Claimed, Event as PavedEvent, GameSpawned, Sponsored};
    use paved::leaderboard::{LeaderboardImpl, LeaderboardTrait, Ranked, Top3};
    use paved::models::builder::{Builder, BuilderAssert, BuilderImpl};
    use paved::models::game::{Game, GameAssert, GameImpl};
    use paved::models::player::{Player, PlayerAssert, PlayerImpl};
    use paved::models::tile::{Tile, TileImpl, TilePosition};
    use paved::models::tournament::{Tournament, TournamentAssert, TournamentImpl};
    use paved::seed::{DailySeed, SeedSource};
    use paved::store::{Store, StoreImpl};
    use paved::types::mode::{Mode, ModeTrait};
    use starknet::storage::{Map, StorageMapReadAccess, StorageMapWriteAccess};
    use starknet::{ContractAddress, get_block_timestamp, get_caller_address, get_contract_address};

    // Errors

    pub mod errors {
        pub const NOTHING_TO_RECLAIM: felt252 = 'Tournament: nothing to reclaim';
    }

    /// The player id of an empty rank in the shares' split: no caller has it (an address is below
    /// 2^251), so the share of an empty rank is computed but never claimed.
    const NOBODY: felt252 = -1;

    // Storage

    #[storage]
    pub struct Storage {
        /// What each sponsor put in each day's prize (P-37); zero once reclaimed. The day's prize
        /// is the sum, since entries no longer feed it (P-31).
        pub sponsorships: Map<(u64, ContractAddress), felt252>,
    }

    /// The top with every empty rank held by `NOBODY`: the shares are then fixed (1/6 to rank 3,
    /// a third of the rest to rank 2, the remainder to rank 1) whoever holds them (P-37).
    fn full(top: Top3) -> Top3 {
        Top3 { first: fill(top.first), second: fill(top.second), third: fill(top.third) }
    }

    fn fill(ranked: Ranked) -> Ranked {
        if ranked.player_id == 0 {
            Ranked { player_id: NOBODY, score: 0 }
        } else {
            ranked
        }
    }

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

            // [Info] The entry no longer feeds the tournament's prize: it is sponsor-only (P-31)
            let tournament_id = TournamentImpl::compute_id(time, game.duration());

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

            // [Return] Game ID and the price of one stake unit (0 for the Tutorial)
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

            // [Effect] Update claim, against the ranking of the leaderboard, at the rank's fixed
            // share: the share of an empty rank goes back to the sponsors (P-37)
            let top = full(LeaderboardImpl::new().top(tournament_id));
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

        fn sponsor(ref self: ComponentState<TContractState>, amount: felt252, mode: Mode) -> u256 {
            // [Setup] Datastore
            let store: Store = StoreImpl::new();

            // [Info] Any day may be sponsored: its prize comes from sponsors only (P-31)
            let time = get_block_timestamp();
            let tournament_id = TournamentImpl::compute_id(time, mode.duration());
            let mut tournament = store.tournament(tournament_id);

            // [Effect] Add amount to the current tournament prize pool, and to the sponsor's share
            tournament.buyin(amount);
            store.set_tournament(tournament);
            let key = (tournament_id, get_caller_address());
            self.sponsorships.write(key, self.sponsorships.read(key) + amount);

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

        /// The sponsor's part of what no rank can claim on a day that is over (P-37): the shares
        /// of the empty ranks (the whole prize when nobody ranked), pro rata to what the sponsor
        /// put in, rounded down. The sponsor is marked reclaimed before the caller transfers.
        fn reclaim(
            ref self: ComponentState<TContractState>, tournament_id: u64, mode: Mode,
        ) -> u256 {
            // [Setup] Datastore
            let store: Store = StoreImpl::new();

            // [Check] The day is over, the caller sponsored it and has not reclaimed
            let tournament = store.tournament(tournament_id);
            tournament.assert_exists();
            tournament.assert_is_over(get_block_timestamp(), mode.duration());
            let sponsor = get_caller_address();
            let key = (tournament_id, sponsor);
            let given: u256 = self.sponsorships.read(key).into();
            assert(given != 0, errors::NOTHING_TO_RECLAIM);

            // [Compute] The shares of the empty ranks, the sponsor's part of them
            let top = LeaderboardImpl::new().top(tournament_id);
            let shares = full(top);
            let mut unclaimable: u256 = 0;
            if top.first.player_id == 0 {
                unclaimable += tournament.reward(shares, 1);
            }
            if top.second.player_id == 0 {
                unclaimable += tournament.reward(shares, 2);
            }
            if top.third.player_id == 0 {
                unclaimable += tournament.reward(shares, 3);
            }
            let prize: u256 = tournament.prize.into();
            let amount = unclaimable * given / prize;
            assert(amount != 0, errors::NOTHING_TO_RECLAIM);

            // [Effect] Reclaimed, once
            self.sponsorships.write(key, 0);

            // [Return] Amount to pay
            amount
        }
    }
}
