// Core imports

use debug::PrintTrait;

// Starknet imports

use starknet::testing::{set_contract_address, set_transaction_hash};

// Dojo imports

use dojo::world::{IWorldDispatcher, IWorldDispatcherTrait};

// Internal imports

use stolsli::constants;
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
use stolsli::systems::host::IHostDispatcherTrait;
use stolsli::systems::manage::IManageDispatcherTrait;
use stolsli::systems::play::IPlayDispatcherTrait;
use stolsli::tests::setup::{setup, setup::{Systems, PLAYER, ANYONE}};

// Constants

const BUILDER_NAME: felt252 = 'BUILDER';

#[test]
fn test_play_build_without_character() {
    // [Setup]
    let (world, systems, context) = setup::spawn_game();
    let store = StoreTrait::new(world);
    let game = store.game(context.game_id);

    // [Spawn]
    let player = store.player(context.player_id);
    systems.host.join(world, context.game_id, player.order);
    systems.host.start(world, game.id);

    // [Draw]
    systems.play.draw(world, game.id);
    let builder = store.builder(game, player.id);
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

    // [Spawn]
    let player = store.player(context.player_id);
    systems.host.join(world, context.game_id, player.order);
    systems.host.start(world, game.id);

    // [Draw]
    systems.play.draw(world, game.id); // FFCFFFCFF
    let builder = store.builder(game, player.id);
    let tile = store.tile(game, builder.tile_id);

    // [Build]
    let orientation = Orientation::North;
    let x = CENTER;
    let y = CENTER + 1;
    let role = Role::Lord;
    let spot = Spot::South;
    systems.play.build(world, context.game_id, tile.id, orientation, x, y, role, spot);
}

#[test]
#[should_panic(expected: ('Game: structure not idle', 'ENTRYPOINT_FAILED',))]
fn test_play_build_with_character_revert_not_idle() {
    // [Setup]
    let (world, systems, context) = setup::spawn_game();
    let store = StoreTrait::new(world);
    let game = store.game(context.game_id);

    // [Spawn]
    let player = store.player(context.player_id);
    systems.host.join(world, context.game_id, player.order);
    systems.host.start(world, game.id);

    // [Draw & Build]
    set_transaction_hash(0xa9);
    systems.play.draw(world, game.id); // WFFFFFFFR
    let builder = store.builder(game, player.id);
    let orientation = Orientation::North;
    let x = CENTER;
    let y = CENTER - 1;
    let role = Role::Lord;
    let spot = Spot::West;
    systems.play.build(world, context.game_id, builder.tile_id, orientation, x, y, role, spot);

    // [Draw & Build]
    set_transaction_hash(0x4);
    systems.play.draw(world, game.id); // SFRFRFFFR
    let builder = store.builder(game, player.id);
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

    // [Spawn]
    let player = store.player(context.player_id);
    systems.host.join(world, context.game_id, player.order);
    systems.host.start(world, game.id);

    // [Draw]
    systems.play.draw(world, game.id);
    let builder = store.builder(game, player.id);
    let tile = store.tile(game, builder.tile_id);

    // [Build]
    let orientation = Orientation::North;
    let x = CENTER;
    let y = CENTER + 1;
    let role = Role::Lord;
    let spot = Spot::South;
    systems.play.build(world, context.game_id, tile.id, orientation, x, y, role, spot);

    // [Assert]
    let builder = store.builder(game, player.id);
    let expected: u32 = 2 * constants::CITY_BASE_POINTS;
    assert(builder.score == expected, 'Build: builder score');
}

