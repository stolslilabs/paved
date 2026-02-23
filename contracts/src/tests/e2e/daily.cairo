use paved::store::{StoreTrait};
use paved::models::game::{GameTrait};
use paved::models::tile::{CENTER};
use paved::types::mode::Mode;
use paved::types::orientation::Orientation;
use paved::types::role::Role;
use paved::types::spot::Spot;
use paved::types::plan::Plan;

use paved::tests::setup::{setup, setup::{IDailyDispatcherTrait}};

#[test]
fn test_daily_e2e_spawn_starts_game() {
    let (world, _, context) = setup::spawn_game(Mode::Daily);
    let store = StoreTrait::new(world);

    let game = store.game(context.game_id);
    let mode: Mode = game.mode.into();
    assert(game.tile_count > 0, 'Daily e2e: game started');
    assert(mode == Mode::Daily, 'Daily e2e: game mode');
}

#[test]
fn test_daily_e2e_build_increments_counter() {
    let (world, systems, context) = setup::spawn_game(Mode::Daily);
    let store = StoreTrait::new(world);

    let game = store.game(context.game_id);
    let builder = store.builder(game, context.player_id);
    let mut tile = store.tile(game, builder.tile_id);
    tile.plan = Plan::FFCFFFCFF.into();
    store.set_tile(tile);

    systems.daily.build(
        context.game_id,
        Orientation::North,
        CENTER,
        CENTER + 1,
        Role::None,
        Spot::None,
    );

    let game = store.game(context.game_id);
    assert(game.built == 1, 'Daily: build count');
}

#[test]
fn test_daily_e2e_surrender_ends_game() {
    let (world, systems, context) = setup::spawn_game(Mode::Daily);
    let store = StoreTrait::new(world);

    systems.daily.surrender(context.game_id);

    let game = store.game(context.game_id);
    assert(game.is_over(), 'Daily: game over');
}
