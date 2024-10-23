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
use paved::systems::daily::IDailyDispatcherTrait;

use paved::tests::setup::{setup, setup::{Mode, Systems, PLAYER, ANYONE}};

// Constants

const BUILDER_NAME: felt252 = 'PLAYER';

#[test]
fn test_play_build_without_character() {
    // [Setup]
    let (world, systems, context) = setup::spawn_game(Mode::Daily);
    let store = StoreTrait::new(world);

    // [Draw]
    let game = store.game(context.game_id);
    let builder = store.builder(game, context.player_id);
    let mut tile = store.tile(game, builder.tile_id);
    tile.plan = Plan::FFCFFFCFF.into();
    store.set_tile(tile);

    // [Build]
    let orientation = Orientation::North;
    let x = CENTER;
    let y = CENTER + 1;
    let role = Role::None;
    let spot = Spot::None;
    systems.daily.build(context.game_id, orientation, x, y, role, spot);
}

#[test]
fn test_play_build_with_character() {
    // [Setup]
    let (world, systems, context) = setup::spawn_game(Mode::Daily);
    let store = StoreTrait::new(world);

    // [Draw]
    let game = store.game(context.game_id);
    let builder = store.builder(game, context.player_id);
    let mut tile = store.tile(game, builder.tile_id);
    tile.plan = Plan::FFCFFFCFF.into();
    store.set_tile(tile);

    // [Build]
    let orientation = Orientation::North;
    let x = CENTER;
    let y = CENTER + 1;
    systems.daily.build(context.game_id, orientation, x, y, Role::Lord, Spot::South);
}

#[test]
#[should_panic(expected: ('Game: structure not idle', 'ENTRYPOINT_FAILED',))]
fn test_play_build_with_character_revert_not_idle() {
    // [Setup]
    let (world, systems, context) = setup::spawn_game(Mode::Daily);
    let store = StoreTrait::new(world);

    // [Draw & Build]
    let game = store.game(context.game_id);
    let builder = store.builder(game, context.player_id);
    let mut tile = store.tile(game, builder.tile_id);
    tile.plan = Plan::WFFFFFFFR.into();
    store.set_tile(tile);
    let orientation = Orientation::North;
    let x = CENTER;
    let y = CENTER - 1;
    let role = Role::Lord;
    let spot = Spot::West;
    systems.daily.build(context.game_id, orientation, x, y, role, spot);

    // [Draw & Build]
    let game = store.game(context.game_id);
    let builder = store.builder(game, context.player_id);
    let mut tile = store.tile(game, builder.tile_id);
    tile.plan = Plan::SFRFRFFFR.into();
    store.set_tile(tile);
    let orientation = Orientation::North;
    let x = CENTER - 1;
    let y = CENTER - 1;
    let role = Role::Lady;
    let spot = Spot::East;
    systems.daily.build(context.game_id, orientation, x, y, role, spot);
}

#[test]
fn test_play_build_complete_castle() {
    // [Setup]
    let (world, systems, context) = setup::spawn_game(Mode::Daily);
    let store = StoreTrait::new(world);

    // [Draw]
    let game = store.game(context.game_id);
    let builder = store.builder(game, context.player_id);
    let mut tile = store.tile(game, builder.tile_id);
    tile.plan = Plan::FFCFFFCFF.into();
    store.set_tile(tile);

    // [Build]
    let orientation = Orientation::North;
    let x = CENTER;
    let y = CENTER + 1;
    let role = Role::Lord;
    let spot = Spot::South;
    systems.daily.build(context.game_id, orientation, x, y, role, spot);

    // [Assert]
    let builder = store.builder(game, context.player_id);
    let expected: u32 = 2 * constants::CITY_BASE_POINTS + 1;
    assert(builder.score - expected <= expected, 'Build: game score');
}
