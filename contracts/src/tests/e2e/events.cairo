//! Events of the native contracts (phase P2). Each test checks that the event written by
//! `Store::emit` is exactly the one the contract's own `Event` enum declares.

use paved::constants;
use paved::events::{
    Built, Claimed, Discarded, Event as PavedEvent, GameOver, GameSpawned, PlayerCreated, Scored,
    Sponsored,
};
use paved::models::game::GameTrait;
use paved::models::tile::{CENTER, Tile};
use paved::models::tournament::TournamentTrait;
use paved::systems::account::{Account, IAccountDispatcherTrait};
use paved::systems::daily::Daily;
use paved::systems::tutorial::{ITutorialDispatcherTrait, Tutorial};
use paved::tests::setup::setup;
use paved::tests::setup::setup::{
    IDailyDispatcherTrait, IERC20DispatcherTrait, PLAYER, TestStoreTrait,
};
use paved::types::category::Category;
use paved::types::mode::{Mode, ModeTrait};
use paved::types::orientation::Orientation;
use paved::types::plan::Plan;
use paved::types::role::Role;
use paved::types::spot::Spot;
use snforge_std::{
    EventSpyAssertionsTrait, spy_events, start_cheat_block_timestamp_global,
    start_cheat_caller_address,
};
use starknet::ContractAddress;

fn daily(event: PavedEvent) -> Daily::Event {
    Daily::Event::PavedEvent(event)
}

#[test]
fn test_events_account_create_emits_player_created() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let caller: ContractAddress = 'NEWCOMER'.try_into().unwrap();
    let mut spy = spy_events();
    start_cheat_caller_address(systems.account.contract_address, caller);
    systems.account.create('NEWCOMER', caller);
    let event = Account::Event::PavedEvent(
        PavedEvent::PlayerCreated(
            PlayerCreated { player_id: caller.into(), name: 'NEWCOMER', master: caller.into() },
        ),
    );
    spy.assert_emitted(@array![(systems.account.contract_address, event)]);
}

#[test]
fn test_events_daily_spawn_emits_game_spawned() {
    start_cheat_block_timestamp_global(100);
    let (store, systems, context) = setup::spawn_game(Mode::None);
    let mut spy = spy_events();
    let game_id = systems.daily.spawn();
    let game = store.game(game_id);
    let event = daily(
        PavedEvent::GameSpawned(
            GameSpawned {
                game_id,
                player_id: context.player_id,
                mode: Mode::Daily.into(),
                tournament_id: TournamentTrait::compute_id(
                    100, constants::DAILY_TOURNAMENT_DURATION,
                ),
                start_time: 100,
                price: constants::DAILY_TOURNAMENT_PRICE,
            },
        ),
    );
    assert(game.start_time == 100, 'Events: start time');
    spy.assert_emitted(@array![(systems.daily.contract_address, event)]);
}

#[test]
fn test_events_daily_build_emits_built_and_scored() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let game = store.game(context.game_id);
    let builder = store.builder(game, context.player_id);
    let mut tile = store.tile(game, builder.tile_id);
    tile.plan = Plan::FFCFFFCFF.into();
    store.set_tile(tile);

    let mut spy = spy_events();
    // Closes a 2-tile city (new tile's S cap on the starter's N cap) with a Lord on it: it scores.
    systems
        .daily
        .build(context.game_id, Orientation::North, CENTER, CENTER + 1, Role::Lord, Spot::South);

    let game = store.game(context.game_id);
    assert(game.score > 0, 'Events: city scored');
    let built = daily(
        PavedEvent::Built(
            Built {
                game_id: context.game_id,
                player_id: context.player_id,
                tile_id: tile.id,
                plan: Plan::FFCFFFCFF.into(),
                orientation: Orientation::North.into(),
                x: CENTER,
                y: CENTER + 1,
                role: Role::Lord.into(),
                spot: Spot::South.into(),
            },
        ),
    );
    let scored = daily(
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
                (systems.daily.contract_address, built), (systems.daily.contract_address, scored),
            ],
        );
}

#[test]
fn test_events_daily_discard_emits_discarded() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let game = store.game(context.game_id);
    let builder = store.builder(game, context.player_id);
    let tile = store.tile(game, builder.tile_id);

    let mut spy = spy_events();
    systems.daily.discard(context.game_id);

    // The score cannot go below zero: the penalty is what was actually taken.
    let after = store.game(context.game_id);
    let event = daily(
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
    spy.assert_emitted(@array![(systems.daily.contract_address, event)]);
}

#[test]
fn test_events_daily_surrender_emits_game_over() {
    // A day after the epoch, so that the tournament id is not zero.
    let time: u64 = 86400 * 1000 + 3600;
    start_cheat_block_timestamp_global(time);
    let (store, systems, context) = setup::spawn_game(Mode::Daily);

    let mut spy = spy_events();
    systems.daily.surrender(context.game_id);

    let game = store.game(context.game_id);
    assert(game.tournament_id != 0, 'Events: tournament set');
    let event = daily(
        PavedEvent::GameOver(
            GameOver {
                game_id: context.game_id,
                tournament_id: game.tournament_id,
                player_id: context.player_id,
                mode: Mode::Daily.into(),
                score: game.score,
                start_time: time,
                end_time: time,
            },
        ),
    );
    spy.assert_emitted(@array![(systems.daily.contract_address, event)]);
}

