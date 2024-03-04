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
use stolsli::types::order::Order;
use stolsli::systems::host::IHostDispatcherTrait;
use stolsli::systems::manage::IManageDispatcherTrait;
use stolsli::systems::play::IPlayDispatcherTrait;
use stolsli::tests::setup::{setup, setup::{Systems, PLAYER, ANYONE}};

#[test]
fn test_host_join() {
    // [Setup]
    let (world, systems, context) = setup::spawn_game();
    let store = StoreTrait::new(world);

    // [Assert] Game
    let game = store.game(context.game_id);
    game.assert_exists();

    // [Assert] Player
    let player = store.player(context.player_id);
    player.assert_exists();

    // [Join]
    systems.host.join(world, context.game_id, player.order);

    // [Assert] Builder
    let builder = store.builder(game, player.id);
    builder.assert_exists();

    // [Start]
    systems.host.start(world, context.game_id);

    // [Assert] Game
    let game = store.game(context.game_id);
    game.assert_started();
}

#[test]
#[should_panic(expected: ('Game: already started', 'ENTRYPOINT_FAILED',))]
fn test_host_join_revert_started() {
    // [Setup]
    let (world, systems, context) = setup::spawn_game();
    let store = StoreTrait::new(world);

    // [Assert] Game
    let game = store.game(context.game_id);
    game.assert_exists();

    // [Assert] Player
    let player = store.player(context.player_id);
    player.assert_exists();

    // [Join]
    let player = store.player(context.player_id);
    systems.host.join(world, context.game_id, player.order);

    // [Start]
    systems.host.start(world, context.game_id);

    // [Join]
    set_contract_address(ANYONE());
    let anyone = store.player(context.player_id);
    systems.host.join(world, context.game_id, anyone.order);

    // [Assert] Game
    let game = store.game(context.game_id);
    game.assert_started();
}
