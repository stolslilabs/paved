//! The pause guardian of `Challenge.spawn` (G4, `docs/architecture/upgrade-owner.md`, section 3).
//! The owner sets the guardian; the guardian or the owner pauses `spawn`, the entry point that
//! takes money; only the owner unpauses. A paused `Challenge` still lets every game already bought
//! end, be reported to `Setup`, recorded and settled by `Economy`.

use core::num::traits::Zero;
use paved::components::ownable::{IOwnableDispatcher, IOwnableDispatcherTrait};
use paved::models::game::GameTrait;
use paved::models::tile::CENTER;
use paved::systems::challenge::{
    Challenge, GuardianSet, IChallengeGuardianDispatcher, IChallengeGuardianDispatcherTrait,
    IChallengeGuardianSafeDispatcher, IChallengeGuardianSafeDispatcherTrait,
    IChallengeSafeDispatcher, IChallengeSafeDispatcherTrait, SpawnPaused, SpawnUnpaused,
};
use paved::systems::economy::IEconomyDispatcherTrait;
use paved::tests::e2e::quests::{almost_over_daily, assert_daily_report};
use paved::tests::setup::setup;
use paved::tests::setup::setup::{
    ANYONE, IChallengeDispatcherTrait, IERC20DispatcherTrait, NOONE, OWNER, PLAYER, SOMEONE,
    TestStoreTrait,
};
use paved::types::mode::Mode;
use paved::types::orientation::Orientation;
use paved::types::plan::Plan;
use snforge_std::{
    EventSpyAssertionsTrait, EventSpyTrait, spy_events, start_cheat_block_timestamp_global,
    start_cheat_caller_address,
};
use starknet::ContractAddress;

fn GUARDIAN() -> ContractAddress {
    'GUARDIAN'.try_into().unwrap()
}

fn guardian_of(systems: @setup::Systems) -> IChallengeGuardianDispatcher {
    IChallengeGuardianDispatcher { contract_address: *systems.challenge.contract_address }
}

/// The owner sets `GUARDIAN`; `PLAYER` is the caller again after.
fn with_guardian(systems: @setup::Systems) -> IChallengeGuardianDispatcher {
    let guardian = guardian_of(systems);
    start_cheat_caller_address(guardian.contract_address, OWNER());
    guardian.set_guardian(GUARDIAN());
    start_cheat_caller_address(guardian.contract_address, PLAYER());
    guardian
}

/// `caller` calls `pause_spawn`; `PLAYER` is the caller again after.
fn pause(guardian: IChallengeGuardianDispatcher, caller: ContractAddress) {
    start_cheat_caller_address(guardian.contract_address, caller);
    guardian.pause_spawn();
    start_cheat_caller_address(guardian.contract_address, PLAYER());
}

/// `caller` calls `unpause_spawn`; `PLAYER` is the caller again after.
fn unpause(guardian: IChallengeGuardianDispatcher, caller: ContractAddress) {
    start_cheat_caller_address(guardian.contract_address, caller);
    guardian.unpause_spawn();
    start_cheat_caller_address(guardian.contract_address, PLAYER());
}

/// How many events `address` emitted since the spy started.
fn count_from(ref spy: snforge_std::EventSpy, address: ContractAddress) -> u32 {
    let events = spy.get_events().events;
    let mut count = 0;
    for (from, _) in events.span() {
        if *from == address {
            count += 1;
        }
    }
    count
}

// set_guardian

