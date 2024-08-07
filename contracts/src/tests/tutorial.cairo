// Core imports

use core::debug::PrintTrait;

// Starknet imports

use starknet::testing::{set_contract_address, set_transaction_hash};

// Dojo imports

use dojo::world::{IWorldDispatcher, IWorldDispatcherTrait};

// Internal imports

use paved::constants;
use paved::store::{Store, StoreTrait};
use paved::models::game::{Game, GameTrait};
use paved::models::builder::{Builder, BuilderTrait};
use paved::models::tile::{Tile, TileTrait, CENTER};
use paved::types::orientation::Orientation;
use paved::types::direction::Direction;
use paved::types::plan::Plan;
use paved::types::role::Role;
use paved::types::spot::Spot;
use paved::systems::tutorial::ITutorialDispatcherTrait;

use paved::tests::setup::{setup, setup::{Mode, Systems, PLAYER, ANYONE}};

// Constants

const BUILDER_NAME: felt252 = 'PLAYER';

#[test]
fn test_tutorial_build_all() {
    // [Setup]
    let (world, systems, context) = setup::spawn_game(Mode::Tutorial);
    let store = StoreTrait::new(world);

    // [Build]
    systems.tutorial.build(context.game_id);
    systems.tutorial.build(context.game_id);
    systems.tutorial.build(context.game_id);
    systems.tutorial.build(context.game_id);
    systems.tutorial.build(context.game_id);
    systems.tutorial.build(context.game_id);
    systems.tutorial.build(context.game_id);
    systems.tutorial.discard(context.game_id);
    systems.tutorial.build(context.game_id);

    // [Assess] Game over and score
    let game = store.game(context.game_id);
    assert(game.is_over(), 'Tutorial: game over');
    assert(game.score == 5078, 'Tutorial: game score');
}
