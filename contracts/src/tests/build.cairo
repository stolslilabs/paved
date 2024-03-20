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
use paved::types::mode::Mode;
use paved::types::order::Order;
use paved::types::orientation::Orientation;
use paved::types::direction::Direction;
use paved::types::plan::Plan;
use paved::types::role::Role;
use paved::types::spot::Spot;
use paved::systems::host::IHostDispatcherTrait;
use paved::systems::manage::IManageDispatcherTrait;
use paved::systems::play::IPlayDispatcherTrait;
use paved::tests::setup::{setup, setup::{Systems, PLAYER, ANYONE}};

// Constants

const BUILDER_NAME: felt252 = 'PLAYER';

#[test]
fn test_play_build_without_character() {
    // [Setup]
    let (world, systems, context) = setup::spawn_game(Mode::Multi);
    let store = StoreTrait::new(world);

    // [Start]
    systems.host.ready(world, context.game_id, true);
    systems.host.start(world, context.game_id);

    // [Draw]
    let game = store.game(context.game_id);
    set_transaction_hash(setup::compute_tx_hash(game, Plan::FFCFFFCFF));
    systems.play.draw(world, game.id); // FFCFFFCFF

    // [Build]
    let orientation = Orientation::North;
    let x = CENTER;
    let y = CENTER + 1;
    let role = Role::None;
    let spot = Spot::None;
    systems.play.build(world, context.game_id, orientation, x, y, role, spot);
}

#[test]
fn test_play_build_with_character() {
    // [Setup]
    let (world, systems, context) = setup::spawn_game(Mode::Multi);
    let store = StoreTrait::new(world);
    let game = store.game(context.game_id);

    // [Start]
    systems.host.ready(world, game.id, true);
    systems.host.start(world, game.id);

    // [Draw]
    set_transaction_hash(setup::compute_tx_hash(store.game(game.id), Plan::FFCFFFCFF));
    systems.play.draw(world, game.id); // FFCFFFCFF

    // [Build]
    let orientation = Orientation::North;
    let x = CENTER;
    let y = CENTER + 1;
    let role = Role::Lord;
    let spot = Spot::South;
    systems.play.build(world, context.game_id, orientation, x, y, role, spot);
}

#[test]
#[should_panic(expected: ('Game: structure not idle', 'ENTRYPOINT_FAILED',))]
fn test_play_build_with_character_revert_not_idle() {
    // [Setup]
    let (world, systems, context) = setup::spawn_game(Mode::Multi);
    let store = StoreTrait::new(world);
    let game = store.game(context.game_id);

    // [Start]
    systems.host.ready(world, game.id, true);
    systems.host.start(world, game.id);

    // [Draw & Build]
    set_transaction_hash(setup::compute_tx_hash(store.game(game.id), Plan::WFFFFFFFR));
    systems.play.draw(world, game.id); // WFFFFFFFR
    let orientation = Orientation::North;
    let x = CENTER;
    let y = CENTER - 1;
    let role = Role::Lord;
    let spot = Spot::West;
    systems.play.build(world, context.game_id, orientation, x, y, role, spot);

    // [Draw & Build]
    set_transaction_hash(setup::compute_tx_hash(store.game(game.id), Plan::SFRFRFFFR));
    systems.play.draw(world, game.id); // SFRFRFFFR
    let orientation = Orientation::North;
    let x = CENTER - 1;
    let y = CENTER - 1;
    let role = Role::Lady;
    let spot = Spot::East;
    systems.play.build(world, context.game_id, orientation, x, y, role, spot);
}

#[test]
fn test_play_build_complete_castle() {
    // [Setup]
    let (world, systems, context) = setup::spawn_game(Mode::Multi);
    let store = StoreTrait::new(world);
    let game = store.game(context.game_id);

    // [Start]
    systems.host.ready(world, game.id, true);
    systems.host.start(world, game.id);

    // [Draw]
    set_transaction_hash(setup::compute_tx_hash(store.game(game.id), Plan::FFCFFFCFF));
    systems.play.draw(world, game.id); // FFCFFFCFF

    // [Build]
    let orientation = Orientation::North;
    let x = CENTER;
    let y = CENTER + 1;
    let role = Role::Lord;
    let spot = Spot::South;
    systems.play.build(world, context.game_id, orientation, x, y, role, spot);

    // [Assert]
    let builder = store.builder(game, context.player_id);
    let expected: u32 = 2 * constants::CITY_BASE_POINTS;
    assert(builder.score - expected <= expected, 'Build: builder score');
}

