// Core imports

use core::debug::PrintTrait;

// Starknet imports

use starknet::testing::set_contract_address;

// Dojo imports

use dojo::world::{IWorldDispatcher, IWorldDispatcherTrait};

// Internal imports

use paved::store::{Store, StoreTrait};
use paved::models::game::{Game, GameTrait};
use paved::models::builder::{Builder, BuilderTrait};
use paved::types::mode::Mode;
use paved::types::order::Order;
use paved::systems::host::IHostDispatcherTrait;
use paved::systems::manage::IManageDispatcherTrait;
use paved::systems::play::IPlayDispatcherTrait;
use paved::tests::setup::{setup, setup::{Systems, PLAYER, ANYONE}};

// Constants

const AMOUNT_ONE: u8 = 1;

#[test]
fn test_play_buy() {
    // [Setup]
    let (world, systems, context) = setup::spawn_game(Mode::Multi);
    let store = StoreTrait::new(world);

    // [Start]
    systems.host.ready(world, context.game_id, true);
    systems.host.start(world, context.game_id);
    let player = store.player(context.player_id);
    let bank = player.bank;

    // [Buy]
    systems.manage.buy(world, AMOUNT_ONE);

    // [Assert]
    let player = store.player(context.player_id);
    assert(player.bank == bank + AMOUNT_ONE, 'Buy: bank');
}