#[test]
fn test_events_daily_sponsor_and_claim() {
    start_cheat_block_timestamp_global(100);
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let game = store.game(context.game_id);
    let tournament_id = TournamentTrait::compute_id(
        game.start_time, constants::DAILY_TOURNAMENT_DURATION,
    );

    let mut spy = spy_events();
    systems.daily.sponsor(1000);
    let sponsored = daily(
        PavedEvent::Sponsored(Sponsored { tournament_id, sponsor: PLAYER(), amount: 1000 }),
    );
    spy.assert_emitted(@array![(systems.daily.contract_address, sponsored)]);

    // Force PLAYER as the top-1 winner, then claim after the tournament.
    let mut tournament = store.tournament(tournament_id);
    tournament.top1_player_id = context.player_id;
    tournament.top1_score = 1;
    store.set_tournament(tournament);
    start_cheat_block_timestamp_global(game.start_time + constants::DAILY_TOURNAMENT_DURATION + 1);
    let balance_before = context.token.balance_of(PLAYER());
    systems.daily.claim(tournament_id, 1);
    let reward = context.token.balance_of(PLAYER()) - balance_before;
    assert(reward > 0, 'Events: reward paid');
    let claimed = daily(
        PavedEvent::Claimed(
            Claimed { tournament_id, player_id: context.player_id, rank: 1, reward },
        ),
    );
    spy.assert_emitted(@array![(systems.daily.contract_address, claimed)]);
}

#[test]
fn test_events_tutorial_spawn_and_surrender() {
    // A non-zero time: at 0 the spawn time and 0 are the same value. A same-second game over is
    // the worst case for a tournament id computed from the time (Tutorial duration is 1 second).
    start_cheat_block_timestamp_global(100);
    let (_, systems, context) = setup::spawn_game(Mode::None);
    let mut spy = spy_events();
    let game_id = systems.tutorial.spawn();
    systems.tutorial.surrender(game_id);
    let tutorial = systems.tutorial.contract_address;
    let tutorial_store = TestStoreTrait::new(tutorial);
    let game = tutorial_store.game(game_id);
    let spawned = Tutorial::Event::PavedEvent(
        PavedEvent::GameSpawned(
            GameSpawned {
                game_id,
                player_id: context.player_id,
                mode: Mode::Tutorial.into(),
                tournament_id: 0,
                start_time: game.start_time,
                price: game.price(),
            },
        ),
    );
    let over = Tutorial::Event::PavedEvent(
        PavedEvent::GameOver(
            GameOver {
                game_id,
                tournament_id: 0,
                player_id: context.player_id,
                mode: Mode::Tutorial.into(),
                score: game.score,
                start_time: game.start_time,
                end_time: 0,
            },
        ),
    );
    spy.assert_emitted(@array![(tutorial, spawned), (tutorial, over)]);

    // The game, its view and both events agree: no tournament, and none was written.
    assert(game.start_time == 100, 'Events: start time');
    assert(game.tournament_id == 0, 'Events: game tournament');
    assert(tutorial_store.tournament(100).prize == 0, 'Events: tutorial tournament');
    assert(
        TestStoreTrait::new(systems.daily.contract_address).tournament(100).prize == 0,
        'Events: daily',
    );
}

#[test]
fn test_events_daily_last_build_emits_game_over() {
    start_cheat_block_timestamp_global(100);
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
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
    systems
        .daily
        .build(context.game_id, Orientation::North, CENTER, CENTER + 1, Role::None, Spot::None);

    let game = store.game(context.game_id);
    assert(game.over, 'Events: game over');
    let built = daily(
        PavedEvent::Built(
            Built {
                game_id: context.game_id,
                player_id: context.player_id,
                tile_id: tile.id,
                plan: Plan::FFCFFFCFF.into(),
                orientation: Orientation::North.into(),
                x: CENTER,
                y: CENTER + 1,
                role: Role::None.into(),
                spot: Spot::None.into(),
            },
        ),
    );
    let over = daily(
        PavedEvent::GameOver(
            GameOver {
                game_id: context.game_id,
                tournament_id: game.tournament_id,
                player_id: context.player_id,
                mode: Mode::Daily.into(),
                score: game.score,
                start_time: game.start_time,
                end_time: game.end_time,
            },
        ),
    );
    spy
        .assert_emitted(
            @array![
                (systems.daily.contract_address, built), (systems.daily.contract_address, over),
            ],
        );
}

