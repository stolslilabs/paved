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
use paved::systems::weekly::IWeeklyDispatcherTrait;

use paved::tests::setup::{setup, setup::{Mode, Systems, PLAYER, ANYONE}};

#[test]
fn test_play_discard() {
    // [Setup]
    let (world, systems, context) = setup::spawn_game(Mode::Weekly);
    let store = StoreTrait::new(world);

    // [Discard]
    systems.weekly.discard(context.game_id);

    // [Assert]
    let mut game = store.game(context.game_id);
    let player = store.player(context.player_id);
    let builder = store.builder(game, player.id);
    assert(builder.tile_id != 0, 'Discard: tile_id');
}
