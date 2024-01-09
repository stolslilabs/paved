// Core imports

use debug::PrintTrait;

// Starknet imports

use starknet::testing::set_contract_address;

// Dojo imports

use dojo::world::{IWorldDispatcher, IWorldDispatcherTrait};

// Internal imports

use stolsli::store::{Store, StoreTrait};
use stolsli::models::game::{Game, GameTrait};
use stolsli::models::builder::{Builder, BuilderTrait};
use stolsli::models::order::Order;
use stolsli::systems::play::IPlayDispatcherTrait;
use stolsli::tests::setup::{setup, setup::{Systems, BUILDER, ANYONE}};

// Constants

const BUILDER_NAME: felt252 = 'BUILDER';

#[test]
fn test_play_reveal() {
    // [Setup]
    let (world, systems, context) = setup::spawn_game();
    let mut store = StoreTrait::new(world);

    // [Create]
    systems.play.create(world, context.game_id, BUILDER_NAME, Order::Anger.into());

    // [Reveal]
    systems.play.reveal(world, context.game_id);
}

#[test]
#[should_panic(expected: ('Builder: Cannot draw', 'ENTRYPOINT_FAILED',))]
fn test_play_reveal_twice_revert_cannot_draw() {
    // [Setup]
    let (world, systems, context) = setup::spawn_game();
    let mut store = StoreTrait::new(world);

    // [Create]
    systems.play.create(world, context.game_id, BUILDER_NAME, Order::Anger.into());

    // [Reveal]
    systems.play.reveal(world, context.game_id);
    systems.play.reveal(world, context.game_id);
}
