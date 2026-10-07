//! Backend of the bench tests (`bench.cairo`): the operations through the leaderboard interface.

use paved::leaderboard::{LeaderboardImpl, LeaderboardTrait, Submission};
use starknet::ContractAddress;

pub fn submit(_c: ContractAddress, id: u64, player_id: felt252, score: u32) {
    LeaderboardImpl::new().submit(id, Submission { player_id, game_id: 1, score, time: 0 });
}

pub fn top1(_c: ContractAddress, id: u64) {
    let top = LeaderboardImpl::new().top(id);
    assert(top.first.score <= 0xffffffff, 'Bench: top');
}

pub fn ranked1(_c: ContractAddress, id: u64) {
    let ranked = LeaderboardImpl::new().ranked(id, 2);
    assert(ranked.score <= 0xffffffff, 'Bench: ranked');
}
