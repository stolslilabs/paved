//! Events of the native contracts (phase P2). Each test checks that the event written by
//! `Store::emit` is exactly the one the contract's own `Event` enum declares.

use paved::constants;
use paved::day::day_id;
use paved::events::{Built, Discarded, Event as PavedEvent, GameOver, GameSpawned, Scored};
use paved::models::game::GameTrait;
use paved::models::tile::{CENTER, Tile};
use paved::systems::challenge::Challenge;
use paved::tests::setup::setup;
use paved::tests::setup::setup::{
    IChallengeDispatcherTrait, IERC20DispatcherTrait, PLAYER, TestStoreTrait,
};
use paved::types::category::{Category, CategoryImpl};
use paved::types::mode::{Mode, ModeTrait};
use paved::types::orientation::Orientation;
use paved::types::plan::Plan;
use snforge_std::{
    EventSpyAssertionsTrait, spy_events, start_cheat_block_timestamp_global,
    start_cheat_caller_address,
};
use starknet::ContractAddress;

fn challenge(event: PavedEvent) -> Challenge::Event {
    Challenge::Event::PavedEvent(event)
}

#[test]
#[available_gas(l2_gas: 119595000)]
fn test_events_daily_spawn_emits_game_spawned() {
    start_cheat_block_timestamp_global(100);
    let (store, systems, context) = setup::spawn_game(Mode::None);
    let mut spy = spy_events();
    let game_id = systems.challenge.spawn(1, core::num::traits::Zero::zero(), 0);
    let game = store.game(game_id);
    let event = challenge(
        PavedEvent::GameSpawned(
            GameSpawned {
                game_id,
                player_id: context.player_id,
                mode: Mode::Challenge.into(),
                day_id: day_id(100, constants::CHALLENGE_DURATION),
                start_time: 100,
                price: constants::CHALLENGE_PRICE,
            },
        ),
    );
    assert(game.start_time == 100, 'Events: start time');
    spy.assert_emitted(@array![(systems.challenge.contract_address, event)]);
}

#[test]
#[available_gas(l2_gas: 129655000)]
fn test_events_daily_build_emits_built_and_scored() {
    let (store, systems, context) = setup::spawn_game(Mode::Challenge);
    let game = store.game(context.game_id);
    let builder = store.builder(game, context.player_id);
    let mut tile = store.tile(game, builder.tile_id);
    tile.plan = Plan::FFCFFFCFF.into();
    store.set_tile(tile);

    let mut spy = spy_events();
    // Closes a 2-tile city (new tile's S cap on the starter's N cap): it scores, with no character.
    systems.challenge.build(context.game_id, Orientation::North, CENTER, CENTER + 1);

    let game = store.game(context.game_id);
    assert(game.score > 0, 'Events: city scored');
    let built = challenge(
        PavedEvent::Built(
            Built {
                game_id: context.game_id,
                player_id: context.player_id,
                tile_id: tile.id,
                plan: Plan::FFCFFFCFF.into(),
                orientation: Orientation::North.into(),
                x: CENTER,
                y: CENTER + 1,
            },
        ),
    );
    let scored = challenge(
        PavedEvent::Scored(
            Scored {
                game_id: context.game_id,
                player_id: context.player_id,
                category: Category::City.into(),
                size: 2,
                points: game.score,
            },
        ),
    );
    spy
        .assert_emitted(
            @array![
                (systems.challenge.contract_address, built),
                (systems.challenge.contract_address, scored),
            ],
        );
}

#[test]
#[available_gas(l2_gas: 123110000)]
fn test_events_daily_discard_emits_discarded() {
    let (store, systems, context) = setup::spawn_game(Mode::Challenge);
    let game = store.game(context.game_id);
    let builder = store.builder(game, context.player_id);
    let tile = store.tile(game, builder.tile_id);

    let mut spy = spy_events();
    systems.challenge.discard(context.game_id);

    // The score cannot go below zero: the penalty is what was actually taken.
    let after = store.game(context.game_id);
    let event = challenge(
        PavedEvent::Discarded(
            Discarded {
                game_id: context.game_id,
                player_id: context.player_id,
                tile_id: tile.id,
                plan: tile.plan,
                points: game.score - after.score,
            },
        ),
    );
    spy.assert_emitted(@array![(systems.challenge.contract_address, event)]);
}

#[test]
#[available_gas(l2_gas: 124925000)]
fn test_events_daily_surrender_emits_game_over() {
    // A day after the epoch, so that the day id is not zero.
    let time: u64 = 86400 * 1000 + 3600;
    start_cheat_block_timestamp_global(time);
    let (store, systems, context) = setup::spawn_game(Mode::Challenge);

    let mut spy = spy_events();
    systems.challenge.surrender(context.game_id);

    let game = store.game(context.game_id);
    assert(game.day_id != 0, 'Events: day set');
    let event = challenge(
        PavedEvent::GameOver(
            GameOver {
                game_id: context.game_id,
                day_id: game.day_id,
                player_id: context.player_id,
                mode: Mode::Challenge.into(),
                score: game.score,
                start_time: time,
                end_time: time,
            },
        ),
    );
    spy.assert_emitted(@array![(systems.challenge.contract_address, event)]);
}

