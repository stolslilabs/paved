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
use paved::systems::host::IHostDispatcherTrait;
use paved::systems::play::IPlayDispatcherTrait;
use paved::tests::setup::{setup, setup::{Systems, PLAYER, ANYONE}};

#[test]
fn test_case_008() {
    // [Setup]
    let (world, systems, context) = setup::spawn_game(Mode::Multi);
    let store = StoreTrait::new(world);

    // [Start]
    set_contract_address(ANYONE());
    systems.host.join(world, context.game_id);
    systems.host.ready(world, context.game_id, true);
    set_contract_address(PLAYER());
    systems.host.ready(world, context.game_id, true);
    systems.host.start(world, context.game_id);

    // [Draw & Build]
    set_contract_address(PLAYER());
    let mut game = store.game(context.game_id);
    game.seed = setup::compute_seed(store.game(game.id), Plan::RFRFFFCFR);
    store.set_game(game);
    systems.play.draw(world, game.id); // RFRFFFCFR

    let orientation = Orientation::South;
    let x = CENTER - 1;
    let y = CENTER;
    systems.play.build(world, context.game_id, orientation, x, y, Role::None, Spot::None);

    // [Draw & Build]
    set_contract_address(ANYONE());
    let mut game = store.game(context.game_id);
    game.seed = setup::compute_seed(store.game(game.id), Plan::CCCCCFRFC);
    store.set_game(game);
    systems.play.draw(world, game.id); // CCCCCFRFC

    let orientation = Orientation::West;
    let x = CENTER - 1;
    let y = CENTER + 1;
    systems.play.build(world, context.game_id, orientation, x, y, Role::Woodsman, Spot::SouthEast);

    // [Draw & Build]
    set_contract_address(ANYONE());
    let mut game = store.game(context.game_id);
    game.seed = setup::compute_seed(store.game(game.id), Plan::FFCFFFFFC);
    store.set_game(game);
    systems.play.draw(world, game.id); // FFCFFFFFC

    let orientation = Orientation::South;
    let x = CENTER - 1;
    let y = CENTER + 2;
    systems.play.build(world, context.game_id, orientation, x, y, Role::None, Spot::None);

    // [Draw & Build]
    set_contract_address(PLAYER());
    let mut game = store.game(context.game_id);
    game.seed = setup::compute_seed(store.game(game.id), Plan::RFRFRFCFF);
    store.set_game(game);
    systems.play.draw(world, game.id); // RFRFRFCFF

    let orientation = Orientation::South;
    let x = CENTER + 1;
    let y = CENTER;
    systems.play.build(world, context.game_id, orientation, x, y, Role::None, Spot::None);

    // [Draw & Build]
    set_contract_address(PLAYER());
    let mut game = store.game(context.game_id);
    game.seed = setup::compute_seed(store.game(game.id), Plan::CCCCCFRFC);
    store.set_game(game);
    systems.play.draw(world, game.id); // CCCCCFRFC

    let orientation = Orientation::East;
    let x = CENTER + 1;
    let y = CENTER + 1;
    systems.play.build(world, context.game_id, orientation, x, y, Role::Herdsman, Spot::SouthWest);

    // [Draw & Build]
    set_contract_address(PLAYER());
    let mut game = store.game(context.game_id);
    game.seed = setup::compute_seed(store.game(game.id), Plan::FFCFFFFFC);
    store.set_game(game);
    systems.play.draw(world, game.id); // FFCFFFFFC

    let orientation = Orientation::West;
    let x = CENTER + 1;
    let y = CENTER + 2;
    systems.play.build(world, context.game_id, orientation, x, y, Role::Lord, Spot::West);

    // [Draw & Build]
    set_contract_address(PLAYER());
    let mut game = store.game(context.game_id);
    game.seed = setup::compute_seed(store.game(game.id), Plan::CFFFCFFFC);
    store.set_game(game);
    systems.play.draw(world, game.id); // CFFFCFFFC

    let orientation = Orientation::North;
    let x = CENTER;
    let y = CENTER + 2;
    systems.play.build(world, context.game_id, orientation, x, y, Role::None, Spot::None);

    // [Draw & Build]
    set_contract_address(PLAYER());
    let mut game = store.game(context.game_id);
    game.seed = setup::compute_seed(store.game(game.id), Plan::RFFFRFCFR);
    store.set_game(game);
    systems.play.draw(world, game.id); // RFFFRFCFR

    let orientation = Orientation::North;
    let x = CENTER;
    let y = CENTER + 1;
    systems.play.build(world, context.game_id, orientation, x, y, Role::None, Spot::None);

    // [Assert]
    let builder = store.builder(game, PLAYER().into());
    let expected: u32 = 3 * constants::CITY_BASE_POINTS + 1 * constants::FOREST_BASE_POINTS;
    assert(builder.score - expected <= expected, 'Build: builder score');
    let anyone = store.builder(game, ANYONE().into());
    let expected: u32 = 1 * constants::FOREST_BASE_POINTS;
    assert(anyone.score - expected <= expected, 'Build: anyone score');
}
