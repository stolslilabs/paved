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

#[test]
fn test_play_draw() {
    // [Setup]
    let (world, systems, context) = setup::spawn_game(Mode::Multi);
    let store = StoreTrait::new(world);

    // [Start]
    systems.host.ready(world, context.game_id, true);
    systems.host.start(world, context.game_id);

    // [Draw]
    systems.play.draw(world, context.game_id);

    // [Assert]
    let player = store.player(context.player_id);
    // TODO: Enable for the release
    // assert(player.bank + 1 == bank, 'Draw: bank');
    let mut game = store.game(context.game_id);
    let builder = store.builder(game, player.id);
    assert(builder.tile_id != 0, 'Draw: tile_id');
}

#[test]
#[should_panic(expected: ('Builder: already has a tile', 'ENTRYPOINT_FAILED',))]
fn test_play_draw_twice_revert_cannot_draw() {
    // [Setup]
    let (world, systems, context) = setup::spawn_game(Mode::Multi);

    // [Start]
    systems.host.ready(world, context.game_id, true);
    systems.host.start(world, context.game_id);

    // [Draw]
    systems.play.draw(world, context.game_id);
    systems.play.draw(world, context.game_id);
}
