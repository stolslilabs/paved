// Core imports

use core::debug::PrintTrait;

// Starknet imports

use starknet::testing::{set_contract_address, set_transaction_hash};

// Dojo imports

use dojo::world::{IWorldDispatcher, IWorldDispatcherTrait};

// Internal imports

use paved::constants;
use paved::store::{Store, StoreTrait};
use paved::models::game::{Game, GameTrait};
use paved::models::builder::{Builder, BuilderTrait};
use paved::models::tile::{Tile, TileTrait, CENTER};
use paved::types::mode::Mode;
use paved::types::order::Order;
use paved::types::orientation::Orientation;
use paved::types::direction::Direction;
use paved::types::plan::Plan;
use paved::types::role::Role;
use paved::types::spot::Spot;
use paved::systems::daily::IDailyDispatcherTrait;

use paved::tests::setup::{setup, setup::{Mode, Systems, PLAYER, ANYONE}};

#[test]
fn test_case_013() {
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

    let orientation = Orientation::West;
    let x = CENTER + 1;
    let y = CENTER;
    systems
        .weekly
        .build(world, context.game_id, orientation, x, y, Role::Woodsman, Spot::SouthWest);

    // [Draw & Build]
    let mut game = store.game(context.game_id);
    game.seed = setup::compute_seed(store.game(game.id), Plan::RFRFFFFFR);
    store.set_game(game);
    systems.daily.draw(world, game.id);

    let orientation = Orientation::South;
    let x = CENTER - 1;
    let y = CENTER;
    systems.daily.build(world, context.game_id, orientation, x, y, Role::None, Spot::None);

    // [Draw & Build]
    let mut game = store.game(context.game_id);
    game.seed = setup::compute_seed(store.game(game.id), Plan::RFRFFFFFR);
    store.set_game(game);
    systems.daily.draw(world, game.id);

    let orientation = Orientation::East;
    let x = CENTER - 1;
    let y = CENTER - 1;
    systems.daily.build(world, context.game_id, orientation, x, y, Role::None, Spot::None);

    // [Draw & Build]
    let mut game = store.game(context.game_id);
    game.seed = setup::compute_seed(store.game(game.id), Plan::SFRFRFFFR);
    store.set_game(game);
    systems.daily.draw(world, game.id);

    let orientation = Orientation::North;
    let x = CENTER + 1;
    let y = CENTER - 1;
    systems.daily.build(world, context.game_id, orientation, x, y, Role::None, Spot::None);

    // [Draw & Build]
    let mut game = store.game(context.game_id);
    game.seed = setup::compute_seed(store.game(game.id), Plan::SFRFRFFFR);
    store.set_game(game);
    systems.daily.draw(world, game.id);

    let orientation = Orientation::South;
    let x = CENTER;
    let y = CENTER - 1;
    systems.daily.build(world, context.game_id, orientation, x, y, Role::None, Spot::None);

    // [Assert]
    let builder = store.builder(game, context.player_id);
    let expected: u32 = 2 * constants::FOREST_BASE_POINTS + 1;
    assert(builder.score - expected <= expected, 'Build: builder score');
}
