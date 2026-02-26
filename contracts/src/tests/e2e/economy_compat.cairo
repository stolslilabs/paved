use paved::constants;
use paved::store::{StoreTrait};
use paved::models::tournament::TournamentTrait;
use paved::types::mode::Mode;
use paved::tests::setup::{setup, setup::{IDailyDispatcherTrait, IWeeklyDispatcherTrait},};
use snforge_std::start_cheat_block_timestamp_global;

#[test]
fn test_economy_compat_daily_and_weekly_flows_still_spawn_games() {
    let (world, systems, _) = setup::spawn_game(Mode::None);
    let store = StoreTrait::new(world);

    let daily_game_id = systems.daily.spawn();
    let weekly_game_id = systems.weekly.spawn();

    let daily_game = store.game(daily_game_id);
    let weekly_game = store.game(weekly_game_id);

    assert(daily_game.tile_count > 0, 'EconomyCompat: daily spawn');
    assert(weekly_game.tile_count > 0, 'EconomyCompat: weekly spawn');
}

#[test]
#[should_panic(expected: ('Tournament: not over',))]
fn test_economy_compat_existing_claim_rank_guard_unchanged() {
    start_cheat_block_timestamp_global(100);

    let (world, systems, context) = setup::spawn_game(Mode::Daily);
    let store = StoreTrait::new(world);
    let game = store.game(context.game_id);
    let tournament_id = TournamentTrait::compute_id(
        game.start_time, constants::DAILY_TOURNAMENT_DURATION
    );

    let mut tournament = store.tournament(tournament_id);
    tournament.top1_player_id = context.player_id;
    tournament.top1_game_id = game.id;
    tournament.top1_multiplier_fp = game.entry_multiplier_fp;
    tournament.top1_score = 1;
    store.set_tournament(tournament);

    systems.daily.claim(tournament_id, 1);
}
