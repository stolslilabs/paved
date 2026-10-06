// Core imports

// Starknet imports

// Dojo imports

use dojo::world::{IWorldDispatcher, IWorldDispatcherTrait};

// Internal imports

use paved::constants;
use paved::models::builder::{Builder, BuilderTrait};
use paved::models::game::{Game, GameTrait};
use paved::models::tile::{CENTER, Tile, TileTrait};
use paved::store::{Store, StoreTrait};
use paved::systems::daily::IDailyDispatcherTrait;
use paved::tests::setup::setup;
use paved::tests::setup::setup::{ANYONE, Mode, PLAYER, Systems};
use paved::types::direction::Direction;
use paved::types::mode::Mode;
use paved::types::order::Order;
use paved::types::orientation::Orientation;
use paved::types::plan::Plan;
use paved::types::role::Role;
use paved::types::spot::Spot;
use starknet::testing::{set_contract_address, set_transaction_hash};

#[test]
fn test_case_012() {
    // [Setup]
    let (world, systems, context) = setup::spawn_game(Mode::Multi);
    let store = StoreTrait::new(world);

    // [Start]
    systems.daily.ready(world, context.game_id, true);
    systems.daily.start(world, context.game_id);

    // [Draw & Build]
    let mut game = store.game(context.game_id);
    game.seed = setup::compute_seed(store.game(game.id), Plan::RFRFFFFFR);
    store.set_game(game);
    systems.daily.draw(world, game.id);

    let orientation = Orientation::South;
    let x = CENTER;
    let y = CENTER - 1;
    systems.daily.build(world, context.game_id, orientation, x, y, Role::None, Spot::None);

    // [Draw & Build]
    let mut game = store.game(context.game_id);
    game.seed = setup::compute_seed(store.game(game.id), Plan::RFRFFFFFR);
    store.set_game(game);
    systems.daily.draw(world, game.id);

    let orientation = Orientation::East;
    let x = CENTER;
    let y = CENTER - 2;
    systems.daily.build(world, context.game_id, orientation, x, y, Role::None, Spot::None);

    // [Draw & Build]
    let mut game = store.game(context.game_id);
    game.seed = setup::compute_seed(store.game(game.id), Plan::RFRFFFFFR);
    store.set_game(game);
    systems.daily.draw(world, game.id);

    let orientation = Orientation::West;
    let x = CENTER + 1;
    let y = CENTER - 1;
    systems.daily.build(world, context.game_id, orientation, x, y, Role::None, Spot::None);

    // [Draw & Build]
    let mut game = store.game(context.game_id);
    game.seed = setup::compute_seed(store.game(game.id), Plan::SFRFRFFFR);
    store.set_game(game);
    systems.daily.draw(world, game.id);

    let orientation = Orientation::West;
    let x = CENTER + 1;
    let y = CENTER - 2;
    systems.daily.build(world, context.game_id, orientation, x, y, Role::Lord, Spot::North);
}
