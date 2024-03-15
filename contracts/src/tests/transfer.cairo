use stolsli::models::player::AssertTrait;
// Core imports

use debug::PrintTrait;

// Starknet imports

use starknet::testing::set_contract_address;

// Dojo imports

use dojo::world::{IWorldDispatcher, IWorldDispatcherTrait};

// Internal imports

use stolsli::store::{Store, StoreTrait};
use stolsli::models::game::{Game, GameTrait, GameAssert};
use stolsli::models::player::{Player, PlayerTrait, PlayerAssert};
use stolsli::models::builder::{Builder, BuilderTrait, BuilderAssert};
use stolsli::types::mode::Mode;
use stolsli::types::order::Order;
use stolsli::systems::host::IHostDispatcherTrait;
use stolsli::systems::manage::IManageDispatcherTrait;
use stolsli::systems::play::IPlayDispatcherTrait;
use stolsli::tests::setup::{setup, setup::{Systems, PLAYER, ANYONE}};

#[test]
fn test_host_transfer() {
    // [Setup]
    let (world, systems, context) = setup::spawn_game(Mode::Multi);
    let store = StoreTrait::new(world);

    // [Join]
    set_contract_address(ANYONE());
    let anyone = store.player(context.anyone_id);
    systems.host.join(world, context.game_id, anyone.order);

    // [Transfer]
    set_contract_address(PLAYER());
    systems.host.transfer(world, context.game_id, anyone.id);

    // [Assert] Anyone
    let anyone = store.player(context.anyone_id);
    let game = store.game(context.game_id);
    assert(game.host == anyone.id, 'Transfer: host');
}

#[test]
#[should_panic(expected: ('Game: player is not host', 'ENTRYPOINT_FAILED',))]
fn test_host_transfer_revert_not_host() {
    // [Setup]
    let (world, systems, context) = setup::spawn_game(Mode::Multi);
    let store = StoreTrait::new(world);

    // [Join]
    set_contract_address(ANYONE());
    let anyone = store.player(context.anyone_id);
    systems.host.join(world, context.game_id, anyone.order);

    // [Transfer]
    systems.host.transfer(world, context.game_id, anyone.id);
}
