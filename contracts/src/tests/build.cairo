// Core imports

use debug::PrintTrait;

// Starknet imports

use starknet::testing::{set_contract_address, set_transaction_hash};

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
    let builder = store.builder(game, BUILDER().into());
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
    let builder = store.builder(game, BUILDER().into());
    let tile = store.tile(game, builder.tile_id);

    // [Build]
    let orientation = Orientation::North;
    let x = CENTER;
    let y = CENTER + 1;
    let role = Role::Lord;
    let spot = Spot::Center;
    systems.play.build(world, context.game_id, tile.id, orientation, x, y, role, spot);
}

#[test]
#[should_panic(expected: ('Game: Structure not idle', 'ENTRYPOINT_FAILED',))]
fn test_play_build_with_character_revert_not_idle() {
    // [Setup]
    let (world, systems, context) = setup::spawn_game();
    let store = StoreTrait::new(world);
    let game = store.game(context.game_id);
    let lord = Role::Lord;
    let lady = Role::Lady;
    let spot = Spot::Center;

    // [Create]
    systems.play.create(world, game.id, BUILDER_NAME, Order::Anger.into());

    // [Draw & Build]
    set_transaction_hash(0x58);
    systems.play.draw(world, game.id); // WFFFFFFFR
    let builder = store.builder(game, BUILDER().into());
    let orientation = Orientation::North;
    let x = CENTER;
    let y = CENTER - 1;
    let role = Role::Lord;
    let spot = Spot::West;
    systems.play.build(world, context.game_id, builder.tile_id, orientation, x, y, role, spot);

    // [Draw & Build]
    set_transaction_hash(0x17);
    systems.play.draw(world, game.id); // SFRFRFFFR
    let builder = store.builder(game, BUILDER().into());
    let orientation = Orientation::East;
    let x = CENTER - 1;
    let y = CENTER - 1;
    let role = Role::Lady;
    let spot = Spot::East;
    systems.play.build(world, context.game_id, builder.tile_id, orientation, x, y, role, spot);
}

#[test]
fn test_play_build_complete_castle() {
    // [Setup]
    let (world, systems, context) = setup::spawn_game();
    let store = StoreTrait::new(world);
    let game = store.game(context.game_id);

    // [Create]
    systems.play.create(world, game.id, BUILDER_NAME, Order::Anger.into());

    // [Draw]
    systems.play.draw(world, game.id);
    let builder = store.builder(game, BUILDER().into());
    let tile = store.tile(game, builder.tile_id);

    // [Build]
    let orientation = Orientation::North;
    let x = CENTER;
    let y = CENTER + 1;
    let role = Role::Lord;
    let spot = Spot::South;
    systems.play.build(world, context.game_id, tile.id, orientation, x, y, role, spot);

    // [Assert]
    let builder = store.builder(game, BUILDER().into());
    assert(builder.score == 2, 'Build: builder score');
}

#[test]
fn test_play_build_complete_forest_inside_roads() {
    // [Setup]
    let (world, systems, context) = setup::spawn_game();
    let store = StoreTrait::new(world);
    let game = store.game(context.game_id);
    let none = Role::None;
    let lord = Role::Lord;
    let nowhere = Spot::None;
    let northeast = Spot::NorthEast;

    // [Create]
    systems.play.create(world, game.id, BUILDER_NAME, Order::Anger.into());

    // [Draw & Build]
    set_transaction_hash(0x58);
    systems.play.draw(world, game.id); // WFFFFFFFR
    let builder = store.builder(game, BUILDER().into());
    let orientation = Orientation::North;
    let x = CENTER;
    let y = CENTER - 1;
    systems.play.build(world, context.game_id, builder.tile_id, orientation, x, y, none, nowhere);

    // [Draw & Build]
    set_transaction_hash(0x17);
    systems.play.draw(world, game.id); // SFRFRFFFR
    let builder = store.builder(game, BUILDER().into());
    let orientation = Orientation::East;
    let x = CENTER - 1;
    let y = CENTER - 1;
    systems.play.build(world, context.game_id, builder.tile_id, orientation, x, y, none, nowhere);

    // [Draw & Build]
    set_transaction_hash(0x9);
    systems.play.draw(world, game.id); // RFFFRFFFR
    let builder = store.builder(game, BUILDER().into());
    let orientation = Orientation::East;
    let x = CENTER + 1;
    let y = CENTER - 1;
    systems.play.build(world, context.game_id, builder.tile_id, orientation, x, y, none, nowhere);

    // [Draw & Build]
    set_transaction_hash(0xa);
    systems.play.draw(world, game.id); // RFFFRFFFR
    let builder = store.builder(game, BUILDER().into());
    let orientation = Orientation::North;
    let x = CENTER;
    let y = CENTER - 2;
    systems.play.build(world, context.game_id, builder.tile_id, orientation, x, y, none, nowhere);

    // [Draw & Build]
    set_transaction_hash(0x19);
    systems.play.draw(world, game.id); // RFRFFFFFR
    let builder = store.builder(game, BUILDER().into());
    let orientation = Orientation::North;
    let x = CENTER + 1;
    let y = CENTER - 2;
    systems.play.build(world, context.game_id, builder.tile_id, orientation, x, y, none, nowhere);

    // [Draw & Build]
    set_transaction_hash(0xe);
    systems.play.draw(world, game.id); // RFRFFFFFR
    let builder = store.builder(game, BUILDER().into());
    let orientation = Orientation::East;
    let x = CENTER - 1;
    let y = CENTER - 2;
    systems.play.build(world, context.game_id, builder.tile_id, orientation, x, y, lord, northeast);

    // [Draw & Build]
    set_transaction_hash(0x5);
    systems.play.draw(world, game.id); // RFRFFFFFR
    let builder = store.builder(game, BUILDER().into());
    let orientation = Orientation::South;
    let x = CENTER - 1;
    let y = CENTER;
    systems.play.build(world, context.game_id, builder.tile_id, orientation, x, y, none, nowhere);

    // [Draw & Build]
    set_transaction_hash(0x7);
    systems.play.draw(world, game.id); // RFRFFFFFR
    let builder = store.builder(game, BUILDER().into());
    let orientation = Orientation::West;
    let x = CENTER + 1;
    let y = CENTER;
    systems.play.build(world, context.game_id, builder.tile_id, orientation, x, y, none, nowhere);

    // [Assert]
    let builder = store.builder(game, BUILDER().into());
    assert(builder.score == 2, 'Build: builder score');
}

