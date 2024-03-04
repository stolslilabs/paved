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
fn test_case_000() {
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

    set_transaction_hash(setup::compute_tx_hash(store.game(game.id), Plan::RFFFRFCFR));
    systems.play.draw(world, game.id); // RFFFRFCFR
    let builder = store.builder(game, PLAYER().into());
    let orientation = Orientation::South;
    let x = CENTER + 1;
    let y = CENTER;
    systems
        .play
        .build(world, context.game_id, builder.tile_id, orientation, x, y, Role::Lady, Spot::North);

    // [Draw & Build]
    set_contract_address(ANYONE());

    set_transaction_hash(setup::compute_tx_hash(store.game(game.id), Plan::RFFFRFCFR));
    systems.play.draw(world, game.id); // RFFFRFCFR
    let builder = store.builder(game, ANYONE().into());
    let orientation = Orientation::South;
    let x = CENTER - 1;
    let y = CENTER;
    systems
        .play
        .build(
            world, context.game_id, builder.tile_id, orientation, x, y, Role::Paladin, Spot::North
        );

    // [Draw & Build]
    set_contract_address(PLAYER());

    set_transaction_hash(setup::compute_tx_hash(store.game(game.id), Plan::CCCCCFFFC));
    systems.play.draw(world, game.id); // CCCCCFFFC
    let builder = store.builder(game, PLAYER().into());
    let orientation = Orientation::South;
    let x = CENTER;
    let y = CENTER + 1;
    systems
        .play
        .build(
            world, context.game_id, builder.tile_id, orientation, x, y, Role::Paladin, Spot::Center
        );

    // [Draw & Build]
    set_contract_address(PLAYER());

    set_transaction_hash(setup::compute_tx_hash(store.game(game.id), Plan::FFFFCCCFF));
    systems.play.draw(world, game.id); // FFFFCCCFF
    let builder = store.builder(game, PLAYER().into());
    let orientation = Orientation::North;
    let x = CENTER - 1;
    let y = CENTER + 1;
    systems
        .play
        .build(world, context.game_id, builder.tile_id, orientation, x, y, Role::None, Spot::None);

    // [Draw & Build]
    set_contract_address(PLAYER());

    set_transaction_hash(setup::compute_tx_hash(store.game(game.id), Plan::FFCFFFFFC));
    systems.play.draw(world, game.id); // FFCFFFFFC
    let builder = store.builder(game, PLAYER().into());
    let orientation = Orientation::West;
    let x = CENTER + 1;
    let y = CENTER + 1;
    systems
        .play
        .build(world, context.game_id, builder.tile_id, orientation, x, y, Role::None, Spot::None);

    // [Assert]
    let builder = store.builder(game, PLAYER().into());
    let expected: u32 = 2 * constants::CITY_BASE_POINTS;
    assert(builder.score == expected, 'Build: builder score');
    let anyone = store.builder(game, ANYONE().into());
    let expected: u32 = 0;
    assert(anyone.score == expected, 'Build: anyone score');
}
