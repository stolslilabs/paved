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
fn test_case_003() {
    // [Setup]
    let (world, systems, context) = setup::spawn_game(Mode::Multi);
    let store = StoreTrait::new(world);

    // [Start]
    set_contract_address(ANYONE());
    systems.daily.join(world, context.game_id);
    systems.daily.ready(world, context.game_id, true);
    set_contract_address(PLAYER());
    systems.daily.ready(world, context.game_id, true);
    systems.daily.start(world, context.game_id);

    // [Draw & Build]
    set_contract_address(ANYONE());
    let mut game = store.game(context.game_id);
    game.seed = setup::compute_seed(store.game(game.id), Plan::RFRFFFFFR);
    store.set_game(game);
    systems.daily.draw(world, game.id); // RFRFFFFFR

    let orientation = Orientation::South;
    let x = CENTER - 1;
    let y = CENTER;
    systems
        .weekly
        .build(world, context.game_id, orientation, x, y, Role::Woodsman, Spot::SouthEast);

    // [Draw & Build]
    set_contract_address(ANYONE());
    let mut game = store.game(context.game_id);
    game.seed = setup::compute_seed(store.game(game.id), Plan::SFRFRFFFR);
    store.set_game(game);
    systems.daily.draw(world, game.id); // SFRFRFFFR

    let orientation = Orientation::East;
    let x = CENTER - 1;
    let y = CENTER - 1;
    systems.daily.build(world, context.game_id, orientation, x, y, Role::None, Spot::None);

    // [Draw & Build]
    set_contract_address(PLAYER());
    let mut game = store.game(context.game_id);
    game.seed = setup::compute_seed(store.game(game.id), Plan::RFRFFFFFR);
    store.set_game(game);
    systems.daily.draw(world, game.id); // RFRFFFFFR

    let orientation = Orientation::East;
    let x = CENTER - 1;
    let y = CENTER - 2;
    systems
        .weekly
        .build(world, context.game_id, orientation, x, y, Role::Woodsman, Spot::NorthEast);

    // [Draw & Build]
    set_contract_address(PLAYER());
    let mut game = store.game(context.game_id);
    game.seed = setup::compute_seed(store.game(game.id), Plan::WFFFFFFFR);
    store.set_game(game);
    systems.daily.draw(world, game.id); // WFFFFFFFR

    let orientation = Orientation::North;
    let x = CENTER;
    let y = CENTER - 1;
    systems.daily.build(world, context.game_id, orientation, x, y, Role::Pilgrim, Spot::Center);

    // [Draw & Build]
    set_contract_address(PLAYER());
    let mut game = store.game(context.game_id);
    game.seed = setup::compute_seed(store.game(game.id), Plan::RFFFRFFFR);
    store.set_game(game);
    systems.daily.draw(world, game.id); // RFFFRFFFR

    let orientation = Orientation::East;
    let x = CENTER + 1;
    let y = CENTER - 1;
    systems.daily.build(world, context.game_id, orientation, x, y, Role::None, Spot::None);

    // [Draw & Build]
    set_contract_address(PLAYER());
    let mut game = store.game(context.game_id);
    game.seed = setup::compute_seed(store.game(game.id), Plan::RFFFRFFFR);
    store.set_game(game);
    systems.daily.draw(world, game.id); // RFFFRFFFR

    let orientation = Orientation::North;
    let x = CENTER;
    let y = CENTER - 2;
    systems.daily.build(world, context.game_id, orientation, x, y, Role::None, Spot::None);

    // [Draw & Build]
    set_contract_address(PLAYER());
    let mut game = store.game(context.game_id);
    game.seed = setup::compute_seed(store.game(game.id), Plan::RFRFFFFFR);
    store.set_game(game);
    systems.daily.draw(world, game.id); // RFRFFFFFR

    let orientation = Orientation::West;
    let x = CENTER + 1;
    let y = CENTER;
    systems.daily.build(world, context.game_id, orientation, x, y, Role::None, Spot::None);

    // [Draw & Build]
    set_contract_address(PLAYER());
    let mut game = store.game(context.game_id);
    game.seed = setup::compute_seed(store.game(game.id), Plan::RFRFFFFFR);
    store.set_game(game);
    systems.daily.draw(world, game.id); // RFRFFFFFR

    let orientation = Orientation::North;
    let x = CENTER + 1;
    let y = CENTER - 2;
    systems.daily.build(world, context.game_id, orientation, x, y, Role::None, Spot::None);

    // [Assert]
    let builder = store.builder(game, PLAYER().into());
    let expected: u32 = 2 * constants::WONDER_BASE_POINTS + 2 * constants::FOREST_BASE_POINTS / 2;
    assert(builder.score - expected <= expected, 'Build: builder score');
    let anyone = store.builder(game, ANYONE().into());
    let expected: u32 = 2 * constants::FOREST_BASE_POINTS / 2;
    assert(anyone.score - expected <= expected, 'Build: anyone score');
}
