// Core imports

use debug::PrintTrait;

// Starknet imports

use starknet::testing::{set_contract_address, set_transaction_hash};

// Dojo imports

use dojo::world::{IWorldDispatcher, IWorldDispatcherTrait};

// Internal imports

use stolsli::constants;
use stolsli::store::{Store, StoreTrait};
use stolsli::models::game::{Game, GameTrait};
use stolsli::models::builder::{Builder, BuilderTrait};
use stolsli::models::tile::{Tile, TileTrait, CENTER};
use stolsli::types::order::Order;
use stolsli::types::orientation::Orientation;
use stolsli::types::direction::Direction;
use stolsli::types::plan::Plan;
use stolsli::types::role::Role;
use stolsli::types::spot::Spot;
use stolsli::systems::play::IPlayDispatcherTrait;
use stolsli::tests::setup::{setup, setup::{Systems, BUILDER, ANYONE}};

// Constants

const BUILDER_NAME: felt252 = 'BUILDER';
const ANYONE_NAME: felt252 = 'ANYONE';

#[test]
fn test_cases_010() {
    // [Setup]
    let (world, systems, context) = setup::spawn_game();
    let store = StoreTrait::new(world);
    let game = store.game(context.game_id);

    // [Spawn]
    set_contract_address(BUILDER());
    systems.play.spawn(world, game.id, BUILDER_NAME, Order::Anger.into());
    set_contract_address(ANYONE());
    systems.play.spawn(world, game.id, ANYONE_NAME, Order::Fox.into());

    // [Draw & Build]
    set_contract_address(BUILDER());
    set_transaction_hash(0x15);
    systems.play.draw(world, game.id); // RFRFFFCFR
    let builder = store.builder(game, BUILDER().into());
    let orientation = Orientation::South;
    let x = CENTER - 1;
    let y = CENTER;
    systems
        .play
        .build(world, context.game_id, builder.tile_id, orientation, x, y, Role::None, Spot::None);

    // [Draw & Build]
    set_contract_address(ANYONE());
    set_transaction_hash(0x1a);
    systems.play.draw(world, game.id); // CCCCCFRFC
    let builder = store.builder(game, ANYONE().into());
    let orientation = Orientation::West;
    let x = CENTER - 1;
    let y = CENTER + 1;
    systems
        .play
        .build(
            world,
            context.game_id,
            builder.tile_id,
            orientation,
            x,
            y,
            Role::Woodsman,
            Spot::SouthEast
        );

    // [Draw & Build]
    set_contract_address(ANYONE());
    set_transaction_hash(0x1);
    systems.play.draw(world, game.id); // FFCFFFFFC
    let builder = store.builder(game, ANYONE().into());
    let orientation = Orientation::South;
    let x = CENTER - 1;
    let y = CENTER + 2;
    systems
        .play
        .build(
            world, context.game_id, builder.tile_id, orientation, x, y, Role::Paladin, Spot::East
        );

    // [Draw & Build]
    set_contract_address(BUILDER());
    set_transaction_hash(0x30);
    systems.play.draw(world, game.id); // RFRFRFCFF
    let builder = store.builder(game, BUILDER().into());
    let orientation = Orientation::South;
    let x = CENTER + 1;
    let y = CENTER;
    systems
        .play
        .build(world, context.game_id, builder.tile_id, orientation, x, y, Role::None, Spot::None);

    // [Draw & Build]
    set_contract_address(BUILDER());
    set_transaction_hash(0x4);
    systems.play.draw(world, game.id); // CCCCCFRFC
    let builder = store.builder(game, BUILDER().into());
    let orientation = Orientation::East;
    let x = CENTER + 1;
    let y = CENTER + 1;
    systems
        .play
        .build(
            world,
            context.game_id,
            builder.tile_id,
            orientation,
            x,
            y,
            Role::Herdsman,
            Spot::SouthWest
        );

    // [Draw & Build]
    set_contract_address(BUILDER());
    set_transaction_hash(0xcb);
    systems.play.draw(world, game.id); // FFCFFFFFC
    let builder = store.builder(game, BUILDER().into());
    let orientation = Orientation::West;
    let x = CENTER + 1;
    let y = CENTER + 2;
    systems
        .play
        .build(world, context.game_id, builder.tile_id, orientation, x, y, Role::Lord, Spot::West);

    // [Draw & Build]
    set_contract_address(BUILDER());
    set_transaction_hash(0x6);
    systems.play.draw(world, game.id); // CFFFCFFFC
    let builder = store.builder(game, BUILDER().into());
    let orientation = Orientation::North;
    let x = CENTER;
    let y = CENTER + 2;
    systems
        .play
        .build(world, context.game_id, builder.tile_id, orientation, x, y, Role::None, Spot::None);

    // [Draw & Build]
    set_contract_address(BUILDER());
    set_transaction_hash(0x14);
    systems.play.draw(world, game.id); // RFFFRFCFR
    let builder = store.builder(game, BUILDER().into());
    let orientation = Orientation::North;
    let x = CENTER;
    let y = CENTER + 1;
    systems
        .play
        .build(world, context.game_id, builder.tile_id, orientation, x, y, Role::Lady, Spot::South);

    // [Assert]
    let builder = store.builder(game, BUILDER().into());
    let expected: u32 = 2 * constants::CITY_BASE_POINTS + 1 * constants::FOREST_BASE_POINTS;
    assert(builder.score == expected, 'Build: builder score');
    let anyone = store.builder(game, ANYONE().into());
    let expected: u32 = 6 * constants::CITY_BASE_POINTS + 1 * constants::FOREST_BASE_POINTS;
    assert(anyone.score == expected, 'Build: anyone score');
}
