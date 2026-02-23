use paved::constants;
use paved::store::{StoreTrait};
use paved::models::game::{GameTrait};
use paved::models::tournament::{TournamentTrait};
use paved::models::tile::{CENTER};
use paved::types::mode::Mode;
use paved::types::orientation::Orientation;
use paved::types::role::Role;
use paved::types::spot::Spot;
use paved::types::plan::Plan;

use paved::tests::setup::{
    setup,
    setup::{IWeeklyDispatcherTrait, IERC20DispatcherTrait, PLAYER},
};
use snforge_std::start_cheat_block_timestamp_global;

#[test]
fn test_weekly_e2e_discard_increments_counter() {
    let (world, systems, context) = setup::spawn_game(Mode::Weekly);
    let store = StoreTrait::new(world);

    systems.weekly.discard(context.game_id);

    let game = store.game(context.game_id);
    assert(game.discarded == 1, 'Weekly: discard count');
}

#[test]
fn test_weekly_e2e_sponsor_updates_prize_and_balance() {
    let (world, systems, context) = setup::spawn_game(Mode::Weekly);
    let store = StoreTrait::new(world);

    let game = store.game(context.game_id);
    let tournament_id = TournamentTrait::compute_id(game.start_time, constants::WEEKLY_TOURNAMENT_DURATION);

    let prize_before = store.tournament(tournament_id).prize;
    let balance_before = context.token.balance_of(PLAYER());

    let sponsor_amount: felt252 = 3_000_000_000_000_000_000;
    systems.weekly.sponsor(sponsor_amount);

    let prize_after = store.tournament(tournament_id).prize;
    let balance_after = context.token.balance_of(PLAYER());

    assert(prize_after == prize_before + sponsor_amount, 'Weekly: sponsor prize');
    assert(balance_after < balance_before, 'Weekly: sponsor debit');
}

#[test]
fn test_weekly_e2e_claim_rewards_top_player_after_tournament_end() {
    start_cheat_block_timestamp_global(1000);

    let (world, systems, context) = setup::spawn_game(Mode::Weekly);
    let store = StoreTrait::new(world);

    let game = store.game(context.game_id);
    let tournament_id = TournamentTrait::compute_id(game.start_time, constants::WEEKLY_TOURNAMENT_DURATION);

    // Force a deterministic top-1 winner for this test.
    let mut tournament = store.tournament(tournament_id);
    tournament.top1_player_id = context.player_id;
    tournament.top1_score = 1;
    store.set_tournament(tournament);

    let balance_before = context.token.balance_of(PLAYER());

    start_cheat_block_timestamp_global(game.start_time + constants::WEEKLY_TOURNAMENT_DURATION + 1);
    systems.weekly.claim(tournament_id, 1);

    let tournament = store.tournament(tournament_id);
    let balance_after = context.token.balance_of(PLAYER());

    assert(tournament.top1_claimed, 'Weekly: claim marked');
    assert(balance_after > balance_before, 'Weekly: claim reward');
}

#[test]
#[should_panic(expected: ('Tournament: not over',))]
fn test_weekly_e2e_claim_reverts_before_tournament_end() {
    start_cheat_block_timestamp_global(1000);

    let (world, systems, context) = setup::spawn_game(Mode::Weekly);
    let store = StoreTrait::new(world);

    let game = store.game(context.game_id);
    let tournament_id = TournamentTrait::compute_id(game.start_time, constants::WEEKLY_TOURNAMENT_DURATION);

    let mut tournament = store.tournament(tournament_id);
    tournament.top1_player_id = context.player_id;
    tournament.top1_score = 1;
    store.set_tournament(tournament);

    systems.weekly.claim(tournament_id, 1);
}

#[test]
fn test_weekly_e2e_build_then_discard_tracks_both_actions() {
    let (world, systems, context) = setup::spawn_game(Mode::Weekly);
    let store = StoreTrait::new(world);

    let game = store.game(context.game_id);
    let builder = store.builder(game, context.player_id);
    let mut tile = store.tile(game, builder.tile_id);
    tile.plan = Plan::FFCFFFCFF.into();
    store.set_tile(tile);

    systems.weekly.build(
        context.game_id,
        Orientation::North,
        CENTER,
        CENTER + 1,
        Role::None,
        Spot::None,
    );
    systems.weekly.discard(context.game_id);

    let game = store.game(context.game_id);
    assert(game.built == 1, 'Weekly: build kept');
    assert(game.discarded == 1, 'Weekly: discard kept');
}