#[test]
fn test_play_build_complete_forest_inside_castles() {
    // [Setup]
    let (world, systems, context) = setup::spawn_game();
    let store = StoreTrait::new(world);
    let game = store.game(context.game_id);
    let none = Role::None;
    let lord = Role::Lord;
    let nowhere = Spot::None;
    let northeast = Spot::NorthEast;

    // [Create]
    systems.play.create(world, game.id, BUILDER_NAME, Order::Anger.into());

    // [Draw & Build]
    set_transaction_hash(0x2);
    systems.play.draw(world, game.id); // CCCCCFRFC
    let builder = store.builder(game, BUILDER().into());
    let orientation = Orientation::West;
    let x = CENTER - 1;
    let y = CENTER;
    systems.play.build(world, context.game_id, builder.tile_id, orientation, x, y, lord, northeast);

    // [Draw & Build]
    set_transaction_hash(0x6);
    systems.play.draw(world, game.id); // CCCCCFFFC
    let builder = store.builder(game, BUILDER().into());
    let orientation = Orientation::South;
    let x = CENTER;
    let y = CENTER - 1;
    systems.play.build(world, context.game_id, builder.tile_id, orientation, x, y, none, nowhere);

    // [Draw & Build]
    set_transaction_hash(0x5);
    systems.play.draw(world, game.id); // RFRFCCCFR
    let builder = store.builder(game, BUILDER().into());
    let orientation = Orientation::North;
    let x = CENTER + 1;
    let y = CENTER;
    systems.play.build(world, context.game_id, builder.tile_id, orientation, x, y, none, nowhere);

    // [Draw & Build]
    set_transaction_hash(0x24);
    systems.play.draw(world, game.id); // WFFFFFFFR
    let builder = store.builder(game, BUILDER().into());
    let orientation = Orientation::West;
    let x = CENTER + 1;
    let y = CENTER + 1;
    systems.play.build(world, context.game_id, builder.tile_id, orientation, x, y, none, nowhere);

    // [Draw & Build]
    set_transaction_hash(0x1);
    systems.play.draw(world, game.id); // CCCCCFFFC
    let builder = store.builder(game, BUILDER().into());
    let orientation = Orientation::West;
    let x = CENTER;
    let y = CENTER + 1;
    systems.play.build(world, context.game_id, builder.tile_id, orientation, x, y, none, nowhere);

    // [Draw & Build]
    set_transaction_hash(0xa);
    systems.play.draw(world, game.id); // CCCCCFFFC
    let builder = store.builder(game, BUILDER().into());
    let orientation = Orientation::East;
    let x = CENTER + 2;
    let y = CENTER + 1;
    systems.play.build(world, context.game_id, builder.tile_id, orientation, x, y, none, nowhere);

    // [Draw & Build]
    set_transaction_hash(0x6);
    systems.play.draw(world, game.id); // CFFFCFFFC
    let builder = store.builder(game, BUILDER().into());
    let orientation = Orientation::North;
    let x = CENTER + 1;
    let y = CENTER + 2;
    systems.play.build(world, context.game_id, builder.tile_id, orientation, x, y, none, nowhere);

    // [Assert]
    let builder = store.builder(game, BUILDER().into());
    assert(builder.score == 1, 'Build: builder score');
}