#[test]
fn test_play_build_complete_forest_inside_roads() {
    // [Setup]
    let (world, systems, context) = setup::spawn_game(Mode::Multi);
    let store = StoreTrait::new(world);
    let game = store.game(context.game_id);
    let none = Role::None;
    let woodsman = Role::Woodsman;
    let nowhere = Spot::None;
    let northeast = Spot::NorthEast;

    // [Start]
    systems.host.ready(world, game.id, true);
    systems.host.start(world, game.id);

    // [Draw & Build]

    set_transaction_hash(setup::compute_tx_hash(store.game(game.id), Plan::WFFFFFFFR));
    systems.play.draw(world, game.id); // WFFFFFFFR
    let orientation = Orientation::North;
    let x = CENTER;
    let y = CENTER - 1;
    systems.play.build(world, context.game_id, orientation, x, y, none, nowhere);

    // [Draw & Build]

    set_transaction_hash(setup::compute_tx_hash(store.game(game.id), Plan::SFRFRFFFR));
    systems.play.draw(world, game.id); // SFRFRFFFR
    let orientation = Orientation::East;
    let x = CENTER - 1;
    let y = CENTER - 1;
    systems.play.build(world, context.game_id, orientation, x, y, none, nowhere);

    // [Draw & Build]

    set_transaction_hash(setup::compute_tx_hash(store.game(game.id), Plan::RFFFRFFFR));
    systems.play.draw(world, game.id); // RFFFRFFFR
    let orientation = Orientation::East;
    let x = CENTER + 1;
    let y = CENTER - 1;
    systems.play.build(world, context.game_id, orientation, x, y, none, nowhere);

    // [Draw & Build]

    set_transaction_hash(setup::compute_tx_hash(store.game(game.id), Plan::RFFFRFFFR));
    systems.play.draw(world, game.id); // RFFFRFFFR
    let orientation = Orientation::North;
    let x = CENTER;
    let y = CENTER - 2;
    systems.play.build(world, context.game_id, orientation, x, y, none, nowhere);

    // [Draw & Build]

    set_transaction_hash(setup::compute_tx_hash(store.game(game.id), Plan::RFRFFFFFR));
    systems.play.draw(world, game.id); // RFRFFFFFR
    let orientation = Orientation::North;
    let x = CENTER + 1;
    let y = CENTER - 2;
    systems.play.build(world, context.game_id, orientation, x, y, none, nowhere);

    // [Draw & Build]

    set_transaction_hash(setup::compute_tx_hash(store.game(game.id), Plan::RFRFFFFFR));
    systems.play.draw(world, game.id); // RFRFFFFFR
    let orientation = Orientation::East;
    let x = CENTER - 1;
    let y = CENTER - 2;
    systems.play.build(world, context.game_id, orientation, x, y, woodsman, northeast);

    // [Draw & Build]

    set_transaction_hash(setup::compute_tx_hash(store.game(game.id), Plan::RFRFFFFFR));
    systems.play.draw(world, game.id); // RFRFFFFFR
    let orientation = Orientation::South;
    let x = CENTER - 1;
    let y = CENTER;
    systems.play.build(world, context.game_id, orientation, x, y, none, nowhere);

    // [Draw & Build]

    set_transaction_hash(setup::compute_tx_hash(store.game(game.id), Plan::RFRFFFFFR));
    systems.play.draw(world, game.id); // RFRFFFFFR
    let orientation = Orientation::West;
    let x = CENTER + 1;
    let y = CENTER;
    systems.play.build(world, context.game_id, orientation, x, y, none, nowhere);

    // [Assert]
    let builder = store.builder(game, context.player_id);
    let expected: u32 = 2 * constants::FOREST_BASE_POINTS;
    assert(builder.score - expected <= expected, 'Build: builder score');
}

