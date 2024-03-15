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

#[test]
fn test_play_draw() {
    // [Setup]
    let (world, systems, context) = setup::spawn_game(Mode::Multi);
    let store = StoreTrait::new(world);

    // [Start]
    systems.host.start(world, context.game_id);

    // [Draw]
    systems.play.draw(world, context.game_id);

    // [Assert]
    let player = store.player(context.player_id);
    // TODO: Enable for the release
    // assert(player.bank + 1 == bank, 'Draw: bank');
    let game = store.game(context.game_id);
    let builder = store.builder(game, player.id);
    assert(builder.tile_id != 0, 'Draw: tile_id');
}

#[test]
#[should_panic(expected: ('Builder: Already has a tile', 'ENTRYPOINT_FAILED',))]
fn test_play_draw_twice_revert_cannot_draw() {
    // [Setup]
    let (world, systems, context) = setup::spawn_game(Mode::Multi);

    // [Start]
    systems.host.start(world, context.game_id);

    // [Draw]
    systems.play.draw(world, context.game_id);
    systems.play.draw(world, context.game_id);
}
