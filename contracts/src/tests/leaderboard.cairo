//! Conformance tests of the leaderboard rule, written against `LeaderboardTrait` only (phase P6).
//!
//! The same cases run against any implementation behind the interface: the native one today, a
//! published package later (`docs/architecture/leaderboard.md`, "How the swap is tested"). They
//! reach the implementation through `submit`, `ranked` and `top` of the deployed `Daily`'s storage,
//! and a reference model of the rule (the former `Tournament::score`) checks a long sequence.

use paved::leaderboard::{LeaderboardImpl, LeaderboardTrait, Ranked, Submission, Top3, Top3Trait};
use paved::tests::setup::setup;
use paved::types::mode::Mode;
use paved::views::MAX_TOURNAMENT_ID;
use snforge_std::interact_with_state;
use starknet::ContractAddress;

// Helpers on the contract (also used by the other test modules to rank players)

/// Submits a game of `player_id` with `score` to the leaderboard of `contract`; the rank taken.
pub fn submit(contract: ContractAddress, id: u64, player_id: felt252, score: u32) -> u8 {
    interact_with_state(
        contract,
        || {
            LeaderboardImpl::new().submit(id, Submission { player_id, game_id: 1, score, time: 0 })
        },
    )
}

pub fn top(contract: ContractAddress, id: u64) -> Top3 {
    interact_with_state(contract, || LeaderboardImpl::new().top(id))
}

pub fn ranked(contract: ContractAddress, id: u64, rank: u8) -> Ranked {
    interact_with_state(contract, || LeaderboardImpl::new().ranked(id, rank))
}

fn daily() -> ContractAddress {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    systems.daily.contract_address
}

fn at(player_id: felt252, score: u32) -> Ranked {
    Ranked { player_id, score }
}

const NONE: Ranked = Ranked { player_id: 0, score: 0 };
const ID: u64 = 20000;

// Reference model: the ranking rule as `Tournament::score` wrote it before P6

#[derive(Copy, Drop)]
struct Model {
    p1: felt252,
    p2: felt252,
    p3: felt252,
    s1: u32,
    s2: u32,
    s3: u32,
}

#[generate_trait]
impl ModelImpl of ModelTrait {
    fn new() -> Model {
        Model { p1: 0, p2: 0, p3: 0, s1: 0, s2: 0, s3: 0 }
    }

    fn score(ref self: Model, player_id: felt252, score: u32) {
        if score <= self.s3 {
            return;
        }
        if score <= self.s2 {
            self.s3 = score;
            self.p3 = player_id;
            return;
        }
        if score <= self.s1 {
            self.s3 = self.s2;
            self.p3 = self.p2;
            self.s2 = score;
            self.p2 = player_id;
            return;
        }
        self.s3 = self.s2;
        self.p3 = self.p2;
        self.s2 = self.s1;
        self.p2 = self.p1;
        self.s1 = score;
        self.p1 = player_id;
    }

    fn top(self: Model) -> Top3 {
        Top3 {
            first: at(self.p1, self.s1), second: at(self.p2, self.s2), third: at(self.p3, self.s3),
        }
    }
}

// Table of cases

#[test]
fn test_leaderboard_empty() {
    let contract = daily();
    let expected = Top3 { first: NONE, second: NONE, third: NONE };
    assert_eq!(top(contract, ID), expected);
    assert_eq!(ranked(contract, ID, 1), NONE);
    assert_eq!(ranked(contract, ID, 2), NONE);
    assert_eq!(ranked(contract, ID, 3), NONE);
}

#[test]
fn test_leaderboard_ranks_and_shifts() {
    let contract = daily();
    assert_eq!(submit(contract, ID, 1, 10), 1);
    assert_eq!(submit(contract, ID, 2, 20), 1);
    assert_eq!(submit(contract, ID, 3, 15), 2);
    // 5 is below rank 3 (10 moved to rank 3)
    assert_eq!(submit(contract, ID, 4, 5), 0);
    assert_eq!(submit(contract, ID, 5, 25), 1);
    // Ranks: 25, 20, 15 (10 left the board)
    let expected = Top3 { first: at(5, 25), second: at(2, 20), third: at(3, 15) };
    assert_eq!(top(contract, ID), expected);
    assert_eq!(ranked(contract, ID, 1), at(5, 25));
    assert_eq!(ranked(contract, ID, 2), at(2, 20));
    assert_eq!(ranked(contract, ID, 3), at(3, 15));
}

#[test]
fn test_leaderboard_shift_from_rank_1_moves_two_ranks() {
    let contract = daily();
    submit(contract, ID, 1, 30);
    submit(contract, ID, 2, 20);
    submit(contract, ID, 3, 10);
    assert_eq!(submit(contract, ID, 4, 40), 1);
    let expected = Top3 { first: at(4, 40), second: at(1, 30), third: at(2, 20) };
    assert_eq!(top(contract, ID), expected);
}

#[test]
fn test_leaderboard_shift_from_rank_2_moves_one_rank() {
    let contract = daily();
    submit(contract, ID, 1, 30);
    submit(contract, ID, 2, 20);
    submit(contract, ID, 3, 10);
    assert_eq!(submit(contract, ID, 4, 25), 2);
    let expected = Top3 { first: at(1, 30), second: at(4, 25), third: at(2, 20) };
    assert_eq!(top(contract, ID), expected);
}