/// A fresh `Challenge` has no guardian and is not paused; the owner sets the guardian (an event),
/// and zero clears it (an event too).
#[test]
fn test_guardian_owner_sets_and_clears_it() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let guardian = guardian_of(@systems);
    let challenge = guardian.contract_address;
    assert(guardian.guardian().is_zero(), 'Guardian: set at deploy');
    assert(!guardian.spawn_paused(), 'Guardian: paused at deploy');
    let mut spy = spy_events();
    start_cheat_caller_address(challenge, OWNER());
    guardian.set_guardian(GUARDIAN());
    assert(guardian.guardian() == GUARDIAN(), 'Guardian: not set');
    guardian.set_guardian(Zero::zero());
    assert(guardian.guardian().is_zero(), 'Guardian: not cleared');
    spy
        .assert_emitted(
            @array![
                (challenge, Challenge::Event::GuardianSet(GuardianSet { guardian: GUARDIAN() })),
                (challenge, Challenge::Event::GuardianSet(GuardianSet { guardian: Zero::zero() })),
            ],
        );
    assert(!guardian.spawn_paused(), 'Guardian: paused');
}

#[test]
#[should_panic(expected: 'Ownable: caller is not owner')]
fn test_guardian_set_guardian_reverts_for_a_player() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    guardian_of(@systems).set_guardian(PLAYER());
}

#[test]
#[should_panic(expected: 'Ownable: caller is not owner')]
fn test_guardian_set_guardian_reverts_for_the_guardian() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let guardian = with_guardian(@systems);
    start_cheat_caller_address(guardian.contract_address, GUARDIAN());
    guardian.set_guardian(SOMEONE());
}

// pause_spawn

/// The guardian pauses (an event, `by` the guardian); a second pause does nothing: no revert, no
/// event, still paused.
#[test]
fn test_guardian_pauses_once() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let guardian = with_guardian(@systems);
    let challenge = guardian.contract_address;
    let mut spy = spy_events();
    pause(guardian, GUARDIAN());
    assert(guardian.spawn_paused(), 'Guardian: not paused');
    spy
        .assert_emitted(
            @array![(challenge, Challenge::Event::SpawnPaused(SpawnPaused { by: GUARDIAN() }))],
        );
    let mut spy = spy_events();
    pause(guardian, GUARDIAN());
    pause(guardian, OWNER());
    assert(guardian.spawn_paused(), 'Guardian: unpaused');
    assert_eq!(count_from(ref spy, challenge), 0);
}

/// The owner can do what the guardian can: it pauses, with or without a guardian.
#[test]
fn test_guardian_owner_pauses_without_a_guardian() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let guardian = guardian_of(@systems);
    let challenge = guardian.contract_address;
    let mut spy = spy_events();
    pause(guardian, OWNER());
    assert(guardian.spawn_paused(), 'Guardian: not paused');
    spy
        .assert_emitted(
            @array![(challenge, Challenge::Event::SpawnPaused(SpawnPaused { by: OWNER() }))],
        );
}

#[test]
#[should_panic(expected: 'Challenge: not guardian')]
fn test_guardian_pause_reverts_for_a_player() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let guardian = with_guardian(@systems);
    guardian.pause_spawn();
}

/// With no guardian (zero), the zero address is no guardian either.
#[test]
#[should_panic(expected: 'Challenge: not guardian')]
fn test_guardian_pause_reverts_for_zero_without_a_guardian() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    pause(guardian_of(@systems), Zero::zero());
}

/// A cleared guardian can no longer pause.
#[test]
#[should_panic(expected: 'Challenge: not guardian')]
fn test_guardian_pause_reverts_for_a_cleared_guardian() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let guardian = with_guardian(@systems);
    start_cheat_caller_address(guardian.contract_address, OWNER());
    guardian.set_guardian(Zero::zero());
    pause(guardian, GUARDIAN());
}

// unpause_spawn

/// The owner unpauses (an event); a second unpause does nothing: no revert, no event.
#[test]
fn test_guardian_owner_unpauses_once() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let guardian = with_guardian(@systems);
    let challenge = guardian.contract_address;
    pause(guardian, GUARDIAN());
    let mut spy = spy_events();
    unpause(guardian, OWNER());
    assert(!guardian.spawn_paused(), 'Guardian: still paused');
    spy.assert_emitted(@array![(challenge, Challenge::Event::SpawnUnpaused(SpawnUnpaused {}))]);
    let mut spy = spy_events();
    unpause(guardian, OWNER());
    assert(!guardian.spawn_paused(), 'Guardian: paused');
    assert_eq!(count_from(ref spy, challenge), 0);
}