#[test]
fn test_events_daily_last_discard_emits_game_over() {
    // A day after the epoch, so that the tournament id is not zero.
    let time: u64 = 86400 * 1000 + 3600;
    start_cheat_block_timestamp_global(time);
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let mut game = store.game(context.game_id);
    game.tile_limit = game.tile_count.try_into().unwrap();
    store.set_game(game);

    let mut spy = spy_events();
    systems.daily.discard(context.game_id);

    let game = store.game(context.game_id);
    assert(game.over, 'Events: game over');
    assert(game.tournament_id != 0, 'Events: tournament set');
    let over = daily(
        PavedEvent::GameOver(
            GameOver {
                game_id: context.game_id,
                tournament_id: game.tournament_id,
                player_id: context.player_id,
                mode: Mode::Daily.into(),
                score: game.score,
                start_time: time,
                end_time: time,
            },
        ),
    );
    spy.assert_emitted(@array![(systems.daily.contract_address, over)]);
}

#[test]
fn test_events_daily_wonder_emits_scored() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let game = store.game(context.game_id);
    let builder = store.builder(game, context.player_id);

    // A wonder with a pilgrim on it, east of the starter tile.
    let mut tile = store.tile(game, builder.tile_id);
    tile.plan = Plan::WFFFFFFFR.into();
    store.set_tile(tile);
    systems
        .daily
        .build(
            context.game_id, Orientation::North, CENTER + 1, CENTER, Role::Pilgrim, Spot::Center,
        );

    // Seven more neighbors of the wonder: six are written directly (field tiles with no
    // character), the starter is already there, and the last one is built through the contract.
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
                    occupied_spot: 0,
                },
            );
        id += 1;
    }

    // The eighth neighbor closes the wonder.
    let game = store.game(context.game_id);
    let builder = store.builder(game, context.player_id);
    let mut tile = store.tile(game, builder.tile_id);
    tile.plan = Plan::FFFFFFCFF.into();
    store.set_tile(tile);
    let score_before = game.score;

    let mut spy = spy_events();
    systems
        .daily
        .build(context.game_id, Orientation::North, CENTER, CENTER + 1, Role::None, Spot::None);

    let game = store.game(context.game_id);
    assert(game.score > score_before, 'Events: wonder scored');
    let scored = daily(
        PavedEvent::Scored(
            Scored {
                game_id: context.game_id,
                player_id: context.player_id,
                category: Category::Wonder.into(),
                size: 0,
                points: game.score - score_before,
            },
        ),
    );
    spy.assert_emitted(@array![(systems.daily.contract_address, scored)]);
}

/// Builds the next tile of the scripted tutorial and returns the `Built` event it must emit.
fn tutorial_build(
    store: setup::TestStore, systems: @setup::Systems, game_id: u32, player_id: felt252,
) -> (Tutorial::Event, u32) {
    let game = store.game(game_id);
    let builder = store.builder(game, player_id);
    let tile = store.tile(game, builder.tile_id);
    let (orientation, x, y, role, spot) = Mode::Tutorial.parameters(game.tiles);
    systems.tutorial.build(game_id);
    let built = Tutorial::Event::PavedEvent(
        PavedEvent::Built(
            Built {
                game_id,
                player_id,
                tile_id: tile.id,
                plan: tile.plan,
                orientation: orientation.into(),
                x,
                y,
                role: role.into(),
                spot: spot.into(),
            },
        ),
    );
    (built, game.score)
}

#[test]
fn test_events_tutorial_build_emits_built_and_scored() {
    let (_, systems, context) = setup::spawn_game(Mode::Tutorial);
    let tutorial = systems.tutorial.contract_address;
    let store = TestStoreTrait::new(tutorial);
    let mut spy = spy_events();

    // The third scripted step closes a structure (the golden game scores 1286 there).
    let (first, _) = tutorial_build(store, @systems, context.game_id, context.player_id);
    let (second, _) = tutorial_build(store, @systems, context.game_id, context.player_id);
    let (third, score_before) = tutorial_build(store, @systems, context.game_id, context.player_id);
    spy.assert_emitted(@array![(tutorial, first), (tutorial, second), (tutorial, third)]);

    let game = store.game(context.game_id);
    assert(game.score > score_before, 'Events: tutorial scored');
    let scored = Tutorial::Event::PavedEvent(
        PavedEvent::Scored(
            Scored {
                game_id: context.game_id,
                player_id: context.player_id,
                category: Category::City.into(),
                size: 3,
                points: game.score - score_before,
            },
        ),
    );
    spy.assert_emitted(@array![(tutorial, scored)]);
}

#[test]
fn test_events_tutorial_discard_emits_discarded() {
    let (_, systems, context) = setup::spawn_game(Mode::Tutorial);
    let tutorial = systems.tutorial.contract_address;
    let store = TestStoreTrait::new(tutorial);
    // The scripted tutorial only accepts a discard at its eighth step.
    let mut step: u8 = 0;
    while step < 7 {
        systems.tutorial.build(context.game_id);
        step += 1;
    }
    let game = store.game(context.game_id);
    let builder = store.builder(game, context.player_id);
    let tile = store.tile(game, builder.tile_id);

    let mut spy = spy_events();
    systems.tutorial.discard(context.game_id);

    let after = store.game(context.game_id);
    let event = Tutorial::Event::PavedEvent(
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
    spy.assert_emitted(@array![(tutorial, event)]);
}
