//! Events of the native contracts (phase P2). Each test checks that the event written by
//! `Store::emit` is exactly the one the contract's own `Event` enum declares.

use paved::constants;
use paved::events::{
    Built, Claimed, Discarded, Event as PavedEvent, GameOver, GameSpawned, PlayerCreated, Scored,
    Sponsored,
};
use paved::models::game::GameTrait;
use paved::models::tile::CENTER;
use paved::models::tournament::TournamentTrait;
use paved::systems::account::{Account, IAccountDispatcherTrait};
use paved::systems::daily::Daily;
use paved::systems::tutorial::{ITutorialDispatcherTrait, Tutorial};
use paved::tests::setup::setup;
use paved::tests::setup::setup::{
    IDailyDispatcherTrait, IERC20DispatcherTrait, PLAYER, TestStoreTrait,
};
use paved::types::category::Category;
use paved::types::mode::Mode;
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
                tournament_id: TournamentTrait::compute_id(game.start_time, game.duration()),
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
}
