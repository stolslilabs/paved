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
use paved::systems::host::IHostDispatcherTrait;
use paved::systems::manage::IManageDispatcherTrait;
use paved::systems::play::IPlayDispatcherTrait;
use paved::tests::setup::{setup, setup::{Systems, PLAYER, ANYONE}};

#[test]
fn test_play_discard() {
    // [Setup]
    let (world, systems, context) = setup::spawn_game();
    let store = StoreTrait::new(world);

    // [Draw]
    systems.play.draw(world, context.game_id);

    // [Discard]
    systems.play.discard(world, context.game_id);

    // [Assert]
    let mut game = store.game(context.game_id);
    let player = store.player(context.player_id);
    let builder = store.builder(game, player.id);
    assert(builder.tile_id == 0, 'Discard: tile_id');
}
