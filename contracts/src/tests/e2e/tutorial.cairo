use paved::models::game::GameTrait;
use paved::systems::tutorial::ITutorialDispatcherTrait;
use paved::tests::setup::setup;
use paved::tests::setup::setup::TestStoreTrait;
use paved::types::mode::Mode;

#[test]
#[available_gas(l2_gas: 67270000)]
fn test_tutorial_e2e_spawn_starts_game() {
    let (store, _, context) = setup::spawn_game(Mode::Tutorial);

    let game = store.game(context.game_id);
    let mode: Mode = game.mode.into();
    assert(game.tile_count > 0, 'Tutorial e2e: game started');
    assert(mode == Mode::Tutorial, 'Tutorial e2e: game mode');
}

#[test]
#[available_gas(l2_gas: 140970895)]
fn test_tutorial_e2e_scripted_run_is_deterministic() {
    let (store, systems, context) = setup::spawn_game(Mode::Tutorial);

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