#[test]
fn test_leaderboard_takes_rank_3() {
    let contract = daily();
    submit(contract, ID, 1, 30);
    submit(contract, ID, 2, 20);
    submit(contract, ID, 3, 10);
    assert_eq!(submit(contract, ID, 4, 15), 3);
    let expected = Top3 { first: at(1, 30), second: at(2, 20), third: at(4, 15) };
    assert_eq!(top(contract, ID), expected);
}

#[test]
fn test_leaderboard_three_submissions_then_a_lower_one() {
    let contract = daily();
    assert_eq!(submit(contract, ID, 1, 30), 1);
    assert_eq!(submit(contract, ID, 2, 20), 2);
    assert_eq!(submit(contract, ID, 3, 10), 3);
    assert_eq!(submit(contract, ID, 4, 9), 0);
    let expected = Top3 { first: at(1, 30), second: at(2, 20), third: at(3, 10) };
    assert_eq!(top(contract, ID), expected);
}

#[test]
fn test_leaderboard_ties_keep_the_earlier_submission() {
    let contract = daily();
    assert_eq!(submit(contract, ID, 1, 10), 1);
    // Equal to rank 1: below it, so rank 2
    assert_eq!(submit(contract, ID, 2, 10), 2);
    assert_eq!(submit(contract, ID, 3, 10), 3);
    // Equal to rank 3: not placed
    assert_eq!(submit(contract, ID, 4, 10), 0);
    let expected = Top3 { first: at(1, 10), second: at(2, 10), third: at(3, 10) };
    assert_eq!(top(contract, ID), expected);
}

#[test]
fn test_leaderboard_score_zero_never_ranks() {
    let contract = daily();
    assert_eq!(submit(contract, ID, 1, 0), 0);
    let expected = Top3 { first: NONE, second: NONE, third: NONE };
    assert_eq!(top(contract, ID), expected);
    submit(contract, ID, 2, 5);
    assert_eq!(submit(contract, ID, 3, 0), 0);
    assert_eq!(ranked(contract, ID, 2), NONE);
}

#[test]
fn test_leaderboard_player_zero_does_not_rank() {
    let contract = daily();
    assert_eq!(submit(contract, ID, 0, 50), 0);
    assert_eq!(ranked(contract, ID, 1), NONE);
}

#[test]
fn test_leaderboard_one_player_on_three_ranks() {
    let contract = daily();
    assert_eq!(submit(contract, ID, 7, 30), 1);
    assert_eq!(submit(contract, ID, 7, 20), 2);
    assert_eq!(submit(contract, ID, 7, 10), 3);
    let expected = Top3 { first: at(7, 30), second: at(7, 20), third: at(7, 10) };
    assert_eq!(top(contract, ID), expected);
}

#[test]
fn test_leaderboard_ranked_outside_one_to_three_is_empty() {
    let contract = daily();
    submit(contract, ID, 1, 30);
    assert_eq!(ranked(contract, ID, 0), NONE);
    assert_eq!(ranked(contract, ID, 4), NONE);
    assert_eq!(ranked(contract, ID, 255), NONE);
}

#[test]
fn test_leaderboard_tournaments_are_independent() {
    let contract = daily();
    submit(contract, 1, 1, 10);
    submit(contract, 2, 2, 20);
    assert_eq!(ranked(contract, 1, 1), at(1, 10));
    assert_eq!(ranked(contract, 2, 1), at(2, 20));
    assert_eq!(ranked(contract, 3, 1), NONE);
}

#[test]
fn test_leaderboard_extreme_ids() {
    let contract = daily();
    submit(contract, 0, 1, 10);
    submit(contract, MAX_TOURNAMENT_ID, 2, 20);
    assert_eq!(ranked(contract, 0, 1), at(1, 10));
    assert_eq!(ranked(contract, MAX_TOURNAMENT_ID, 1), at(2, 20));
    assert_eq!(ranked(contract, 0, 2), NONE);
    assert_eq!(ranked(contract, MAX_TOURNAMENT_ID, 2), NONE);
}

#[test]
fn test_leaderboard_max_score_and_big_player() {
    let contract = daily();
    let big: felt252 = 0x800000000000011000000000000000000000000000000000000000000000000 - 1;
    assert_eq!(submit(contract, ID, big, 0xffffffff), 1);
    assert_eq!(submit(contract, ID, 2, 0xffffffff), 2);
    assert_eq!(ranked(contract, ID, 1), at(big, 0xffffffff));
    assert_eq!(submit(contract, ID, 3, 0xffffffff), 3);
    assert_eq!(ranked(contract, ID, 1), at(big, 0xffffffff));
    assert_eq!(ranked(contract, ID, 2), at(2, 0xffffffff));
    assert_eq!(ranked(contract, ID, 3), at(3, 0xffffffff));
}

// Property test against the reference model

#[test]
fn test_leaderboard_matches_the_reference_model() {
    let contract = daily();
    let mut model = ModelTrait::new();
    // A deterministic pseudo-random walk over a small score range, so that ties are frequent
    let mut state: u128 = 12345;
    let mut i: u32 = 0;
    while i < 60 {
        state = (state * 25214903917 + 11) % 0x1000000000000;
        let score: u32 = ((state / 65536) % 12).try_into().unwrap();
        let player: felt252 = (i % 5).into() + 1;
        let before = model;
        model.score(player, score);
        let rank = submit(contract, ID, player, score);
        let placed = model.top() != before.top();
        assert_eq!(rank != 0, placed);
        assert_eq!(top(contract, ID), model.top());
        i += 1;
    }
}
