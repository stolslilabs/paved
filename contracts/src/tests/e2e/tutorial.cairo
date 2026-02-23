use paved::store::{StoreTrait};
use paved::models::game::{GameTrait};
use paved::types::mode::Mode;

use paved::tests::setup::setup;
use paved::systems::tutorial::ITutorialDispatcherTrait;

#[test]
fn test_tutorial_e2e_spawn_starts_game() {
    let (world, _, context) = setup::spawn_game(Mode::Tutorial);
    let store = StoreTrait::new(world);

    let game = store.game(context.game_id);
    let mode: Mode = game.mode.into();
    assert(game.tile_count > 0, 'Tutorial e2e: game started');
    assert(mode == Mode::Tutorial, 'Tutorial e2e: game mode');
}

#[test]
fn test_tutorial_e2e_scripted_run_is_deterministic() {
    let (world, systems, context) = setup::spawn_game(Mode::Tutorial);
    let store = StoreTrait::new(world);

    systems.tutorial.build(context.game_id);
    systems.tutorial.build(context.game_id);
    systems.tutorial.build(context.game_id);
    systems.tutorial.build(context.game_id);
    systems.tutorial.build(context.game_id);
    systems.tutorial.build(context.game_id);
    systems.tutorial.build(context.game_id);
    systems.tutorial.discard(context.game_id);
    systems.tutorial.build(context.game_id);

    let game = store.game(context.game_id);
    assert(game.is_over(), 'Tutorial e2e: game over');
    assert(game.score == 5078, 'Tutorial: score');
}
