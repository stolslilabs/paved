use paved::constants;
use paved::models::game::GameTrait;
use paved::models::tile::CENTER;
use paved::models::tournament::TournamentTrait;
use paved::tests::setup::setup::TestStoreTrait;
use paved::tests::setup::setup;
use paved::tests::setup::setup::{IDailyDispatcherTrait, IERC20DispatcherTrait, PLAYER};
use paved::types::mode::Mode;
use paved::types::orientation::Orientation;
use paved::types::plan::Plan;
use paved::types::role::Role;
use paved::types::spot::Spot;

#[test]
fn test_daily_e2e_spawn_starts_game() {
    let (store, _, context) = setup::spawn_game(Mode::Daily);

    let game = store.game(context.game_id);
    let mode: Mode = game.mode.into();
    assert(game.tile_count > 0, 'Daily e2e: game started');
    assert(mode == Mode::Daily, 'Daily e2e: game mode');
}

#[test]
fn test_daily_e2e_spawn_moves_exactly_the_entry_price() {
    // No game spawned by the setup: spawn here to observe the balances around it.
    let (store, systems, context) = setup::spawn_game(Mode::None);
    let price: u256 = constants::DAILY_TOURNAMENT_PRICE.into();
    let daily = systems.daily.contract_address;

    let player_before = context.token.balance_of(PLAYER());
    let pool_before = context.token.balance_of(daily);

    let game_id = systems.daily.spawn();

    let game = store.game(game_id);
    let tournament_id = TournamentTrait::compute_id(
        game.start_time, constants::DAILY_TOURNAMENT_DURATION,
    );
    let prize: u256 = store.tournament(tournament_id).prize.into();

    assert(player_before - context.token.balance_of(PLAYER()) == price, 'Daily: player debit');
    assert(context.token.balance_of(daily) - pool_before == price, 'Daily: pool credit');
    assert(prize == price, 'Daily: prize grows');
}

#[test]
fn test_daily_e2e_build_increments_counter() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);

    let game = store.game(context.game_id);
    let builder = store.builder(game, context.player_id);
    let mut tile = store.tile(game, builder.tile_id);
    tile.plan = Plan::FFCFFFCFF.into();
    store.set_tile(tile);

    systems
        .daily
        .build(context.game_id, Orientation::North, CENTER, CENTER + 1, Role::None, Spot::None);

    let game = store.game(context.game_id);
    assert(game.built == 1, 'Daily: build count');
}

#[test]
fn test_daily_e2e_surrender_ends_game() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);

    systems.daily.surrender(context.game_id);

    let game = store.game(context.game_id);
    assert(game.is_over(), 'Daily: game over');
}
