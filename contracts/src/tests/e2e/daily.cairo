use paved::constants;
use paved::models::game::GameTrait;
use paved::models::tile::CENTER;
use paved::models::tournament::TournamentTrait;
use paved::tests::setup::setup;
use paved::tests::setup::setup::{
    IDailyDispatcherTrait, IERC20DispatcherTrait, PLAYER, TestStoreTrait,
};
use paved::types::mode::Mode;
use paved::types::orientation::Orientation;
use paved::types::plan::Plan;
use paved::types::role::Role;
use paved::types::spot::Spot;

#[test]
#[available_gas(l2_gas: 117983000)]
fn test_daily_e2e_spawn_starts_game() {
    let (store, _, context) = setup::spawn_game(Mode::Daily);

    let game = store.game(context.game_id);
    let mode: Mode = game.mode.into();
    assert(game.tile_count > 0, 'Daily e2e: game started');
    assert(mode == Mode::Daily, 'Daily e2e: game mode');
}

#[test]
#[available_gas(l2_gas: 119496000)]
fn test_daily_e2e_spawn_moves_exactly_the_entry_price() {
    // No game spawned by the setup: spawn here to observe the balances around it.
    let (store, systems, context) = setup::spawn_game(Mode::None);
    let price: u256 = constants::DAILY_TOURNAMENT_PRICE.into();
    let daily = systems.daily.contract_address;

    let economy = systems.economy.contract_address;
    let player_before = context.token.balance_of(PLAYER());

    let game_id = systems.daily.spawn(1, core::num::traits::Zero::zero(), 0);

    let game = store.game(game_id);
    let tournament_id = TournamentTrait::compute_id(
        game.start_time, constants::DAILY_TOURNAMENT_DURATION,
    );
    let prize: u256 = store.tournament(tournament_id).prize.into();

    // The price went to Economy, which split it at once; the entry no longer feeds the prize
    assert(player_before - context.token.balance_of(PLAYER()) == price, 'Daily: player debit');
    assert(context.token.balance_of(daily) == 0, 'Daily: holds nothing');
    assert(context.token.balance_of(economy) == 0, 'Daily: economy holds nothing');
    assert(prize == 0, 'Daily: prize is sponsor-only');
}

#[test]
#[available_gas(l2_gas: 127274000)]
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
#[available_gas(l2_gas: 121477000)]
fn test_daily_e2e_surrender_ends_game() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);

    systems.daily.surrender(context.game_id);

    let game = store.game(context.game_id);
    assert(game.is_over(), 'Daily: game over');
}
