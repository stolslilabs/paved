//! Gems v1, part 1 (P-61, `docs/architecture/gems-v1.md`, 7.2) through the real contracts: a paid
//! game over writes `Setup`'s ledger; the day's credit end to end, from paid games to a free game
//! and its game over; the free spawn's guards; the audit properties A7 and A8; and the PM's check
//! of 2026-10-15: a free game's game over emits `GameOver`, with the fields of a paid one's, on
//! every way it ends (the indexer ranks it from that event, as it has no `Recorded`).

use openzeppelin_interfaces::erc20::IERC20DispatcherTrait as OzERC20Trait;
use paved::constants::{self, CENTER};
use paved::events::game_over;
use paved::models::game::{FREE_GAME, GameImpl, GameTrait};
use paved::systems::challenge::{
    Challenge, IChallengeGuardianDispatcher, IChallengeGuardianDispatcherTrait,
    IChallengeSafeDispatcher, IChallengeSafeDispatcherTrait,
};
use paved::systems::collection::{IERC721SoulboundDispatcher, IERC721SoulboundDispatcherTrait};
use paved::systems::economy::{IEconomySafeDispatcher, IEconomySafeDispatcherTrait};
use paved::systems::setup::{
    DAY, ISetupGemsDispatcher, ISetupGemsDispatcherTrait, ISetupGemsSafeDispatcherTrait, Progress,
    Setup,
};
use paved::tests::e2e::gems_ledger::{define_fresh, set_fresh_gems};
use paved::tests::setup::setup;
use paved::tests::setup::setup::{
    IChallengeDispatcherTrait, IERC20DispatcherTrait, OWNER, PLAYER, TestStore, TestStoreTrait,
};
use paved::types::mode::Mode;
use paved::types::orientation::Orientation;
use paved::types::plan::Plan;
use quiver_quest::component::QuestComponent;
use quiver_quest::events::index::QuestProgressed;
use snforge_std::{
    EventSpyAssertionsTrait, EventSpyTrait, spy_events, start_cheat_block_timestamp_global,
    start_cheat_caller_address, stop_cheat_caller_address,
};

/// Day 14 (14 % 3 == 2: Great Works, Old Growth and Grand Day are live), 100 s in.
const DAY_14: u64 = 14 * 86400 + 100;
/// Day 15, 50 s in: a game spawned at `DAY_14` has not expired yet (24 h).
const DAY_15: u64 = 15 * 86400 + 50;

/// The systems on `DAY_14` with the fresh definitions and gems, and `PLAYER`'s paid game (id 1).
fn gems_game() -> (TestStore, setup::Systems, setup::Context) {
    start_cheat_block_timestamp_global(DAY_14);
    let (store, systems, context) = setup::spawn_game(Mode::Challenge);
    define_fresh(systems.setup.contract_address);
    set_fresh_gems(systems.setup.contract_address);
    (store, systems, context)
}

/// Ends `game_id` on its last `discard`, its score and counters set first (`free` keeps the
/// free mark the counters carry).
fn end_with(store: TestStore, systems: @setup::Systems, game_id: u32, score: u32, counts: u32) {
    let mut game = store.game(game_id);
    let free = if game.is_free() {
        FREE_GAME
    } else {
        0
    };
    game.score = score;
    game.counts = counts + free;
    game.tile_limit = game.tile_count.try_into().unwrap();
    store.set_game(game);
    systems.challenge.discard(game_id);
    assert(store.game(game_id).is_over(), 'Gems: not over');
}

/// Ends the paid game with every daily of any day met (12 structures, 4 forests, 8,000 points
/// after the last discard's 50).
fn complete_the_day(store: TestStore, systems: @setup::Systems, game_id: u32) {
    end_with(store, systems, game_id, 8050, GameImpl::counts_of(12, 4, 0, 0));
}

fn gems(systems: @setup::Systems) -> ISetupGemsDispatcher {
    ISetupGemsDispatcher { contract_address: *systems.setup.contract_address }
}

/// `PLAYER` claims the credit of `day` from `Setup`.
fn claim_credit(systems: @setup::Systems, day: u64) {
    let setup_address = *systems.setup.contract_address;
    start_cheat_caller_address(setup_address, PLAYER());
    gems(systems).claim_daily_credit(day);
    stop_cheat_caller_address(setup_address);
}

/// The systems with `PLAYER`'s free game spawned on `DAY_14` from the credit of its paid game:
/// returns the free game's id.
fn free_game() -> (TestStore, setup::Systems, setup::Context, u32) {
    let (store, systems, context) = gems_game();
    complete_the_day(store, @systems, context.game_id);
    claim_credit(@systems, 14);
    let game_id = systems.challenge.spawn_free();
    (store, systems, context, game_id)
}

