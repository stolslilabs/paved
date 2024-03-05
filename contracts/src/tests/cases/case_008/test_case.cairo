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
use stolsli::systems::host::IHostDispatcherTrait;
use stolsli::systems::play::IPlayDispatcherTrait;
use stolsli::tests::setup::{setup, setup::{Systems, PLAYER, ANYONE}};

#[test]
fn test_case_008() {
    // [Setup]
    let (world, systems, context) = setup::spawn_game();
    let store = StoreTrait::new(world);
    let game = store.game(context.game_id);

    // [Spawn]
    set_contract_address(ANYONE());
    let anyone = store.player(context.anyone_id);
    systems.host.join(world, context.game_id, anyone.order);
    set_contract_address(PLAYER());
    let player = store.player(context.player_id);
    systems.host.join(world, context.game_id, player.order);
    systems.host.start(world, game.id);

    // [Draw & Build]
    set_contract_address(PLAYER());

    set_transaction_hash(setup::compute_tx_hash(store.game(game.id), Plan::RFRFFFCFR));
    systems.play.draw(world, game.id); // RFRFFFCFR
    let builder = store.builder(game, PLAYER().into());
    let orientation = Orientation::South;
    let x = CENTER - 1;
    let y = CENTER;
    systems
        .play
        .build(world, context.game_id, builder.tile_id, orientation, x, y, Role::None, Spot::None);

    // [Draw & Build]
    set_contract_address(ANYONE());

    set_transaction_hash(setup::compute_tx_hash(store.game(game.id), Plan::CCCCCFRFC));
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

    set_transaction_hash(setup::compute_tx_hash(store.game(game.id), Plan::FFCFFFFFC));
    systems.play.draw(world, game.id); // FFCFFFFFC
    let builder = store.builder(game, ANYONE().into());
    let orientation = Orientation::South;
    let x = CENTER - 1;
    let y = CENTER + 2;
    systems
        .play
        .build(world, context.game_id, builder.tile_id, orientation, x, y, Role::None, Spot::None);

    // [Draw & Build]
    set_contract_address(PLAYER());

    set_transaction_hash(setup::compute_tx_hash(store.game(game.id), Plan::RFRFRFCFF));
    systems.play.draw(world, game.id); // RFRFRFCFF
    let builder = store.builder(game, PLAYER().into());
    let orientation = Orientation::South;
    let x = CENTER + 1;
    let y = CENTER;
    systems
        .play
        .build(world, context.game_id, builder.tile_id, orientation, x, y, Role::None, Spot::None);

    // [Draw & Build]
    set_contract_address(PLAYER());

    set_transaction_hash(setup::compute_tx_hash(store.game(game.id), Plan::CCCCCFRFC));
    systems.play.draw(world, game.id); // CCCCCFRFC
    let builder = store.builder(game, PLAYER().into());
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
    set_contract_address(PLAYER());

    set_transaction_hash(setup::compute_tx_hash(store.game(game.id), Plan::FFCFFFFFC));
    systems.play.draw(world, game.id); // FFCFFFFFC
    let builder = store.builder(game, PLAYER().into());
    let orientation = Orientation::West;
    let x = CENTER + 1;
    let y = CENTER + 2;
    systems
        .play
        .build(world, context.game_id, builder.tile_id, orientation, x, y, Role::Lord, Spot::West);

    // [Draw & Build]
    set_contract_address(PLAYER());

    set_transaction_hash(setup::compute_tx_hash(store.game(game.id), Plan::CFFFCFFFC));
    systems.play.draw(world, game.id); // CFFFCFFFC
    let builder = store.builder(game, PLAYER().into());
    let orientation = Orientation::North;
    let x = CENTER;
    let y = CENTER + 2;
    systems
        .play
        .build(world, context.game_id, builder.tile_id, orientation, x, y, Role::None, Spot::None);

    // [Draw & Build]
    set_contract_address(PLAYER());

    set_transaction_hash(setup::compute_tx_hash(store.game(game.id), Plan::RFFFRFCFR));
    systems.play.draw(world, game.id); // RFFFRFCFR
    let builder = store.builder(game, PLAYER().into());
    let orientation = Orientation::North;
    let x = CENTER;
    let y = CENTER + 1;
    systems
        .play
        .build(world, context.game_id, builder.tile_id, orientation, x, y, Role::None, Spot::None);

    // [Assert]
    let builder = store.builder(game, PLAYER().into());
    let expected: u32 = 3 * constants::CITY_BASE_POINTS + 1 * constants::FOREST_BASE_POINTS;
    assert(builder.score - expected <= expected, 'Build: builder score');
    let anyone = store.builder(game, ANYONE().into());
    let expected: u32 = 1 * constants::FOREST_BASE_POINTS;
    assert(anyone.score - expected <= expected, 'Build: anyone score');
}
