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
fn test_host_join() {
    // [Setup]
    let (world, systems, context) = setup::spawn_game(Mode::Multi);
    let store = StoreTrait::new(world);

    // [Assert] Game
    let game = store.game(context.game_id);
    game.assert_exists();

    // [Assert] Player
    let player = store.player(context.player_id);
    player.assert_exists();

    // [Assert] Builder
    let builder = store.builder(game, player.id);
    builder.assert_exists();

    // [Start]
    systems.host.ready(world, context.game_id, true);
    systems.host.start(world, context.game_id);

    // [Assert] Game
    let game = store.game(context.game_id);
    game.assert_started();
}

#[test]
#[should_panic(expected: ('Game: already started', 'ENTRYPOINT_FAILED',))]
fn test_host_join_revert_started() {
    // [Setup]
    let (world, systems, context) = setup::spawn_game(Mode::Multi);
    let store = StoreTrait::new(world);

    // [Assert] Game
    let game = store.game(context.game_id);
    game.assert_exists();

    // [Assert] Player
    let player = store.player(context.player_id);
    player.assert_exists();

    // [Start]
    systems.host.ready(world, context.game_id, true);
    systems.host.start(world, context.game_id);

    // [Join]
    set_contract_address(ANYONE());
    systems.host.join(world, context.game_id);

    // [Assert] Game
    let game = store.game(context.game_id);
    game.assert_started();
}
