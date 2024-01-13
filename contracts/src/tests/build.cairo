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
use stolsli::models::tile::{Tile, TileTrait, CENTER};
use stolsli::types::order::Order;
use stolsli::types::orientation::Orientation;
use stolsli::types::direction::Direction;
use stolsli::types::plan::Plan;
use stolsli::types::role::Role;
use stolsli::types::spot::Spot;
use stolsli::systems::play::IPlayDispatcherTrait;
use stolsli::tests::setup::{setup, setup::{Systems, BUILDER, ANYONE}};

// Constants

const BUILDER_NAME: felt252 = 'BUILDER';

#[test]
fn test_play_build_without_character() {
    // [Setup]
    let (world, systems, context) = setup::spawn_game();
    let store = StoreTrait::new(world);
    let game = store.game(context.game_id);

    // [Create]
    systems.play.create(world, game.id, BUILDER_NAME, Order::Anger.into());

    // [Draw]
    systems.play.draw(world, game.id);
    let builder = store.builder(game, BUILDER());
    let tile = store.tile(game, builder.tile_id);

    // [Build]
    let orientation = Orientation::North;
    let x = CENTER;
    let y = CENTER + 1;
    let role = Role::None;
    let spot = Spot::None;
    systems.play.build(world, context.game_id, tile.id, orientation, x, y, role, spot);
}

#[test]
fn test_play_build_with_character() {
    // [Setup]
    let (world, systems, context) = setup::spawn_game();
    let store = StoreTrait::new(world);
    let game = store.game(context.game_id);

    // [Create]
    systems.play.create(world, game.id, BUILDER_NAME, Order::Anger.into());

    // [Draw]
    systems.play.draw(world, game.id);
    let builder = store.builder(game, BUILDER());
    let tile = store.tile(game, builder.tile_id);

    // [Build]
    let orientation = Orientation::North;
    let x = CENTER;
    let y = CENTER + 1;
    let role = Role::Lord;
    let spot = Spot::Center;
    systems.play.build(world, context.game_id, tile.id, orientation, x, y, role, spot);
}