#[test]
#[available_gas(l2_gas: 146756000)]
fn test_events_daily_last_build_emits_game_over() {
    start_cheat_block_timestamp_global(100);
    let (store, systems, context) = setup::spawn_game(Mode::Challenge);
    let game = store.game(context.game_id);
    let builder = store.builder(game, context.player_id);
    let mut tile = store.tile(game, builder.tile_id);
    tile.plan = Plan::FFCFFFCFF.into();
    store.set_tile(tile);
    // The starter and the drawn tile are the whole game: the next build is the last one.
    let mut game = game;
    game.tile_limit = game.tile_count.try_into().unwrap();
    store.set_game(game);

    let mut spy = spy_events();
    systems.challenge.build(context.game_id, Orientation::North, CENTER, CENTER + 1);

    let game = store.game(context.game_id);
    assert(game.over, 'Events: game over');
    let built = challenge(
        PavedEvent::Built(
            Built {
                game_id: context.game_id,
                player_id: context.player_id,
                tile_id: tile.id,
                plan: Plan::FFCFFFCFF.into(),
                orientation: Orientation::North.into(),
                x: CENTER,
                y: CENTER + 1,
            },
        ),
    );
    let over = challenge(
        PavedEvent::GameOver(
            GameOver {
                game_id: context.game_id,
                day_id: game.day_id,
                player_id: context.player_id,
                mode: Mode::Challenge.into(),
                score: game.score,
                start_time: game.start_time,
                end_time: game.end_time,
            },
        ),
    );
    spy
        .assert_emitted(
            @array![
                (systems.challenge.contract_address, built),
                (systems.challenge.contract_address, over),
            ],
        );
}

#[test]
#[available_gas(l2_gas: 127052000)]
fn test_events_daily_last_discard_emits_game_over() {
    // A day after the epoch, so that the day id is not zero.
    let time: u64 = 86400 * 1000 + 3600;
    start_cheat_block_timestamp_global(time);
    let (store, systems, context) = setup::spawn_game(Mode::Challenge);
    let mut game = store.game(context.game_id);
    game.tile_limit = game.tile_count.try_into().unwrap();
    store.set_game(game);

    let mut spy = spy_events();
    systems.challenge.discard(context.game_id);

    let game = store.game(context.game_id);
    assert(game.over, 'Events: game over');
    assert(game.day_id != 0, 'Events: day set');
    let over = challenge(
        PavedEvent::GameOver(
            GameOver {
                game_id: context.game_id,
                day_id: game.day_id,
                player_id: context.player_id,
                mode: Mode::Challenge.into(),
                score: game.score,
                start_time: time,
                end_time: time,
            },
        ),
    );
    spy.assert_emitted(@array![(systems.challenge.contract_address, over)]);
}

#[test]
#[available_gas(l2_gas: 174474000)]
fn test_events_daily_wonder_emits_scored() {
    let (store, systems, context) = setup::spawn_game(Mode::Challenge);
    let game = store.game(context.game_id);
    let builder = store.builder(game, context.player_id);

    // A wonder east of the starter tile.
    let mut tile = store.tile(game, builder.tile_id);
    tile.plan = Plan::WFFFFFFFR.into();
    store.set_tile(tile);
    systems.challenge.build(context.game_id, Orientation::North, CENTER + 1, CENTER);

    // Seven more neighbors of the wonder: six are written directly (field tiles), the starter is
    // already there, and the last one is built through the contract.
    let mut id = 100;
    for (x, y) in array![
        (CENTER + 1, CENTER + 1), (CENTER + 2, CENTER + 1), (CENTER + 2, CENTER),
        (CENTER + 2, CENTER - 1), (CENTER + 1, CENTER - 1), (CENTER, CENTER - 1),
    ] {
        store
            .set_tile(
                Tile {
                    game_id: context.game_id,
                    id,
                    plan: Plan::FFFFFFCFF.into(),
                    orientation: Orientation::North.into(),
                    x,
                    y,
                    owner: 0,
                },
            );
        id += 1;
    }

    // The eighth neighbor closes the wonder (and, since D-18, the 2-tile city it makes with the
    // starter's north cap, which scores too).
    let game = store.game(context.game_id);
    let builder = store.builder(game, context.player_id);
    let mut tile = store.tile(game, builder.tile_id);
    tile.plan = Plan::FFFFFFCFF.into();
    store.set_tile(tile);
    let score_before = game.score;

    let mut spy = spy_events();
    systems.challenge.build(context.game_id, Orientation::North, CENTER, CENTER + 1);

    let game = store.game(context.game_id);
    assert(game.score > score_before, 'Events: wonder scored');
    let scored = challenge(
        PavedEvent::Scored(
            Scored {
                game_id: context.game_id,
                player_id: context.player_id,
                category: Category::Wonder.into(),
                size: 0,
                points: Category::Wonder.base_points(),
            },
        ),
    );
    spy.assert_emitted(@array![(systems.challenge.contract_address, scored)]);
}
