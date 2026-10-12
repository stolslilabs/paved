//! The ranking of the Daily tournaments behind an interface (phase P6, stage A of
//! `docs/architecture/leaderboard.md`).
//!
//! The game flow submits a finished game with `submit` and reads the three prize ranks with `top`
//! or `ranked`; it knows nothing else of how the ranking is kept. The implementation here is the
//! published package `quiver_leaderboard` 0.1.0 (L-1, stage B), on its own storage node; the
//! native one (the logic that was `Tournament::score`, over four slots of `PavedStorage`) is in
//! the history of this module.
//!
//! The rule, which every implementation keeps:
//! - a score at or below the score of rank 3 does not rank, so equal scores keep the earlier
//!   submission, and an empty rank has score 0, so a score of 0 never ranks;
//! - a ranked score shifts the lower ranks down by one;
//! - games are ranked, not players: one player can hold two or three ranks;
//! - the order is the order of the calls: `game_id` and `time` take no part.

use quiver_leaderboard::leaderboard::{
    LeaderboardTrait as PackageTrait, LeaderboardViewTrait as PackageViewTrait,
};
use quiver_leaderboard::store::LeaderboardStorage;
use quiver_leaderboard::types::ranked::Ranked as PackageRanked;
use quiver_leaderboard::types::submission::Submission as PackageSubmission;
use starknet::storage::{Mutable, StorageAsPath, StorageBase, StoragePath};

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

// Implementation: `quiver_leaderboard` 0.1.0

/// The package's node, rooted at its own address in the storage of the contract that runs the
/// code, as `PavedStorage` is at `selector!("paved")`: two maps, `scores` and `players` (four
/// slots per tournament).
#[inline(always)]
fn board() -> StoragePath<Mutable<LeaderboardStorage>> {
    let base: StorageBase<Mutable<LeaderboardStorage>> = StorageBase {
        __base_address__: selector!("leaderboard"),
    };
    base.as_path()
}

#[inline(always)]
fn ranked_of(value: PackageRanked) -> Ranked {
    Ranked { player_id: value.player_id, score: value.score }
}

pub impl LeaderboardImpl of LeaderboardTrait {
    #[inline(always)]
    fn new() -> Leaderboard {
        Leaderboard {}
    }

    fn submit(self: Leaderboard, tournament_id: u64, submission: Submission) -> u8 {
        let Submission { player_id, game_id, score, time } = submission;
        board().submit(tournament_id, PackageSubmission { player_id, game_id, score, time })
    }

    fn ranked(self: Leaderboard, tournament_id: u64, rank: u8) -> Ranked {
        ranked_of(board().ranked(tournament_id, rank))
    }

    fn top(self: Leaderboard, tournament_id: u64) -> Top3 {
        let top = board().top(tournament_id);
        Top3 {
            first: ranked_of(top.first), second: ranked_of(top.second), third: ranked_of(top.third),
        }
    }
}
