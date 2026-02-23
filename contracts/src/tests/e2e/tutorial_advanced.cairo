use paved::store::{StoreTrait};
use paved::models::game::{GameTrait};
use paved::types::mode::Mode;

use paved::tests::setup::setup;
use paved::systems::tutorial::ITutorialDispatcherTrait;

#[test]
fn test_tutorial_e2e_surrender_ends_game() {
    let (world, systems, context) = setup::spawn_game(Mode::Tutorial);
    let store = StoreTrait::new(world);

    systems.tutorial.surrender(context.game_id);

    let game = store.game(context.game_id);
    assert(game.is_over(), 'Tutorial: game over');
}

#[test]
#[should_panic(expected: ('Game: is over',))]
fn test_tutorial_e2e_surrender_reverts_if_game_already_over() {
    let (_, systems, context) = setup::spawn_game(Mode::Tutorial);

    systems.tutorial.surrender(context.game_id);
    systems.tutorial.surrender(context.game_id);
}

#[test]
fn test_tutorial_e2e_discard_increments_counter_in_scripted_path() {
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

    let game = store.game(context.game_id);
    assert(game.discarded == 1, 'Tutorial: discard count');
    assert(!game.is_over(), 'Tutorial: not over yet');
}
