//! The ranking of the Daily tournaments behind an interface (phase P6, stage A of
//! `docs/architecture/leaderboard.md`).
//!
//! The game flow submits a finished game with `submit` and reads the three prize ranks with `top`
//! or `ranked`; it knows nothing else of how the ranking is kept. The implementation here is the
//! native one: the logic that was `Tournament::score`, over four slots of `PavedStorage` (`Store`).
//! A published package can replace it by changing this module alone.
//!
//! The rule, which every implementation keeps:
//! - a score at or below the score of rank 3 does not rank, so equal scores keep the earlier
//!   submission, and an empty rank has score 0, so a score of 0 never ranks;
//! - a ranked score shifts the lower ranks down by one;
//! - games are ranked, not players: one player can hold two or three ranks;
//! - the order is the order of the calls: `game_id` and `time` take no part.

use paved::store::{Slots4, Store, StoreImpl, StoreTrait};

// Constants

const TWO_POW_32: u128 = 0x100000000;
const TWO_POW_64: u128 = 0x10000000000000000;
const MASK_32: u128 = 0xffffffff;

/// Slots of a ranking (`Slots4`): the packed scores, then the players of ranks 1, 2 and 3.
const SCORES: u8 = 0;
const FIRST: u8 = 1;
const SECOND: u8 = 2;
const THIRD: u8 = 3;

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

/// The three scores of the word `scores` of the ranking, rank 1 first.
#[inline]
fn unpack(scores: felt252) -> (u128, u128, u128) {
    let word: u256 = scores.into();
    (word.low & MASK_32, (word.low / TWO_POW_32) & MASK_32, (word.low / TWO_POW_64) & MASK_32)
}

#[inline]
fn pack(first: u128, second: u128, third: u128) -> felt252 {
    (first + second * TWO_POW_32 + third * TWO_POW_64).into()
}

pub impl LeaderboardImpl of LeaderboardTrait {
    #[inline(always)]
    fn new() -> Leaderboard {
        Leaderboard {}
    }

    fn submit(self: Leaderboard, tournament_id: u64, submission: Submission) -> u8 {
        // [Check] A score of 0 never ranks, and a player of 0 is an empty rank: it cannot be ranked
        if submission.score == 0 || submission.player_id == 0 {
            return 0;
        }
        let store: Store = StoreImpl::new();
        let base = store.ranking_base(tournament_id);
        let (first, second, third) = unpack(store.ranking_read(base, SCORES));
        let score: u128 = submission.score.into();
        let player = submission.player_id;

        // [Check] At or below rank 3, or score 0 (an empty rank has score 0): not placed
        if score <= third {
            return 0;
        }

        // [Effect] Rank 3, 2 or 1: the lower ranks move down, the last one leaves. Only the slots
        // that change are written.
        if score <= second {
            store.ranking_write(base, SCORES, pack(first, second, score));
            store.ranking_write(base, THIRD, player);
            3
        } else if score <= first {
            let moved = store.ranking_read(base, SECOND);
            store.ranking_write(base, SCORES, pack(first, score, second));
            store.ranking_write(base, SECOND, player);
            store.ranking_write(base, THIRD, moved);
            2
        } else {
            let moved_first = store.ranking_read(base, FIRST);
            let moved_second = store.ranking_read(base, SECOND);
            store.ranking_write(base, SCORES, pack(score, first, second));
            store.ranking_write(base, FIRST, player);
            store.ranking_write(base, SECOND, moved_first);
            store.ranking_write(base, THIRD, moved_second);
            1
        }
    }

    fn ranked(self: Leaderboard, tournament_id: u64, rank: u8) -> Ranked {
        if rank == 0 || rank > 3 {
            return Ranked { player_id: 0, score: 0 };
        }
        // Two slots: the scores, and the player of the rank
        let store: Store = StoreImpl::new();
        let base = store.ranking_base(tournament_id);
        let (first, second, third) = unpack(store.ranking_read(base, SCORES));
        let score = match rank {
            1 => first,
            2 => second,
            _ => third,
        };
        // An empty rank has score 0 and no player
        if score == 0 {
            return Ranked { player_id: 0, score: 0 };
        }
        Ranked { player_id: store.ranking_read(base, rank), score: score.try_into().unwrap() }
    }

    fn top(self: Leaderboard, tournament_id: u64) -> Top3 {
        let ranking = StoreImpl::new().ranking(tournament_id);
        let (first, second, third) = unpack(ranking.a);
        Top3 {
            first: Ranked { player_id: ranking.b, score: first.try_into().unwrap() },
            second: Ranked { player_id: ranking.c, score: second.try_into().unwrap() },
            third: Ranked { player_id: ranking.d, score: third.try_into().unwrap() },
        }
    }
}
