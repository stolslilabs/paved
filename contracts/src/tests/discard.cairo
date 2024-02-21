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
use stolsli::types::order::Order;
use stolsli::systems::host::IHostDispatcherTrait;
use stolsli::systems::manage::IManageDispatcherTrait;
use stolsli::systems::play::IPlayDispatcherTrait;
use stolsli::tests::setup::{setup, setup::{Systems, PLAYER, ANYONE}};

// Constants

const BUILDER_NAME: felt252 = 'BUILDER';

#[test]
fn test_play_discard() {
    // [Setup]
    let (world, systems, context) = setup::spawn_game();
    let store = StoreTrait::new(world);

    // [Spawn]
    let player = store.player(context.player_id);
    systems.host.join(world, context.game_id, player.order);
    systems.host.start(world, context.game_id);

    // [Draw]
    systems.play.draw(world, context.game_id);

    // [Discard]
    systems.play.discard(world, context.game_id);

    // [Assert]
    let game = store.game(context.game_id);
    let builder = store.builder(game, player.id);
    assert(builder.tile_id == 0, 'Discard: tile_id');
}
