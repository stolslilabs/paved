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
use paved::systems::duel::IDuelDispatcherTrait;

use paved::tests::setup::{setup, setup::{Mode, Systems, PLAYER, ANYONE}};

#[test]
fn test_play_discard() {
    let (world, systems, context) = setup::spawn_game(Mode::Duel);
    let store = StoreTrait::new(world);

    // [Join]
    set_contract_address(ANYONE());
    systems.duel.join(context.game_id);

    // [Ready]
    systems.duel.ready(context.game_id, true);
    set_contract_address(PLAYER());
    systems.duel.ready(context.game_id, true);

    // [Start]
    systems.duel.start(context.game_id);

    // [Discard]
    systems.duel.discard(context.game_id);

    // [Assert]
    let mut game = store.game(context.game_id);
    let player = store.player(context.player_id);
    let builder = store.builder(game, player.id);
    assert(builder.tile_id != 0, 'Discard: tile_id');
}
