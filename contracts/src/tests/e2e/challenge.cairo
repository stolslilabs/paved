use paved::constants;
use paved::models::game::GameTrait;
use paved::models::tile::CENTER;
use paved::tests::setup::setup;
use paved::tests::setup::setup::{
    IChallengeDispatcherTrait, IERC20DispatcherTrait, PLAYER, TestStoreTrait,
};
use paved::types::mode::Mode;
use paved::types::orientation::Orientation;
use paved::types::plan::Plan;

#[test]
#[available_gas(l2_gas: 80722938)]
fn test_daily_e2e_spawn_starts_game() {
    let (store, _, context) = setup::spawn_game(Mode::Challenge);

    let game = store.game(context.game_id);
    let mode: Mode = game.mode.into();
    assert(game.tile_count > 0, 'Daily e2e: game started');
    assert(mode == Mode::Challenge, 'Daily e2e: game mode');
}

#[test]
#[available_gas(l2_gas: 81648618)]
fn test_daily_e2e_spawn_moves_exactly_the_entry_price() {
    // No game spawned by the setup: spawn here to observe the balances around it.
    let (store, systems, context) = setup::spawn_game(Mode::None);
    let price: u256 = constants::CHALLENGE_PRICE.into();
    let challenge = systems.challenge.contract_address;

    let economy = systems.economy.contract_address;
    let player_before = context.token.balance_of(PLAYER());

    let game_id = systems.challenge.spawn(1, core::num::traits::Zero::zero(), 0);

    assert(store.game(game_id).id == game_id, 'Challenge: game spawned');

    // The price went to Economy, which split it at once; `Daily` holds nothing (no prize, D-20)
    assert(player_before - context.token.balance_of(PLAYER()) == price, 'Challenge: player debit');
    assert(context.token.balance_of(challenge) == 0, 'Challenge: holds nothing');
    assert(context.token.balance_of(economy) == 0, 'Challenge: economy holds none');
}

#[test]
#[available_gas(l2_gas: 90459346)]
fn test_daily_e2e_build_increments_counter() {
    let (store, systems, context) = setup::spawn_game(Mode::Challenge);

    let game = store.game(context.game_id);
    let builder = store.builder(game, context.player_id);
    let mut tile = store.tile(game, builder.tile_id);
    tile.plan = Plan::FFCFFFCFF.into();
    store.set_tile(tile);

    systems.challenge.build(context.game_id, Orientation::North, CENTER, CENTER + 1);

    let game = store.game(context.game_id);
    assert(game.built == 1, 'Challenge: build count');
}

#[test]
#[available_gas(l2_gas: 84472274)]
fn test_daily_e2e_surrender_ends_game() {
    let (store, systems, context) = setup::spawn_game(Mode::Challenge);

    systems.challenge.surrender(context.game_id);

    let game = store.game(context.game_id);
    assert(game.is_over(), 'Challenge: game over');
}
