//! The ranking of the Daily tournaments behind an interface (phase P6, stage A of
//! `docs/architecture/leaderboard.md`).
//!
//! The game flow submits a finished game with `submit` and reads the three prize ranks with `top` or
//! `ranked`; it knows nothing else of how the ranking is kept. The implementation here is the native
//! one: the logic that was `Tournament::score`, over four slots of `PavedStorage` (`Store`). A
//! published package can replace it by changing this module alone.
//!
//! The rule, which every implementation keeps:
//! - a score at or below the score of rank 3 does not rank, so equal scores keep the earlier
//!   submission, and an empty rank has score 0, so a score of 0 never ranks;
//! - a ranked score shifts the lower ranks down by one;
//! - games are ranked, not players: one player can hold two or three ranks;
//! - the order is the order of the calls: `game_id` and `time` take no part.

use paved::store::{Store, StoreImpl, StoreTrait};

// Constants

const TWO_POW_32: u128 = 0x100000000;
const TWO_POW_64: u128 = 0x10000000000000000;
const MASK_32: u128 = 0xffffffff;

// Types

/// What a game contract submits when a game ends.
#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct Submission {
    pub player_id: felt252,
    pub game_id: u32,
    pub score: u32,
    pub time: u64,
}

/// What Paved reads back for a rank. Zero player and zero score mean an empty rank.
#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct Ranked {
    pub player_id: felt252,
    pub score: u32,
}

#[derive(Copy, Drop, Serde, Debug, PartialEq)]
pub struct Top3 {
    pub first: Ranked,
    pub second: Ranked,
    pub third: Ranked,
}

/// Handle on the leaderboard of the calling contract, as `Store` is on its storage.
#[derive(Copy, Drop)]
pub struct Leaderboard {}

pub trait LeaderboardTrait {
    fn new() -> Leaderboard;
    /// Rank taken, 1 to 3, or 0 when the submission is not placed. Never reverts on a valid game
    /// end.
    fn submit(self: Leaderboard, tournament_id: u64, submission: Submission) -> u8;
    /// The player and score of `rank` (1 to 3); any other rank answers an empty `Ranked`.
    fn ranked(self: Leaderboard, tournament_id: u64, rank: u8) -> Ranked;
    fn top(self: Leaderboard, tournament_id: u64) -> Top3;
}

#[generate_trait]
pub impl Top3Impl of Top3Trait {
    #[inline]
    fn empty() -> Top3 {
        let none = Ranked { player_id: 0, score: 0 };
        Top3 { first: none, second: none, third: none }
    }

    /// The player of `rank`; zero for an empty rank and for any rank outside 1 to 3.
    #[inline]
    fn player(self: Top3, rank: u8) -> felt252 {
        match rank {
            1 => self.first.player_id,
            2 => self.second.player_id,
            3 => self.third.player_id,
            _ => 0,
        }
    }
}

// Native implementation

pub impl LeaderboardImpl of LeaderboardTrait {
    #[inline(always)]
    fn new() -> Leaderboard {
        Leaderboard {}
    }

    fn submit(self: Leaderboard, tournament_id: u64, submission: Submission) -> u8 {
        let store: Store = StoreImpl::new();
        let score: u128 = submission.score.into();
        // [Check] A player of 0 is an empty rank: it cannot be ranked
        if submission.player_id == 0 {
            return 0;
        }
        let scores = store.ranking_scores(tournament_id);
        let first = scores & MASK_32;
        let second = (scores / TWO_POW_32) & MASK_32;
        let third = (scores / TWO_POW_64) & MASK_32;

        // [Check] At or below rank 3, or score 0 (an empty rank has score 0): not placed
        if score <= third {
            return 0;
        }

        // [Effect] Rank 3: the former rank 3 leaves
        if score <= second {
            store.set_ranking_scores(tournament_id, first + second * TWO_POW_32 + score * TWO_POW_64);
            store.set_ranking_player(tournament_id, 3, submission.player_id);
            return 3;
        }

        // [Effect] Rank 2: the former rank 2 moves to rank 3
        if score <= first {
            let player = store.ranking_player(tournament_id, 2);
            store.set_ranking_scores(tournament_id, first + score * TWO_POW_32 + second * TWO_POW_64);
            store.set_ranking_player(tournament_id, 3, player);
            store.set_ranking_player(tournament_id, 2, submission.player_id);
            return 2;
        }

        // [Effect] Rank 1: the former ranks 1 and 2 move down
        let player1 = store.ranking_player(tournament_id, 1);
        let player2 = store.ranking_player(tournament_id, 2);
        store.set_ranking_scores(tournament_id, score + first * TWO_POW_32 + second * TWO_POW_64);
        store.set_ranking_player(tournament_id, 3, player2);
        store.set_ranking_player(tournament_id, 2, player1);
        store.set_ranking_player(tournament_id, 1, submission.player_id);
        1
    }

    fn ranked(self: Leaderboard, tournament_id: u64, rank: u8) -> Ranked {
        if rank == 0 || rank > 3 {
            return Ranked { player_id: 0, score: 0 };
        }
        let store: Store = StoreImpl::new();
        let scores = store.ranking_scores(tournament_id);
        let shift: u128 = match rank {
            1 => 1,
            2 => TWO_POW_32,
            _ => TWO_POW_64,
        };
        Ranked {
            player_id: store.ranking_player(tournament_id, rank),
            score: ((scores / shift) & MASK_32).try_into().unwrap(),
        }
    }

    fn top(self: Leaderboard, tournament_id: u64) -> Top3 {
        let store: Store = StoreImpl::new();
        let scores = store.ranking_scores(tournament_id);
        Top3 {
            first: Ranked {
                player_id: store.ranking_player(tournament_id, 1),
                score: (scores & MASK_32).try_into().unwrap(),
            },
            second: Ranked {
                player_id: store.ranking_player(tournament_id, 2),
                score: ((scores / TWO_POW_32) & MASK_32).try_into().unwrap(),
            },
            third: Ranked {
                player_id: store.ranking_player(tournament_id, 3),
                score: ((scores / TWO_POW_64) & MASK_32).try_into().unwrap(),
            },
        }
    }
}
