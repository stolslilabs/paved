//! The player's XP and level (#641, `docs/architecture/xp-level.md`): the curve, the credits of a
//! game over (`report`), of Story stars (`credit_story`) and of PvP (`credit_xp`), who may credit,
//! the ceiling, the layout of the account slot and the view. `Setup` alone, with a test reporter in
//! place of `Challenge`, `Story` and #643; the path through the real `Challenge` is `e2e::cobbles`.

use core::num::traits::Bounded;
use paved::systems::setup::Setup::{Event as SetupEvent, XpGained};
use paved::systems::setup::{
    Account, AccountPacking, GAME_XP, ISetupCobblesDispatcher, ISetupCobblesDispatcherTrait,
    ISetupLevelDispatcher, ISetupLevelDispatcherTrait, ISetupLevelSafeDispatcher,
    ISetupLevelSafeDispatcherTrait, ISetupStoryDispatcher, ISetupStoryDispatcherTrait,
    MAX_CREDIT_XP, MAX_XP, PlayerLevel, STAR_XP, XP_ATTACK, XP_CHALLENGE, XP_DEFENCE, XP_STORY,
    level_floor, level_of,
};
use paved::tests::e2e::cobbles_ledger::{REPORTER, paid_report, report_at, setup_alone};
use paved::tests::setup::setup::{ANYONE, PLAYER};
use snforge_std::{
    EventSpyAssertionsTrait, load, map_entry_address, spy_events, start_cheat_caller_address,
    stop_cheat_caller_address, store,
};
use starknet::ContractAddress;

fn level_of_setup(setup: ContractAddress) -> ISetupLevelDispatcher {
    ISetupLevelDispatcher { contract_address: setup }
}

/// `credit_xp` as `REPORTER`.
fn credit(setup: ContractAddress, player: ContractAddress, source: u8, xp: u32) {
    start_cheat_caller_address(setup, REPORTER());
    level_of_setup(setup).credit_xp(player.into(), source, xp);
    stop_cheat_caller_address(setup);
}

/// The first error of a refused safe call.
fn error_of<T, +Drop<T>>(result: Result<T, Array<felt252>>) -> felt252 {
    match result {
        Result::Ok(_) => 'no error',
        Result::Err(panic) => *panic.at(0),
    }
}

fn xp_gained(player: ContractAddress, source: u8, xp: u32, total: u32) -> SetupEvent {
    SetupEvent::XpGained(
        XpGained { player_id: player.into(), source, xp, total, level: level_of(total) },
    )
}

/// A small generator (a 64-bit LCG, as the ledger's fuzz): the next state, and a value below
/// `bound`.
fn next(ref state: u64, bound: u64) -> u64 {
    let wide: u128 = state.into() * 6364136223846793005 + 1442695040888963407;
    state = (wide % 0x10000000000000000).try_into().unwrap();
    (state / 65536) % bound
}

/// Writes `player`'s account slot as it is stored.
fn store_account(setup: ContractAddress, player: ContractAddress, account: Account) {
    let slot = map_entry_address(selector!("accounts"), array![player.into()].span());
    store(setup, slot, array![AccountPacking::pack(account)].span());
}

// The curve

#[test]
fn test_xp_level_curve_table() {
    // [Info] Level `L` starts at `50 L (L - 1)` XP (xp-level.md, 3)
    let table: Array<(u16, u64)> = array![
        (1, 0), (2, 100), (3, 300), (4, 600), (5, 1000), (10, 4500), (20, 19000), (30, 43500),
    ];
    for (level, floor) in table {
        assert_eq!(level_floor(level), floor);
        let floor: u32 = floor.try_into().unwrap();
        assert_eq!(level_of(floor), level);
        if floor != 0 {
            assert_eq!(level_of(floor - 1), level - 1);
        }
    }
    assert_eq!(level_of(0), 1);
    assert_eq!(level_of(99), 1);
    assert_eq!(level_of(MAX_XP), 1638);
    assert_eq!(level_of(Bounded::<u32>::MAX), 9268);
}

#[test]
fn test_xp_level_curve_every_floor_to_the_ceiling() {
    // [Info] Every level up to the XP's ceiling starts at its floor, one XP under it is the level
    // before
    let mut level: u16 = 2;
    while level <= 1638 {
        let floor: u32 = level_floor(level).try_into().unwrap();
        assert_eq!(level_of(floor), level);
        assert_eq!(level_of(floor - 1), level - 1);
        level += 1;
    }
    assert!(level_floor(1639) > MAX_XP.into(), "the ceiling's level is 1638");
}