#[test]
#[should_panic(expected: 'Ownable: caller is not owner')]
fn test_guardian_unpause_reverts_for_the_guardian() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let guardian = with_guardian(@systems);
    pause(guardian, GUARDIAN());
    unpause(guardian, GUARDIAN());
}

#[test]
#[should_panic(expected: 'Ownable: caller is not owner')]
fn test_guardian_unpause_reverts_for_a_player() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let guardian = with_guardian(@systems);
    pause(guardian, GUARDIAN());
    guardian.unpause_spawn();
}

// The two-step ownership

/// After a transfer the new owner unpauses and pauses; the old owner can do neither.
#[test]
#[feature("safe_dispatcher")]
fn test_guardian_new_owner_holds_the_pause() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let guardian = with_guardian(@systems);
    let challenge = guardian.contract_address;
    let ownable = IOwnableDispatcher { contract_address: challenge };
    pause(guardian, GUARDIAN());
    start_cheat_caller_address(challenge, OWNER());
    ownable.transfer_ownership(ANYONE());
    // Pending only: the old owner still holds the power, the candidate does not yet
    let safe = IChallengeGuardianSafeDispatcher { contract_address: challenge };
    start_cheat_caller_address(challenge, ANYONE());
    let reason = *safe.unpause_spawn().unwrap_err().at(0);
    assert(reason == 'Ownable: caller is not owner', 'Guardian: pending unpaused');
    ownable.accept_ownership();
    // The old owner can no longer unpause, pause or set the guardian
    start_cheat_caller_address(challenge, OWNER());
    let reason = *safe.unpause_spawn().unwrap_err().at(0);
    assert(reason == 'Ownable: caller is not owner', 'Guardian: old owner unpaused');
    let reason = *safe.set_guardian(NOONE()).unwrap_err().at(0);
    assert(reason == 'Ownable: caller is not owner', 'Guardian: old owner set');
    // The new owner unpauses, and pauses
    unpause(guardian, ANYONE());
    assert(!guardian.spawn_paused(), 'Guardian: still paused');
    let reason = *safe.pause_spawn().unwrap_err().at(0);
    assert(reason == 'Challenge: not guardian', 'Guardian: player paused');
    start_cheat_caller_address(challenge, OWNER());
    let reason = *safe.pause_spawn().unwrap_err().at(0);
    assert(reason == 'Challenge: not guardian', 'Guardian: old owner paused');
    pause(guardian, ANYONE());
    assert(guardian.spawn_paused(), 'Guardian: not paused');
    // The guardian set by the old owner is kept
    assert(guardian.guardian() == GUARDIAN(), 'Guardian: lost');
}

// What stops and what does not

