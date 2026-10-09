//! P-37: after a day, what no rank can claim goes back to its sponsors, pro rata to what each put
//! in, through `Daily.claim(day, 0)` (rank 0 is the sponsor's reclaim, run in `Lobby`). The shares
//! are fixed: 1/6 to rank 3, a third of the rest to rank 2, the remainder to rank 1; the share of
//! an empty rank is reclaimable, and the whole prize when nobody ranked.

use paved::constants;
use paved::systems::lobby::Lobby;
use paved::tests::leaderboard;
use paved::tests::setup::setup;
use paved::tests::setup::setup::{
    ANYONE, IDailyDispatcherTrait, IERC20DispatcherTrait, PLAYER, SOMEONE, TestStoreTrait,
};
use paved::types::mode::Mode;
use snforge_std::{
    EventSpyAssertionsTrait, spy_events, start_cheat_block_timestamp_global,
    start_cheat_caller_address,
};
use starknet::ContractAddress;

const DAY: u64 = constants::DAILY_TOURNAMENT_DURATION;
/// The day of the tests (an hour into it).
const D: u64 = 3;

fn start() -> (setup::TestStore, setup::Systems, setup::Context) {
    start_cheat_block_timestamp_global(D * DAY + 3600);
    setup::spawn_game(Mode::None)
}

fn sponsor(systems: @setup::Systems, who: ContractAddress, amount: felt252) {
    start_cheat_caller_address(*systems.daily.contract_address, who);
    systems.daily.sponsor(amount);
}

/// `who` reclaims day `D` (or claims its rank) and gets what moved to it.
fn take(
    systems: @setup::Systems, context: @setup::Context, who: ContractAddress, rank: u8,
) -> u256 {
    let token = *context.token;
    let before = token.balance_of(who);
    start_cheat_caller_address(*systems.daily.contract_address, who);
    systems.daily.claim(D, rank);
    token.balance_of(who) - before
}

fn end_day() {
    start_cheat_block_timestamp_global((D + 1) * DAY);
}

#[test]
#[available_gas(l2_gas: 62712533)]
fn test_reclaim_whole_prize_when_nobody_played() {
    let (_, systems, context) = start();
    sponsor(@systems, PLAYER(), 3_000_000);
    end_day();
    let mut spy = spy_events();
    assert(take(@systems, @context, PLAYER(), 0) == 3_000_000, 'Reclaim: whole prize');
    let daily = systems.daily.contract_address;
    spy
        .assert_emitted(
            @array![
                (
                    daily,
                    Lobby::Event::Reclaimed(
                        Lobby::Reclaimed { tournament_id: D, sponsor: PLAYER(), amount: 3_000_000 },
                    ),
                ),
            ],
        );
    assert(context.token.balance_of(daily) == 0, 'Reclaim: left in Daily');
}

#[test]
#[available_gas(l2_gas: 126187148)]
fn test_reclaim_whole_prize_when_every_score_is_zero() {
    let (store, systems, context) = start();
    let game_id = systems.daily.spawn(1, core::num::traits::Zero::zero(), 0);
    systems.daily.surrender(game_id);
    assert(store.game(game_id).score == 0, 'Reclaim: score');
    sponsor(@systems, ANYONE(), 2_000_000);
    end_day();
    assert(take(@systems, @context, ANYONE(), 0) == 2_000_000, 'Reclaim: whole prize');
}

/// One ranked game: ranks 2 and 3 are empty, their shares go back. Prize 6 USDC: rank 1 gets
/// 3,333,334, ranks 2 and 3 would get 1,666,666 and 1,000,000.
#[test]
#[available_gas(l2_gas: 67531473)]
fn test_reclaim_the_shares_of_two_empty_ranks() {
    let (store, systems, context) = start();
    leaderboard::submit(store.contract, D, context.player_id, 100);
    sponsor(@systems, ANYONE(), 6_000_000);
    end_day();
    assert(take(@systems, @context, PLAYER(), 1) == 3_333_334, 'Reclaim: rank 1');
    assert(take(@systems, @context, ANYONE(), 0) == 2_666_666, 'Reclaim: ranks 2 and 3');
    assert(context.token.balance_of(systems.daily.contract_address) == 0, 'Reclaim: left');
}

