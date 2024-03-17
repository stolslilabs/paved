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
use stolsli::types::mode::Mode;
use stolsli::types::order::Order;
use stolsli::types::orientation::Orientation;
use stolsli::types::direction::Direction;
use stolsli::types::plan::Plan;
use stolsli::types::role::Role;
use stolsli::types::spot::Spot;
use stolsli::systems::host::IHostDispatcherTrait;
use stolsli::systems::play::IPlayDispatcherTrait;
use stolsli::tests::setup::{setup, setup::{Systems, PLAYER, ANYONE}};

#[test]
fn test_case_011() {
    // [Setup]
    let (world, systems, context) = setup::spawn_game(Mode::Multi);
    let store = StoreTrait::new(world);
    let game = store.game(context.game_id);

    // [Start]
    systems.host.ready(world, game.id, true);
    systems.host.start(world, game.id);

    // [Draw & Build]
    set_transaction_hash(setup::compute_tx_hash(store.game(game.id), Plan::CCCCCFFFC));
    systems.play.draw(world, game.id);

    let orientation = Orientation::East;
    let x = CENTER;
    let y = CENTER + 1;
    systems.play.build(world, context.game_id, orientation, x, y, Role::Paladin, Spot::Center);

    // [Draw & Build]
    set_transaction_hash(setup::compute_tx_hash(store.game(game.id), Plan::FFFFFFCFF));
    systems.play.draw(world, game.id);

    let orientation = Orientation::East;
    let x = CENTER + 1;
    let y = CENTER + 1;
    systems.play.build(world, context.game_id, orientation, x, y, Role::None, Spot::None);

    // [Draw & Build]
    set_transaction_hash(setup::compute_tx_hash(store.game(game.id), Plan::FFFFFFCFF));
    systems.play.draw(world, game.id);

    let orientation = Orientation::East;
    let x = CENTER + 1;
    let y = CENTER + 2;
    systems.play.build(world, context.game_id, orientation, x, y, Role::Herdsman, Spot::Center);
}