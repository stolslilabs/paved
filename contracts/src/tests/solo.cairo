// Core imports

use core::debug::PrintTrait;

// Starknet imports

use starknet::testing::{set_contract_address, set_transaction_hash};

// Dojo imports

use dojo::world::{IWorldDispatcher, IWorldDispatcherTrait};

// Internal imports

use paved::constants;
use paved::store::{Store, StoreTrait};
use paved::models::game::{Game, GameTrait, GameAssert};
use paved::models::builder::{Builder, BuilderTrait};
use paved::models::tile::{Tile, TileTrait, CENTER};
use paved::types::mode::Mode;
use paved::systems::host::IHostDispatcherTrait;
use paved::systems::manage::IManageDispatcherTrait;
use paved::systems::play::IPlayDispatcherTrait;
use paved::tests::setup::{setup, setup::{Systems, PLAYER, ANYONE}};

// Constants

const BUILDER_NAME: felt252 = 'PLAYER';

#[test]
fn test_play_solo_game_started() {
    // [Setup]
    let (world, _, context) = setup::spawn_game(Mode::Solo);
    let store = StoreTrait::new(world);

    // [Assert] Game
    let mut game = store.game(context.game_id);
    game.assert_started();
}