/// A paused spawn reverts before any token moves: no game, no terms in `Economy`, no USDC out of
/// the player, no event from the token; after the owner's unpause, the same spawn works.
#[test]
#[feature("safe_dispatcher")]
fn test_guardian_paused_spawn_reverts_before_any_transfer() {
    let (store, systems, context) = setup::spawn_game(Mode::None);
    let guardian = with_guardian(@systems);
    let challenge = guardian.contract_address;
    pause(guardian, GUARDIAN());
    let before = context.token.balance_of(PLAYER());
    let economy_before = context.token.balance_of(systems.economy.contract_address);
    let mut spy = spy_events();
    let safe = IChallengeSafeDispatcher { contract_address: challenge };
    let reason = *safe.spawn(1, Zero::zero(), 0).unwrap_err().at(0);
    assert(reason == 'Challenge: spawn paused', 'Guardian: reason');
    let reason = *safe.spawn(10, SOMEONE(), 0).unwrap_err().at(0);
    assert(reason == 'Challenge: spawn paused', 'Guardian: reason referred');
    assert_eq!(count_from(ref spy, context.token.contract_address), 0);
    assert_eq!(count_from(ref spy, systems.economy.contract_address), 0);
    assert_eq!(count_from(ref spy, systems.collection.contract_address), 0);
    assert(context.token.balance_of(PLAYER()) == before, 'Guardian: player debited');
    assert(
        context.token.balance_of(systems.economy.contract_address) == economy_before,
        'Guardian: economy paid',
    );
    assert(store.game(1).player_id == 0, 'Guardian: a game was left');
    assert(systems.economy.terms(1).player.is_zero(), 'Guardian: terms were left');
    // Unpaused, the spawn works
    unpause(guardian, OWNER());
    let game_id = systems.challenge.spawn(1, Zero::zero(), 0);
    assert(store.game(game_id).player_id == PLAYER().into(), 'Guardian: no game');
    assert(context.token.balance_of(PLAYER()) < before, 'Guardian: not paid');
}

/// Games bought before the pause end while paused, every way: a build that does not end the game,
/// a discard, a surrender, and the game over on a build (reported to `Setup`, recorded by
/// `Economy`). Two days later each recorded game settles, still paused.
#[test]
fn test_guardian_paused_lets_games_end_and_settle() {
    // Game 1 is one tile from its end (day 10); games 2 and 3 are bought the same day
    let (store, systems, context) = almost_over_daily();
    let first = context.game_id;
    let second = systems.challenge.spawn(1, Zero::zero(), 0);
    let third = systems.challenge.spawn(1, Zero::zero(), 0);
    let guardian = with_guardian(@systems);
    pause(guardian, GUARDIAN());

    // Game 2: a discard, then a build that does not end it
    systems.challenge.discard(second);
    let game = store.game(second);
    let builder = store.builder(game, context.player_id);
    let mut tile = store.tile(game, builder.tile_id);
    tile.plan = Plan::RFFFRFFFR.into();
    store.set_tile(tile);
    systems.challenge.build(second, Orientation::North, CENTER + 1, CENTER);
    let game = store.game(second);
    assert(!game.over, 'Guardian: second over');
    assert_eq!(game.discarded, 1);
    // ... then a surrender, recorded
    systems.challenge.surrender(second);
    assert(systems.economy.terms(second).recorded, 'Guardian: second not recorded');

    // Game 3: a surrender, recorded
    systems.challenge.surrender(third);
    assert(systems.economy.terms(third).recorded, 'Guardian: third not recorded');

    // Game 1: the game over on its last build, reported to `Setup` and recorded
    let mut spy = spy_events();
    let game = store.game(first);
    let builder = store.builder(game, context.player_id);
    let mut tile = store.tile(game, builder.tile_id);
    tile.plan = Plan::RFFFRFFFR.into();
    store.set_tile(tile);
    systems.challenge.build(first, Orientation::North, CENTER + 1, CENTER);
    let game = store.game(first);
    assert(game.is_over(), 'Guardian: first not over');
    assert_daily_report(@systems, spy, context.player_id, game.score);
    let terms = systems.economy.terms(first);
    assert(terms.recorded && terms.score == game.score, 'Guardian: first not recorded');

    // Settlement, from the end of the next day, still paused
    assert(guardian.spawn_paused(), 'Guardian: unpaused');
    let day = store.game(first).start_time / 86400;
    start_cheat_block_timestamp_global((day + 2) * 86400);
    systems.economy.settle(array![first, second, third].span());
    assert(systems.economy.terms(first).settled, 'Guardian: first not settled');
    assert(systems.economy.terms(second).settled, 'Guardian: second not settled');
    assert(systems.economy.terms(third).settled, 'Guardian: third not settled');
    assert(systems.economy.day(day).closed, 'Guardian: day not closed');
}