/// A paid game over writes the day, the week and the account from its tally (7.2).
#[test]
fn test_gems_e2e_paid_game_over_writes_the_ledger() {
    let (store, systems, context) = gems_game();
    end_with(store, @systems, context.game_id, 4500, GameImpl::counts_of(2, 1, 1, 1));
    let p = context.player_id;
    let day = gems(@systems).day_progress(p, 14);
    // [Info] The last discard cost 50 points
    assert_eq!(store.game(context.game_id).score, 4450);
    assert_eq!(
        day,
        Progress { games: 1, structures: 2, forests: 1, points: 4450, claimed: 0, credit: false },
    );
    // [Info] Day 14 is in week 1 (Monday 1970-01-12 is day 11)
    assert_eq!(gems(@systems).week_progress(p, 1), day);
    let account = gems(@systems).account(p);
    assert_eq!(account.games, 1);
    assert_eq!(account.forests, 1);
    assert_eq!(account.wonders, 1);
    assert_eq!(account.big, 1);
    assert_eq!(account.high, 1);
}

/// A move that does not end the game writes nothing.
#[test]
fn test_gems_e2e_a_move_that_does_not_end_writes_nothing() {
    let (store, systems, context) = gems_game();
    let game = store.game(context.game_id);
    let builder = store.builder(game, context.player_id);
    let mut tile = store.tile(game, builder.tile_id);
    tile.plan = Plan::RFFFRFFFR.into();
    store.set_tile(tile);
    systems.challenge.build(context.game_id, Orientation::North, CENTER + 1, CENTER);
    assert!(!store.game(context.game_id).is_over());
    assert_eq!(gems(@systems).day_progress(context.player_id, 14), Default::default());
    assert_eq!(gems(@systems).account(context.player_id), Default::default());
}

/// The day's credit end to end (7.2): a paid game meets the four dailies of day 14; the player
/// claims their gems and the credit, spawns free, and ends the free game. The credit is spent, the
/// day's sums are those of the paid game, and the free game reported its achievements only.
#[test]
fn test_gems_e2e_day_credit_end_to_end() {
    let (store, systems, context) = gems_game();
    let setup_address = systems.setup.contract_address;
    let challenge = systems.challenge.contract_address;
    let p = context.player_id;
    complete_the_day(store, @systems, context.game_id);
    start_cheat_caller_address(setup_address, PLAYER());
    for id in array![1_u32, 7, 10, 13] {
        gems(@systems).claim_quest(id, 14);
    }
    gems(@systems).claim_daily_credit(14);
    stop_cheat_caller_address(setup_address);
    let account = gems(@systems).account(p);
    assert_eq!(account.gems, 5 + 15 + 15 + 15);
    assert_eq!(account.credits, 1);
    let day = gems(@systems).day_progress(p, 14);
    let week = gems(@systems).week_progress(p, 1);

    // [Free] The spawn: price 0, the credit spent
    let mut spy = spy_events();
    let game_id = systems.challenge.spawn_free();
    let spawned = store.game(game_id);
    assert!(spawned.is_free());
    spy
        .assert_emitted(
            @array![
                (
                    challenge,
                    Challenge::Event::PavedEvent(
                        paved::events::Event::GameSpawned(
                            paved::events::GameSpawned {
                                game_id,
                                player_id: p,
                                mode: Mode::Challenge.into(),
                                day_id: 14,
                                start_time: DAY_14,
                                price: 0,
                            },
                        ),
                    ),
                ),
            ],
        );
    spy
        .assert_emitted(
            @array![
                (
                    setup_address,
                    Setup::Event::CreditSpent(
                        Setup::CreditSpent { player_id: p, game_id, credits: 0 },
                    ),
                ),
            ],
        );
    assert_eq!(gems(@systems).account(p).credits, 0);

    // [Free] The game over: achievements only
    let mut spy = spy_events();
    end_with(store, @systems, game_id, 9000, GameImpl::counts_of(12, 4, 1, 1));
    let events = spy.get_events().events;
    let mut quests = 0;
    for (from, event) in events.span() {
        if *from == setup_address && event.keys.at(0) == @selector!("QuestProgressed") {
            quests += 1;
        }
    }
    assert_eq!(quests, 0);
    spy
        .assert_not_emitted(
            @array![
                (
                    setup_address,
                    Setup::Event::QuestEvent(
                        QuestComponent::Event::QuestProgressed(
                            QuestProgressed { player_id: p, task_id: 1, count: 1 },
                        ),
                    ),
                ),
            ],
        );
    assert_eq!(gems(@systems).day_progress(p, 14), day);
    assert_eq!(gems(@systems).week_progress(p, 1), week);
    let account = gems(@systems).account(p);
    assert_eq!(account.games, 2);
    assert_eq!(account.forests, 8);
    assert_eq!(account.wonders, 1);
    assert_eq!(account.big, 1);
    assert_eq!(account.high, 2);
    assert_eq!(account.credits, 0);
}