#[test]
fn test_play_build_complete_forest_inside_castles() {
    // [Setup]
    let (world, systems, context) = setup::spawn_game(Mode::Multi);
    let store = StoreTrait::new(world);
    let game = store.game(context.game_id);
    let none = Role::None;
    let woodsman = Role::Woodsman;
    let nowhere = Spot::None;
    let northeast = Spot::NorthEast;

    // [Start]
    systems.host.ready(world, game.id, true);
    systems.host.start(world, game.id);

    // [Draw & Build]

    set_transaction_hash(setup::compute_tx_hash(store.game(game.id), Plan::CCCCCFRFC));
    systems.play.draw(world, game.id); // CCCCCFRFC
    let orientation = Orientation::West;
    let x = CENTER - 1;
    let y = CENTER;
    systems.play.build(world, context.game_id, orientation, x, y, woodsman, northeast);

    // [Draw & Build]

    set_transaction_hash(setup::compute_tx_hash(store.game(game.id), Plan::CCCCCFFFC));
    systems.play.draw(world, game.id); // CCCCCFFFC
    let orientation = Orientation::South;
    let x = CENTER;
    let y = CENTER - 1;
    systems.play.build(world, context.game_id, orientation, x, y, none, nowhere);

    // [Draw & Build]

    set_transaction_hash(setup::compute_tx_hash(store.game(game.id), Plan::RFRFCCCFR));
    systems.play.draw(world, game.id); // RFRFCCCFR
    let orientation = Orientation::North;
    let x = CENTER + 1;
    let y = CENTER;
    systems.play.build(world, context.game_id, orientation, x, y, none, nowhere);

    // [Draw & Build]

    set_transaction_hash(setup::compute_tx_hash(store.game(game.id), Plan::WFFFFFFFR));
    systems.play.draw(world, game.id); // WFFFFFFFR
    let orientation = Orientation::West;
    let x = CENTER + 1;
    let y = CENTER + 1;
    systems.play.build(world, context.game_id, orientation, x, y, none, nowhere);

    // [Draw & Build]

    set_transaction_hash(setup::compute_tx_hash(store.game(game.id), Plan::CCCCCFFFC));
    systems.play.draw(world, game.id); // CCCCCFFFC
    let orientation = Orientation::West;
    let x = CENTER;
    let y = CENTER + 1;
    systems.play.build(world, context.game_id, orientation, x, y, none, nowhere);

    // [Draw & Build]

    set_transaction_hash(setup::compute_tx_hash(store.game(game.id), Plan::CCCCCFFFC));
    systems.play.draw(world, game.id); // CCCCCFFFC
    let orientation = Orientation::East;
    let x = CENTER + 2;
    let y = CENTER + 1;
    systems.play.build(world, context.game_id, orientation, x, y, none, nowhere);

    // [Draw & Build]

    set_transaction_hash(setup::compute_tx_hash(store.game(game.id), Plan::CFFFCFFFC));
    systems.play.draw(world, game.id); // CFFFCFFFC
    let orientation = Orientation::North;
    let x = CENTER + 1;
    let y = CENTER + 2;
    systems.play.build(world, context.game_id, orientation, x, y, none, nowhere);

    // [Assert]
    let builder = store.builder(game, context.player_id);
    let expected: u32 = 1 * constants::FOREST_BASE_POINTS;
    assert(builder.score - expected <= expected, 'Build: builder score');
}

#[test]
fn test_play_build_single_forest_inside_castles() {
    // [Setup]
    let (world, systems, context) = setup::spawn_game(Mode::Multi);
    let store = StoreTrait::new(world);
    let game = store.game(context.game_id);
    let herdsman = Role::Herdsman;
    let spot = Spot::Center;

    // [Start]
    systems.host.ready(world, game.id, true);
    systems.host.start(world, game.id);

    // [Draw & Build]

    set_transaction_hash(setup::compute_tx_hash(store.game(game.id), Plan::CCCCCCCCC));
    systems.play.draw(world, game.id); // CCCCCCCCC
    let orientation = Orientation::North;
    let x = CENTER;
    let y = CENTER + 1;
    systems.play.build(world, context.game_id, orientation, x, y, Role::None, Spot::None);

    // [Draw & Build]

    set_transaction_hash(setup::compute_tx_hash(store.game(game.id), Plan::FFCFCFCFC));
    systems.play.draw(world, game.id); // FFCFCFCFC
    let orientation = Orientation::North;
    let x = CENTER + 1;
    let y = CENTER + 1;
    systems.play.build(world, context.game_id, orientation, x, y, herdsman, spot);

    // [Assert]
    let builder = store.builder(game, context.player_id);
    assert(builder.score == 0, 'Build: builder score');
    assert(builder.characters == 0, 'Build: builder characters');
}