#[test]
fn test_play_build_complete_forest_inside_roads() {
    // [Setup]
    let (world, systems, context) = setup::spawn_game();
    let store = StoreTrait::new(world);
    let game = store.game(context.game_id);
    let none = Role::None;
    let woodsman = Role::Woodsman;
    let nowhere = Spot::None;
    let northeast = Spot::NorthEast;

    // [Spawn]
    let player = store.player(context.player_id);
    systems.host.join(world, context.game_id, player.order);
    systems.host.start(world, game.id);

    // [Draw & Build]
    set_transaction_hash(0xa9);
    systems.play.draw(world, game.id); // WFFFFFFFR
    let builder = store.builder(game, player.id);
    let orientation = Orientation::North;
    let x = CENTER;
    let y = CENTER - 1;
    systems.play.build(world, context.game_id, builder.tile_id, orientation, x, y, none, nowhere);

    // [Draw & Build]
    set_transaction_hash(0x4);
    systems.play.draw(world, game.id); // SFRFRFFFR
    let builder = store.builder(game, player.id);
    let orientation = Orientation::East;
    let x = CENTER - 1;
    let y = CENTER - 1;
    systems.play.build(world, context.game_id, builder.tile_id, orientation, x, y, none, nowhere);

    // [Draw & Build]
    set_transaction_hash(0x2);
    systems.play.draw(world, game.id); // RFFFRFFFR
    let builder = store.builder(game, player.id);
    let orientation = Orientation::East;
    let x = CENTER + 1;
    let y = CENTER - 1;
    systems.play.build(world, context.game_id, builder.tile_id, orientation, x, y, none, nowhere);

    // [Draw & Build]
    set_transaction_hash(0x1);
    systems.play.draw(world, game.id); // RFFFRFFFR
    let builder = store.builder(game, player.id);
    let orientation = Orientation::North;
    let x = CENTER;
    let y = CENTER - 2;
    systems.play.build(world, context.game_id, builder.tile_id, orientation, x, y, none, nowhere);

    // [Draw & Build]
    set_transaction_hash(0xc);
    systems.play.draw(world, game.id); // RFRFFFFFR
    let builder = store.builder(game, player.id);
    let orientation = Orientation::North;
    let x = CENTER + 1;
    let y = CENTER - 2;
    systems.play.build(world, context.game_id, builder.tile_id, orientation, x, y, none, nowhere);

    // [Draw & Build]
    set_transaction_hash(0x14);
    systems.play.draw(world, game.id); // RFRFFFFFR
    let builder = store.builder(game, player.id);
    let orientation = Orientation::East;
    let x = CENTER - 1;
    let y = CENTER - 2;
    systems
        .play
        .build(world, context.game_id, builder.tile_id, orientation, x, y, woodsman, northeast);

    // [Draw & Build]
    set_transaction_hash(0xe);
    systems.play.draw(world, game.id); // RFRFFFFFR
    let builder = store.builder(game, player.id);
    let orientation = Orientation::South;
    let x = CENTER - 1;
    let y = CENTER;
    systems.play.build(world, context.game_id, builder.tile_id, orientation, x, y, none, nowhere);

    // [Draw & Build]
    set_transaction_hash(0x1b);
    systems.play.draw(world, game.id); // RFRFFFFFR
    let builder = store.builder(game, player.id);
    let orientation = Orientation::West;
    let x = CENTER + 1;
    let y = CENTER;
    systems.play.build(world, context.game_id, builder.tile_id, orientation, x, y, none, nowhere);

    // [Assert]
    let builder = store.builder(game, player.id);
    let expected: u32 = 2 * constants::FOREST_BASE_POINTS;
    assert(builder.score == expected, 'Build: builder score');
}

#[test]
fn test_play_build_complete_forest_inside_castles() {
    // [Setup]
    let (world, systems, context) = setup::spawn_game();
    let store = StoreTrait::new(world);
    let game = store.game(context.game_id);
    let none = Role::None;
    let woodsman = Role::Woodsman;
    let nowhere = Spot::None;
    let northeast = Spot::NorthEast;

    // [Spawn]
    let player = store.player(context.player_id);
    systems.host.join(world, context.game_id, player.order);
    systems.host.start(world, game.id);

    // [Draw & Build]
    set_transaction_hash(0x52);
    systems.play.draw(world, game.id); // CCCCCFRFC
    let builder = store.builder(game, player.id);
    let orientation = Orientation::West;
    let x = CENTER - 1;
    let y = CENTER;
    systems
        .play
        .build(world, context.game_id, builder.tile_id, orientation, x, y, woodsman, northeast);

    // [Draw & Build]
    set_transaction_hash(0x1f);
    systems.play.draw(world, game.id); // CCCCCFFFC
    let builder = store.builder(game, player.id);
    let orientation = Orientation::South;
    let x = CENTER;
    let y = CENTER - 1;
    systems.play.build(world, context.game_id, builder.tile_id, orientation, x, y, none, nowhere);

    // [Draw & Build]
    set_transaction_hash(0x18);
    systems.play.draw(world, game.id); // RFRFCCCFR
    let builder = store.builder(game, player.id);
    let orientation = Orientation::North;
    let x = CENTER + 1;
    let y = CENTER;
    systems.play.build(world, context.game_id, builder.tile_id, orientation, x, y, none, nowhere);

    // [Draw & Build]
    set_transaction_hash(0x2);
    systems.play.draw(world, game.id); // WFFFFFFFR
    let builder = store.builder(game, player.id);
    let orientation = Orientation::West;
    let x = CENTER + 1;
    let y = CENTER + 1;
    systems.play.build(world, context.game_id, builder.tile_id, orientation, x, y, none, nowhere);

    // [Draw & Build]
    set_transaction_hash(0x16);
    systems.play.draw(world, game.id); // CCCCCFFFC
    let builder = store.builder(game, player.id);
    let orientation = Orientation::West;
    let x = CENTER;
    let y = CENTER + 1;
    systems.play.build(world, context.game_id, builder.tile_id, orientation, x, y, none, nowhere);

    // [Draw & Build]
    set_transaction_hash(0xc);
    systems.play.draw(world, game.id); // CCCCCFFFC
    let builder = store.builder(game, player.id);
    let orientation = Orientation::East;
    let x = CENTER + 2;
    let y = CENTER + 1;
    systems.play.build(world, context.game_id, builder.tile_id, orientation, x, y, none, nowhere);

    // [Draw & Build]
    set_transaction_hash(0x3e);
    systems.play.draw(world, game.id); // CFFFCFFFC
    let builder = store.builder(game, player.id);
    let orientation = Orientation::North;
    let x = CENTER + 1;
    let y = CENTER + 2;
    systems.play.build(world, context.game_id, builder.tile_id, orientation, x, y, none, nowhere);

    // [Assert]
    let builder = store.builder(game, player.id);
    let expected: u32 = 1 * constants::FOREST_BASE_POINTS;
    assert(builder.score == expected, 'Build: builder score');
}