/// A7: a free game brings nothing into the Vault and takes nothing out. Its spawn makes no token
/// transfer and no `Economy` call, its game over no `Economy.record`, and no `settle` can pay it.
#[test]
#[feature("safe_dispatcher")]
fn test_gems_A7_free_game_brings_nothing_into_the_vault() {
    let (store, systems, context) = gems_game();
    complete_the_day(store, @systems, context.game_id);
    claim_credit(@systems, 14);
    let economy = systems.economy.contract_address;
    let addresses = paved::systems::economy::IEconomyDispatcherTrait::addresses(systems.economy);
    let usdc = context.token;
    let player_usdc = usdc.balance_of(PLAYER());
    let economy_usdc = usdc.balance_of(economy);
    let paved_token = openzeppelin_interfaces::erc20::IERC20Dispatcher {
        contract_address: addresses.paved,
    };
    let vault_paved = paved_token.balance_of(addresses.vault);
    let supply = paved_token.total_supply();
    let mut spy = spy_events();
    let game_id = systems.challenge.spawn_free();
    end_with(store, @systems, game_id, 9000, GameImpl::counts_of(12, 4, 1, 1));
    // [Check] No event of `Economy`, of USDC or of PAVED; every balance as before
    for (from, _) in spy.get_events().events.span() {
        assert!(*from != economy);
        assert!(*from != usdc.contract_address);
        assert!(*from != addresses.paved);
        assert!(*from != addresses.vault);
    }
    assert_eq!(usdc.balance_of(PLAYER()), player_usdc);
    assert_eq!(usdc.balance_of(economy), economy_usdc);
    assert_eq!(paved_token.balance_of(addresses.vault), vault_paved);
    assert_eq!(paved_token.total_supply(), supply);
    // [Check] The game is the player's token, and `Economy` does not know it
    let collection = IERC721SoulboundDispatcher {
        contract_address: systems.collection.contract_address,
    };
    assert_eq!(collection.owner_of(game_id.into()), PLAYER());
    start_cheat_block_timestamp_global(DAY_14 + 3 * DAY);
    let result = IEconomySafeDispatcher { contract_address: economy }
        .settle(array![game_id].span());
    match result {
        Result::Ok(_) => panic!("a free game was settled"),
        Result::Err(e) => assert_eq!(*e.at(0), 'Economy: unknown game'),
    }
}

/// A8: a free game cannot earn a credit: its game over reports no quest entries, so a day played
/// on free games alone stays empty, however high its tally.
#[test]
#[feature("safe_dispatcher")]
fn test_gems_A8_free_game_cannot_earn_a_credit() {
    let (store, systems, context, game_id) = free_game();
    // [Info] The free game ends on day 15
    start_cheat_block_timestamp_global(DAY_15);
    end_with(store, @systems, game_id, 9000, GameImpl::counts_of(30, 10, 2, 2));
    let p = context.player_id;
    assert_eq!(gems(@systems).day_progress(p, 15), Default::default());
    let setup_address = systems.setup.contract_address;
    start_cheat_caller_address(setup_address, PLAYER());
    let safe = paved::systems::setup::ISetupGemsSafeDispatcher { contract_address: setup_address };
    match safe.claim_daily_credit(15) {
        Result::Ok(_) => panic!("a free game earned a credit"),
        Result::Err(e) => assert_eq!(*e.at(0), 'Setup: not completed'),
    }
}

/// The spawn pause stops free games too; a free game in flight still ends (7.2, G4).
#[test]
#[feature("safe_dispatcher")]
fn test_gems_spawn_free_obeys_the_pause() {
    let (store, systems, _, game_id) = free_game();
    let challenge = systems.challenge.contract_address;
    // [Setup] A second credit, from day 15
    start_cheat_block_timestamp_global(DAY_15);
    let paid = systems.challenge.spawn(1, core::num::traits::Zero::zero(), 0);
    complete_the_day(store, @systems, paid);
    claim_credit(@systems, 15);
    start_cheat_caller_address(challenge, OWNER());
    IChallengeGuardianDispatcher { contract_address: challenge }.pause_spawn();
    start_cheat_caller_address(challenge, PLAYER());
    let safe = IChallengeSafeDispatcher { contract_address: challenge };
    match safe.spawn_free() {
        Result::Ok(_) => panic!("a paused spawn_free spawned"),
        Result::Err(e) => assert_eq!(*e.at(0), 'Challenge: spawn paused'),
    }
    assert_eq!(gems(@systems).account(PLAYER().into()).credits, 1);
    end_with(store, @systems, game_id, 10, 0);
}