/// Two ranked games: rank 3 is empty, its 1/6 goes back.
#[test]
#[available_gas(l2_gas: 71697072)]
fn test_reclaim_the_share_of_one_empty_rank() {
    let (store, systems, context) = start();
    leaderboard::submit(store.contract, D, context.player_id, 200);
    leaderboard::submit(store.contract, D, context.someone_id, 100);
    sponsor(@systems, ANYONE(), 6_000_000);
    end_day();
    assert(take(@systems, @context, PLAYER(), 1) == 3_333_334, 'Reclaim: rank 1');
    assert(take(@systems, @context, SOMEONE(), 2) == 1_666_666, 'Reclaim: rank 2');
    assert(take(@systems, @context, ANYONE(), 0) == 1_000_000, 'Reclaim: rank 3');
    assert(context.token.balance_of(systems.daily.contract_address) == 0, 'Reclaim: left');
}

/// Two sponsors (2,000,000 and 1,000,001, prize 3,000,001), one ranked game. Rank 1 claims
/// 1,666,668; ranks 2 and 3 leave 833,333 + 500,000 = 1,333,333, shared pro rata and rounded
/// down: 888,888 and 444,444. Claims and reclaims add up to the prize less 1 base unit of dust,
/// which stays in `Daily`.
#[test]
#[available_gas(l2_gas: 72944577)]
fn test_reclaim_pro_rata_with_the_dust_in_daily() {
    let (store, systems, context) = start();
    leaderboard::submit(store.contract, D, context.player_id, 100);
    sponsor(@systems, ANYONE(), 2_000_000);
    sponsor(@systems, SOMEONE(), 1_000_001);
    end_day();
    let rank1 = take(@systems, @context, PLAYER(), 1);
    let first = take(@systems, @context, ANYONE(), 0);
    let second = take(@systems, @context, SOMEONE(), 0);
    assert(rank1 == 1_666_668, 'Reclaim: rank 1');
    assert(first == 888_888, 'Reclaim: first sponsor');
    assert(second == 444_444, 'Reclaim: second sponsor');
    assert(rank1 + first + second == 3_000_000, 'Reclaim: sum');
    assert(context.token.balance_of(systems.daily.contract_address) == 1, 'Reclaim: dust');
}

#[test]
#[should_panic(expected: 'Tournament: nothing to reclaim')]
fn test_reclaim_twice_reverts() {
    let (_, systems, context) = start();
    sponsor(@systems, PLAYER(), 1_000_000);
    end_day();
    take(@systems, @context, PLAYER(), 0);
    take(@systems, @context, PLAYER(), 0);
}

#[test]
#[should_panic(expected: 'Tournament: nothing to reclaim')]
fn test_reclaim_by_a_non_sponsor_reverts() {
    let (_, systems, context) = start();
    sponsor(@systems, PLAYER(), 1_000_000);
    end_day();
    take(@systems, @context, ANYONE(), 0);
}

#[test]
#[should_panic(expected: 'Tournament: not over')]
fn test_reclaim_before_the_day_ends_reverts() {
    let (_, systems, context) = start();
    sponsor(@systems, PLAYER(), 1_000_000);
    take(@systems, @context, PLAYER(), 0);
}

/// Every rank held: nothing is reclaimable.
#[test]
#[should_panic(expected: 'Tournament: nothing to reclaim')]
fn test_reclaim_with_every_rank_held_reverts() {
    let (store, systems, context) = start();
    leaderboard::submit(store.contract, D, context.player_id, 300);
    leaderboard::submit(store.contract, D, context.someone_id, 200);
    leaderboard::submit(store.contract, D, context.anyone_id, 100);
    sponsor(@systems, ANYONE(), 6_000_000);
    end_day();
    take(@systems, @context, ANYONE(), 0);
}
