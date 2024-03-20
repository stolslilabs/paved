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
use paved::systems::play::IPlayDispatcherTrait;
use paved::tests::setup::{setup, setup::{Systems, PLAYER, ANYONE}};

#[test]
fn test_case_012() {
    // [Setup]
    let (world, systems, context) = setup::spawn_game(Mode::Multi);
    let store = StoreTrait::new(world);
    let game = store.game(context.game_id);

    // [Start]
    systems.host.ready(world, game.id, true);
    systems.host.start(world, game.id);

    // [Draw & Build]
    set_transaction_hash(setup::compute_tx_hash(store.game(game.id), Plan::RFRFFFFFR));
    systems.play.draw(world, game.id);

    let orientation = Orientation::South;
    let x = CENTER;
    let y = CENTER - 1;
    systems.play.build(world, context.game_id, orientation, x, y, Role::None, Spot::None);

    // [Draw & Build]
    set_transaction_hash(setup::compute_tx_hash(store.game(game.id), Plan::RFRFFFFFR));
    systems.play.draw(world, game.id);

    let orientation = Orientation::East;
    let x = CENTER;
    let y = CENTER - 2;
    systems.play.build(world, context.game_id, orientation, x, y, Role::None, Spot::None);

    // [Draw & Build]
    set_transaction_hash(setup::compute_tx_hash(store.game(game.id), Plan::RFRFFFFFR));
    systems.play.draw(world, game.id);

    let orientation = Orientation::West;
    let x = CENTER + 1;
    let y = CENTER - 1;
    systems.play.build(world, context.game_id, orientation, x, y, Role::None, Spot::None);

    // [Draw & Build]
    set_transaction_hash(setup::compute_tx_hash(store.game(game.id), Plan::SFRFRFFFR));
    systems.play.draw(world, game.id);

    let orientation = Orientation::West;
    let x = CENTER + 1;
    let y = CENTER - 2;
    systems.play.build(world, context.game_id, orientation, x, y, Role::Lord, Spot::North);
}
