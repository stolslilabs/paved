//! P-37, P-37b: after a day nobody ranked in (nobody played, or every score 0), its sponsors take
//! back what each put in, through `Daily.claim(day, 0)` (rank 0 is the sponsor's reclaim, run in
//! `Lobby`). A day with a ranked game has nothing to reclaim: rank 1 takes the shares of the empty
//! ranks, as before.

use paved::constants;
use paved::systems::daily::{IDailySafeDispatcher, IDailySafeDispatcherTrait};
use paved::systems::lobby::Lobby;
use paved::tests::leaderboard;
use paved::tests::setup::setup;
use paved::tests::setup::setup::{
    ANYONE, IDailyDispatcherTrait, IERC20DispatcherTrait, PLAYER, SOMEONE, TestStoreTrait,
};
use paved::types::mode::Mode;
use paved::views::{ITournamentViewDispatcher, ITournamentViewDispatcherTrait};
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

/// One ranked game: rank 1 takes the whole prize, and the sponsor's reclaim reverts.
#[test]
#[should_panic(expected: 'Tournament: nothing to reclaim')]
fn test_reclaim_with_one_ranked_game_reverts() {
    let (store, systems, context) = start();
    leaderboard::submit(store.contract, D, context.player_id, 100);
    sponsor(@systems, ANYONE(), 6_000_000);
    end_day();
    assert(take(@systems, @context, PLAYER(), 1) == 6_000_000, 'Reclaim: rank 1');
    assert(context.token.balance_of(systems.daily.contract_address) == 0, 'Reclaim: left');
    take(@systems, @context, ANYONE(), 0);
}

/// Two ranked games: rank 2 gets a third, rank 1 the rest (rank 3's share included), and the
/// sponsor's reclaim reverts.
#[test]
#[should_panic(expected: 'Tournament: nothing to reclaim')]
fn test_reclaim_with_two_ranked_games_reverts() {
    let (store, systems, context) = start();
    leaderboard::submit(store.contract, D, context.player_id, 200);
    leaderboard::submit(store.contract, D, context.someone_id, 100);
    sponsor(@systems, ANYONE(), 6_000_000);
    end_day();
    assert(take(@systems, @context, PLAYER(), 1) == 4_000_000, 'Reclaim: rank 1');
    assert(take(@systems, @context, SOMEONE(), 2) == 2_000_000, 'Reclaim: rank 2');
    assert(context.token.balance_of(systems.daily.contract_address) == 0, 'Reclaim: left');
    take(@systems, @context, ANYONE(), 0);
}

/// Two sponsors (2,000,000 and 1,000,001) of a day nobody ranked in: each takes back exactly what
/// it put in. Reclaims add up to the prize, 3,000,001: no dust stays in `Daily`.
#[test]
#[available_gas(l2_gas: 67013665)]
fn test_reclaim_pro_rata_on_an_empty_top() {
    let (_, systems, context) = start();
    sponsor(@systems, ANYONE(), 2_000_000);
    sponsor(@systems, SOMEONE(), 1_000_001);
    end_day();
    let first = take(@systems, @context, ANYONE(), 0);
    let second = take(@systems, @context, SOMEONE(), 0);
    assert(first == 2_000_000, 'Reclaim: first sponsor');
    assert(second == 1_000_001, 'Reclaim: second sponsor');
    assert(first + second == 3_000_001, 'Reclaim: sum');
    assert(context.token.balance_of(systems.daily.contract_address) == 0, 'Reclaim: dust');
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

/// A game spawned on day D and sponsored, its day ended and reclaimed (rank 0), then ended on D+1
/// with a POSITIVE score (4,500, which would rank first if it counted in D): it ranks nothing in D,
/// no rank can claim D's prize, and the reclaim already paid stays intact. The prize of D stays
/// the historical total (`Reclaimed` gives what went back).
#[test]
fn test_reclaim_then_late_game_over_ranks_nothing() {
    let (store, systems, context) = start();
    let game_id = systems.daily.spawn(1, core::num::traits::Zero::zero(), 0);
    let mut game = store.game(game_id);
    game.score = 4500;
    store.set_game(game);
    sponsor(@systems, PLAYER(), 2_000_000);
    end_day();
    assert(take(@systems, @context, PLAYER(), 0) == 2_000_000, 'Reclaim: whole prize');
    let daily_address = systems.daily.contract_address;
    let held = context.token.balance_of(daily_address);
    // [Effect] The game ends on D+1 with a positive score
    start_cheat_block_timestamp_global((D + 1) * DAY + 3600);
    start_cheat_caller_address(daily_address, PLAYER());
    systems.daily.surrender(game_id);
    assert(store.game(game_id).over, 'Reclaim: game over');
    assert(store.game(game_id).score == 4500, 'Reclaim: late score');
    // [Check] Nothing ranks in D, its prize is the historical total
    let tournaments = ITournamentViewDispatcher { contract_address: daily_address };
    let day = tournaments.tournament(D);
    assert(day.top1_player_id == 0 && day.top1_score == 0, 'Reclaim: D ranked');
    assert(day.top2_player_id == 0 && day.top3_player_id == 0, 'Reclaim: D ranked 2');
    assert(day.prize == 2_000_000, 'Reclaim: prize history');
    // [Check] Nor does it rank in D+1: a game ranks only in the day it started in
    // (`end_in_tournament`)
    assert(tournaments.tournament(D + 1).top1_player_id == 0, 'Reclaim: D+1 ranked');
    // [Check] No rank claims D's prize, and the reclaim is spent
    let daily = IDailySafeDispatcher { contract_address: daily_address };
    assert(daily.claim(D, 1).is_err(), 'Reclaim: rank 1 claimed');
    assert(daily.claim(D, 2).is_err(), 'Reclaim: rank 2 claimed');
    assert(daily.claim(D, 3).is_err(), 'Reclaim: rank 3 claimed');
    assert(daily.claim(D, 0).is_err(), 'Reclaim: reclaimed twice');
    // [Check] The late game over moved no USDC of `Daily`'s
    assert(context.token.balance_of(daily_address) == held, 'Reclaim: Daily USDC moved');
    assert(held == 0, 'Reclaim: left in Daily');
}

/// Two sponsorships of one sponsor on one day (1,000,000 then 500,000) come back together.
#[test]
fn test_reclaim_sums_two_sponsorships_of_one_sponsor() {
    let (_, systems, context) = start();
    sponsor(@systems, ANYONE(), 1_000_000);
    sponsor(@systems, ANYONE(), 500_000);
    end_day();
    assert(take(@systems, @context, ANYONE(), 0) == 1_500_000, 'Reclaim: sum');
    assert(context.token.balance_of(systems.daily.contract_address) == 0, 'Reclaim: left in Daily');
}

/// A sponsorship after the day lands in day D+1's prize, not D's.
#[test]
fn test_sponsorship_after_the_day_lands_in_the_next_one() {
    let (_, systems, _) = start();
    sponsor(@systems, ANYONE(), 1_000_000);
    end_day();
    sponsor(@systems, ANYONE(), 700_000);
    let tournaments = ITournamentViewDispatcher {
        contract_address: systems.daily.contract_address,
    };
    assert(tournaments.tournament(D).prize == 1_000_000, 'Sponsor: day D');
    assert(tournaments.tournament(D + 1).prize == 700_000, 'Sponsor: day D+1');
}
