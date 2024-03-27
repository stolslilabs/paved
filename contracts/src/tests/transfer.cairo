use paved::models::player::AssertTrait;
// Core imports

use core::debug::PrintTrait;

// Starknet imports

use starknet::testing::set_contract_address;

// Dojo imports

use dojo::world::{IWorldDispatcher, IWorldDispatcherTrait};

// Internal imports

use paved::store::{Store, StoreTrait};
use paved::models::game::{Game, GameTrait, GameAssert};
use paved::models::player::{Player, PlayerTrait, PlayerAssert};
use paved::models::builder::{Builder, BuilderTrait, BuilderAssert};
use paved::types::mode::Mode;
use paved::types::order::Order;
use paved::systems::host::IHostDispatcherTrait;
use paved::systems::manage::IManageDispatcherTrait;
use paved::systems::play::IPlayDispatcherTrait;
use paved::tests::setup::{setup, setup::{Systems, PLAYER, ANYONE}};

#[test]
fn test_host_transfer() {
    // [Setup]
    let (world, systems, context) = setup::spawn_game(Mode::Multi);
    let store = StoreTrait::new(world);

    // [Join]
    set_contract_address(ANYONE());
    let anyone = store.player(context.anyone_id);
    systems.host.join(world, context.game_id);

    // [Transfer]
    set_contract_address(PLAYER());
    systems.host.transfer(world, context.game_id, anyone.id);

    // [Assert] Anyone
    let mut game = store.game(context.game_id);
    let anyone = store.builder(game, context.anyone_id);
    anyone.assert_host();
}

#[test]
#[should_panic(expected: ('Builder: is not host', 'ENTRYPOINT_FAILED',))]
fn test_host_transfer_revert_not_host() {
    // [Setup]
    let (world, systems, context) = setup::spawn_game(Mode::Multi);
    let store = StoreTrait::new(world);

    // [Join]
    set_contract_address(ANYONE());
    let anyone = store.player(context.anyone_id);
    systems.host.join(world, context.game_id);

    // [Transfer]
    systems.host.transfer(world, context.game_id, anyone.id);
}
