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
use stolsli::types::mode::Mode;
use stolsli::types::order::Order;
use stolsli::systems::host::IHostDispatcherTrait;
use stolsli::systems::manage::IManageDispatcherTrait;
use stolsli::systems::play::IPlayDispatcherTrait;
use stolsli::tests::setup::{setup, setup::{Systems, PLAYER, ANYONE}};

// Constants

const AMOUNT_ONE: u8 = 1;

#[test]
fn test_play_buy() {
    // [Setup]
    let (world, systems, context) = setup::spawn_game(Mode::Multi);
    let store = StoreTrait::new(world);

    // [Start]
    systems.host.start(world, context.game_id);
    let player = store.player(context.player_id);
    let bank = player.bank;

    // [Buy]
    systems.manage.buy(world, AMOUNT_ONE);

    // [Assert]
    let player = store.player(context.player_id);
    assert(player.bank == bank + AMOUNT_ONE, 'Buy: bank');
}