/// Without a credit, `spawn_free` reverts: no game is created and no token minted.
#[test]
#[feature("safe_dispatcher")]
fn test_gems_spawn_free_without_a_credit() {
    let (store, systems, _) = gems_game();
    let challenge = systems.challenge.contract_address;
    let safe = IChallengeSafeDispatcher { contract_address: challenge };
    match safe.spawn_free() {
        Result::Ok(_) => panic!("spawned without a credit"),
        Result::Err(e) => assert_eq!(*e.at(0), 'Setup: no credit'),
    }
    let collection = IERC721SoulboundDispatcher {
        contract_address: systems.collection.contract_address,
    };
    assert_eq!(collection.balance_of(PLAYER()), 1);
    assert_eq!(store.game(2).player_id, 0);
    // [Info] The next game takes id 2
    assert_eq!(systems.challenge.spawn(1, core::num::traits::Zero::zero(), 0), 2);
}

// The PM's check (2026-10-15): `GameOver` on every way a free game ends

fn assert_game_over(
    store: TestStore, systems: @setup::Systems, spy: snforge_std::EventSpy, game_id: u32,
) {
    let game = store.game(game_id);
    assert!(game.is_over());
    let mut spy = spy;
    spy
        .assert_emitted(
            @array![
                (
                    *systems.challenge.contract_address,
                    Challenge::Event::PavedEvent(game_over(game, PLAYER().into())),
                ),
            ],
        );
}

/// On the last `build`, in its day: `GameOver` with its day id, score and end time.
#[test]
fn test_gems_free_game_over_on_the_last_build_emits_game_over() {
    let (store, systems, _, game_id) = free_game();
    let mut game = store.game(game_id);
    game.score = 300;
    game.tile_limit = game.tile_count.try_into().unwrap();
    store.set_game(game);
    let builder = store.builder(game, PLAYER().into());
    let mut tile = store.tile(game, builder.tile_id);
    tile.plan = Plan::RFFFRFFFR.into();
    store.set_tile(tile);
    let spy = spy_events();
    systems.challenge.build(game_id, Orientation::North, CENTER + 1, CENTER);
    let game = store.game(game_id);
    assert_eq!(game.day_id, 14);
    assert_eq!(game.end_time, DAY_14);
    assert!(game.is_free());
    assert_game_over(store, @systems, spy, game_id);
}

/// On the last `discard`, in its day.
#[test]
fn test_gems_free_game_over_on_the_last_discard_emits_game_over() {
    let (store, systems, _, game_id) = free_game();
    let spy = spy_events();
    end_with(store, @systems, game_id, 2500, GameImpl::counts_of(3, 1, 0, 0));
    let game = store.game(game_id);
    assert_eq!(game.score, 2450);
    assert_eq!(game.day_id, 14);
    assert_game_over(store, @systems, spy, game_id);
}

/// On a `surrender`, in its day.
#[test]
fn test_gems_free_game_over_on_surrender_emits_game_over() {
    let (store, systems, _, game_id) = free_game();
    let spy = spy_events();
    systems.challenge.surrender(game_id);
    let game = store.game(game_id);
    assert_eq!(game.day_id, 14);
    assert_eq!(game.end_time, DAY_14);
    assert_game_over(store, @systems, spy, game_id);
}

/// On expiry: an expired game takes no move but a `surrender`, which ends it after its day:
/// `GameOver` with day id 0 and end time 0, as a paid game's, and still no `Economy` call.
#[test]
#[feature("safe_dispatcher")]
fn test_gems_free_game_over_after_expiry_emits_game_over() {
    let (store, systems, _, game_id) = free_game();
    start_cheat_block_timestamp_global(DAY_14 + constants::GAME_VALIDITY + 1);
    let safe = IChallengeSafeDispatcher { contract_address: systems.challenge.contract_address };
    match safe.discard(game_id) {
        Result::Ok(_) => panic!("an expired game took a move"),
        Result::Err(e) => assert_eq!(*e.at(0), 'Game: expired'),
    }
    let spy = spy_events();
    systems.challenge.surrender(game_id);
    let game = store.game(game_id);
    assert_eq!(game.day_id, 0);
    assert_eq!(game.end_time, 0);
    assert_game_over(store, @systems, spy, game_id);
    // [Info] Its achievements count, at the time it ends
    assert_eq!(gems(@systems).account(PLAYER().into()).games, 2);
}
