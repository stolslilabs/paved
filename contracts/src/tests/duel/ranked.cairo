// Core imports

use core::debug::PrintTrait;

// Starknet imports

use starknet::testing::{set_contract_address, set_caller_address, set_block_timestamp};

// Dojo imports

use dojo::world::{IWorldDispatcher, IWorldDispatcherTrait};

// Internal imports

use paved::constants;
use paved::store::{Store, StoreTrait};
use paved::models::game::{Game, GameTrait, GameAssert};
use paved::models::builder::{Builder, BuilderTrait};
use paved::models::tile::{Tile, TileTrait, CENTER};
use paved::models::tournament::{TournamentImpl};
use paved::types::role::Role;
use paved::types::spot::Spot;
use paved::types::plan::Plan;
use paved::types::orientation::Orientation;

use paved::tests::setup::{
    setup,
    setup::{
        Mode, Systems, PLAYER, ANYONE, SOMEONE, NOONE, IERC20DispatcherTrait, IDuelDispatcherTrait
    }
};

#[test]
fn test_play_duel_join() {
    // [Setup]
    let (_world, systems, context) = setup::spawn_game(Mode::Duel);

    // [Join]
    set_contract_address(ANYONE());
    let anyone_balance = context.token.balance_of(ANYONE());
    systems.duel.join(context.game_id);

    // [Assert] Anyone balance
    let final_anyone = context.token.balance_of(ANYONE());
    assert(final_anyone + context.game_price.into() == anyone_balance, 'Anyone balance post join');
}

#[test]
fn test_play_duel_ready() {
    // [Setup]
    let (world, systems, context) = setup::spawn_game(Mode::Duel);
    let store = StoreTrait::new(world);

    // [Join]
    set_contract_address(ANYONE());
    systems.duel.join(context.game_id);

    // [Ready]
    systems.duel.ready(context.game_id, true);
    set_contract_address(PLAYER());
    systems.duel.ready(context.game_id, true);

    // [Assert]
    let game = store.game(context.game_id);
    assert(game.players == 0b11, 'Game player readiness');
}

#[test]
fn test_play_duel_start() {
    // [Setup]
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

    // [Assert]
    let game = store.game(context.game_id);
    let player = store.builder(game, context.player_id);
    assert(player.tile_id != 0, 'Player tile');
    let anyone = store.builder(game, context.anyone_id);
    assert(anyone.tile_id != 0, 'Anyone tile');
}