/// The level of any XP is the one whose floor it reaches and whose next floor it does not.
#[test]
#[fuzzer(runs: 256, seed: 641)]
fn test_fuzz_xp_level_of_is_between_its_floors(xp: u32) {
    let level = level_of(xp);
    assert!(level >= 1, "level 1 at least");
    assert!(level_floor(level) <= xp.into(), "floor reached");
    assert!(level_floor(level + 1) > xp.into(), "next floor not reached");
}

// The credits

#[test]
fn test_xp_report_credits_each_game_over() {
    let setup = setup_alone();
    let mut spy = spy_events();
    // A paid game over, then a free one (achievements only): 20 XP each
    paid_report(setup, PLAYER(), 1000, 3, 500, 1);
    report_at(setup, PLAYER(), 2000, array![], array![(1, 1), (5, 1)]);
    let account = ISetupCobblesDispatcher { contract_address: setup }.account(PLAYER().into());
    assert_eq!(account.xp, 2 * GAME_XP);
    assert_eq!(account.games, 2);
    spy
        .assert_emitted(
            @array![
                (setup, xp_gained(PLAYER(), XP_CHALLENGE, GAME_XP, GAME_XP)),
                (setup, xp_gained(PLAYER(), XP_CHALLENGE, GAME_XP, 2 * GAME_XP)),
            ],
        );
    assert_eq!(
        level_of_setup(setup).player_level(PLAYER().into()),
        PlayerLevel { xp: 40, level: 1, floor: 0, next: 100 },
    );
}

#[test]
fn test_xp_report_without_a_game_credits_nothing() {
    // [Info] Entries with no game (task 1) give no XP and emit no `XpGained`
    let setup = setup_alone();
    let mut spy = spy_events();
    report_at(setup, PLAYER(), 1000, array![(2, 1)], array![(5, 1)]);
    report_at(setup, PLAYER(), 1000, array![(1, 1)], array![]);
    assert_eq!(level_of_setup(setup).player_level(PLAYER().into()).xp, 0);
    spy.assert_not_emitted(@array![(setup, xp_gained(PLAYER(), XP_CHALLENGE, GAME_XP, GAME_XP))]);
}

#[test]
fn test_xp_story_credits_each_new_star() {
    let setup = setup_alone();
    let story = ISetupStoryDispatcher { contract_address: setup };
    let mut spy = spy_events();
    start_cheat_caller_address(setup, REPORTER());
    // Two stars, then the third: one event per credit, 10 XP per star
    story.credit_story(PLAYER().into(), 1, 1, 0, 2);
    story.credit_story(PLAYER().into(), 1, 1, 2, 3);
    stop_cheat_caller_address(setup);
    spy
        .assert_emitted(
            @array![
                (setup, xp_gained(PLAYER(), XP_STORY, 2 * STAR_XP, 2 * STAR_XP)),
                (setup, xp_gained(PLAYER(), XP_STORY, STAR_XP, 3 * STAR_XP)),
            ],
        );
    let account = ISetupCobblesDispatcher { contract_address: setup }.account(PLAYER().into());
    assert_eq!(account.xp, 3 * STAR_XP);
    assert_eq!(account.cobbles, 30);
}

#[test]
fn test_xp_credit_pvp_attack_and_defence() {
    let setup = setup_alone();
    let mut spy = spy_events();
    credit(setup, PLAYER(), XP_ATTACK, 25);
    credit(setup, PLAYER(), XP_DEFENCE, MAX_CREDIT_XP);
    spy
        .assert_emitted(
            @array![
                (setup, xp_gained(PLAYER(), XP_ATTACK, 25, 25)),
                (setup, xp_gained(PLAYER(), XP_DEFENCE, MAX_CREDIT_XP, 125)),
            ],
        );
    assert_eq!(
        level_of_setup(setup).player_level(PLAYER().into()),
        PlayerLevel { xp: 125, level: 2, floor: 100, next: 300 },
    );
    assert_eq!(level_of_setup(setup).player_level(ANYONE().into()).xp, 0);
}

#[test]
#[feature("safe_dispatcher")]
fn test_xp_credit_refusals() {
    let setup = setup_alone();
    let safe = ISetupLevelSafeDispatcher { contract_address: setup };
    // [Check] A reporter only: a player cannot credit itself
    start_cheat_caller_address(setup, PLAYER());
    assert_eq!(error_of(safe.credit_xp(PLAYER().into(), XP_ATTACK, 10)), 'Quest: not reporter');
    // [Check] PvP sources only: Challenge and Story credit through their own calls
    start_cheat_caller_address(setup, REPORTER());
    for source in array![0, XP_CHALLENGE, XP_STORY, 5, 255] {
        assert_eq!(
            error_of(safe.credit_xp(PLAYER().into(), source, 10)), 'Setup: invalid xp source',
        );
    }
    // [Check] 1 to `MAX_CREDIT_XP`
    assert_eq!(error_of(safe.credit_xp(PLAYER().into(), XP_ATTACK, 0)), 'Setup: invalid xp');
    assert_eq!(
        error_of(safe.credit_xp(PLAYER().into(), XP_ATTACK, MAX_CREDIT_XP + 1)),
        'Setup: invalid xp',
    );
    stop_cheat_caller_address(setup);
    assert_eq!(level_of_setup(setup).player_level(PLAYER().into()).xp, 0);
}

#[test]
fn test_xp_saturates_at_its_ceiling() {
    // [Info] One XP under the ceiling: a credit adds what fits, the next adds 0; nothing else moves
    let setup = setup_alone();
    let before = Account {
        cobbles: 7,
        credits: 2,
        games: Bounded::<u16>::MAX,
        achievements_claimed: 6,
        xp: MAX_XP - 1,
        ..Default::default(),
    };
    store_account(setup, PLAYER(), before);
    let mut spy = spy_events();
    credit(setup, PLAYER(), XP_ATTACK, 50);
    report_at(setup, PLAYER(), 1000, array![], array![(1, 1)]);
    spy
        .assert_emitted(
            @array![
                (setup, xp_gained(PLAYER(), XP_ATTACK, 1, MAX_XP)),
                (setup, xp_gained(PLAYER(), XP_CHALLENGE, 0, MAX_XP)),
            ],
        );
    let after = ISetupCobblesDispatcher { contract_address: setup }.account(PLAYER().into());
    assert_eq!(after, Account { xp: MAX_XP, ..before });
    assert_eq!(level_of_setup(setup).player_level(PLAYER().into()).level, 1638);
}

// The layout and the upgrade

#[test]
fn test_xp_account_slot_written_before_the_xp_reads_zero() {
    // [Info] An account packed by the layout before #641 (bits 224 and up zero) reads XP 0, every
    // other field as it was: the upgrade needs no migration
    let m16: u128 = 0xffff;
    let m64: u128 = 0xffffffffffffffff;
    let low: u128 = Bounded::<u128>::MAX;
    let high: u128 = m16 + m16 * 0x10000 + m64 * 0x100000000;
    let old: felt252 = u256 { low, high }.try_into().unwrap();
    let account = AccountPacking::unpack(old);
    assert_eq!(account.xp, 0);
    assert_eq!(account.achievements_claimed, Bounded::<u64>::MAX);
    assert_eq!(account.high, Bounded::<u16>::MAX);
    assert_eq!(account.cobbles, Bounded::<u64>::MAX);
    // [Info] And the XP sits at bits [224, 251) of the stored word
    let setup = setup_alone();
    credit(setup, PLAYER(), XP_ATTACK, 3);
    let slot = map_entry_address(selector!("accounts"), array![PLAYER().into()].span());
    let word: u256 = (*load(setup, slot, 1).at(0)).into();
    assert_eq!(word.high, 3 * 0x1000000000000000000000000);
}

/// Any sequence of credits leaves the XP at the sum of the `XpGained` amounts, never above the
/// ceiling, and the cobbles, credits and claims untouched.
#[test]
#[fuzzer(runs: 24, seed: 641)]
fn test_fuzz_xp_credits_sum_and_touch_nothing_else(seed: u64) {
    let setup = setup_alone();
    let before = Account { cobbles: 11, credits: 3, achievements_claimed: 5, ..Default::default() };
    store_account(setup, PLAYER(), before);
    let mut state = seed;
    let mut expected: u32 = 0;
    for _ in 0..8_u8 {
        let pick = next(ref state, 4);
        let amount: u32 = next(ref state, MAX_CREDIT_XP.into()).try_into().unwrap() + 1;
        if pick == 0 {
            paid_report(setup, PLAYER(), 1000, 1, 1, 1);
            expected += GAME_XP;
        } else if pick == 1 {
            credit(setup, PLAYER(), XP_ATTACK, amount);
            expected += amount;
        } else if pick == 2 {
            credit(setup, PLAYER(), XP_DEFENCE, amount);
            expected += amount;
        } else {
            start_cheat_caller_address(setup, REPORTER());
            ISetupStoryDispatcher { contract_address: setup }
                .credit_story(PLAYER().into(), 2, 1, 0, 1);
            stop_cheat_caller_address(setup);
            expected += STAR_XP;
        }
    }
    let after = ISetupCobblesDispatcher { contract_address: setup }.account(PLAYER().into());
    assert_eq!(after.xp, expected);
    assert_eq!(after.credits, before.credits);
    assert_eq!(after.achievements_claimed, before.achievements_claimed);
    let level = level_of_setup(setup).player_level(PLAYER().into());
    assert_eq!(level.level, level_of(expected));
    assert!(level.floor <= level.xp && level.xp < level.next, "between its floors");
}
