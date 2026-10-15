//! Gems v1, part 1 (P-61, `docs/architecture/gems-v1.md`): the ledger of `Setup` on its own, with
//! a test reporter in place of `Challenge` (7.1, 7.4). The packing of every slot, the calendar,
//! the owner's settings, the claims, the credits and their spend, and the audit properties of 7.5
//! that part 1 carries (A1, A2, A3, A5, A6), each in a test named after it. The paths through the
//! real `Challenge` (the report of a game over, the free game: A7, A8) are `e2e::gems`.

use core::dict::{Felt252Dict, Felt252DictTrait};
use core::num::traits::Bounded;
use paved::systems::setup::{
    Account, AccountPacking, AchievementGems, AchievementGemsPacking, DAILY, DAY, ISetupDispatcher,
    ISetupDispatcherTrait, ISetupGemsDispatcher, ISetupGemsDispatcherTrait,
    ISetupGemsSafeDispatcher, ISetupGemsSafeDispatcherTrait, ISetupSafeDispatcherTrait, Progress,
    ProgressPacking, QuestGems, QuestGemsPacking, QuestGemsTrait, Setup, WEEK, WEEKLY, WEEK_START,
    list_ids, list_word, schedule_kind, week_of,
};
use paved::tests::setup::setup::{ANYONE, OWNER, PLAYER};
use quiver_achievement::types::batch::TaskProgress as AchievementProgress;
use quiver_achievement::types::task::AchievementTask;
use quiver_achievement::types::window::AchievementWindow;
use quiver_quest::types::batch::TaskProgress as QuestProgress;
use quiver_quest::types::schedule::QuestSchedule;
use quiver_quest::types::task::QuestTask;
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, EventSpyAssertionsTrait, declare, spy_events,
    start_cheat_block_timestamp_global, start_cheat_caller_address, stop_cheat_caller_address,
};
use starknet::ContractAddress;

// Fixtures

pub fn REPORTER() -> ContractAddress {
    'REPORTER'.try_into().unwrap()
}

/// The fresh deployment's quests (`scripts/deploy.sh`, `FRESH_QUESTS`): `id task total start
/// duration interval`, and their gems (gems-v1.md, 3.1).
pub fn fresh_quests() -> Array<(u32, u32, u32, u64, u32, u32, u8)> {
    array![
        (1, 1, 1, 0, 86400, 86400, 5), (5, 2, 4, 0, 86400, 259200, 5),
        (6, 2, 8, 86400, 86400, 259200, 10), (7, 2, 12, 172800, 86400, 259200, 15),
        (8, 4, 2, 0, 86400, 259200, 5), (9, 4, 3, 86400, 86400, 259200, 10),
        (10, 4, 4, 172800, 86400, 259200, 15), (11, 3, 2000, 0, 86400, 259200, 5),
        (12, 3, 5000, 86400, 86400, 259200, 10), (13, 3, 8000, 172800, 86400, 259200, 15),
        (14, 4, 5, 345600, 604800, 604800, 15), (15, 2, 30, 345600, 604800, 604800, 15),
        (16, 3, 20000, 345600, 604800, 604800, 15),
    ]
}

/// The fresh deployment's achievements (`FRESH_ACHIEVEMENTS`): `id task total points`; their gems
/// are their points, but for On the Podium (9), which has none in v1.
pub fn fresh_achievements() -> Array<(u32, u32, u32, u16)> {
    array![
        (1, 10, 1, 10), (2, 1, 1, 10), (3, 1, 10, 20), (4, 1, 50, 40), (5, 6, 1, 20),
        (6, 4, 10, 20), (7, 5, 1, 30), (8, 7, 1, 30), (9, 8, 1, 50), (10, 4, 50, 40),
        (11, 5, 10, 50), (12, 6, 10, 40), (13, 7, 10, 50), (14, 7, 25, 80), (15, 1, 250, 60),
        (16, 1, 1000, 80),
    ]
}

/// A `Setup` alone, `REPORTER` allowed.
pub fn setup_alone() -> ContractAddress {
    let class = declare("Setup").unwrap().contract_class();
    let (address, _) = class.deploy(@array![OWNER().into()]).unwrap();
    start_cheat_caller_address(address, OWNER());
    ISetupDispatcher { contract_address: address }.set_reporter(REPORTER(), true);
    stop_cheat_caller_address(address);
    address
}

/// Defines the fresh quests and achievements on `setup`, as its owner.
pub fn define_fresh(setup: ContractAddress) {
    let admin = ISetupDispatcher { contract_address: setup };
    start_cheat_caller_address(setup, OWNER());
    for (id, task, total, start, duration, interval, _) in fresh_quests() {
        let schedule = QuestSchedule { start, end: 0, duration, interval };
        admin
            .define_quest(
                id, schedule, array![QuestTask { task_id: task, total }].span(), array![].span(),
            );
    }
    for (id, task, total, points) in fresh_achievements() {
        admin
            .define_achievement(
                id,
                AchievementWindow { start: 0, end: 0 },
                array![AchievementTask { task_id: task, total }].span(),
                points,
            );
    }
    stop_cheat_caller_address(setup);
}

/// Sets the gems of every fresh quest and achievement (but 9), as the owner.
pub fn set_fresh_gems(setup: ContractAddress) {
    let gems = ISetupGemsDispatcher { contract_address: setup };
    start_cheat_caller_address(setup, OWNER());
    for (id, _, _, _, _, _, amount) in fresh_quests() {
        gems.set_quest_gems(id, amount);
    }
    for (id, _, _, points) in fresh_achievements() {
        if id != 9 {
            gems.set_achievement_gems(id, points.try_into().unwrap());
        }
    }
    stop_cheat_caller_address(setup);
}

/// A `Setup` with the fresh definitions and gems.
pub fn fresh_setup() -> ContractAddress {
    let setup = setup_alone();
    define_fresh(setup);
    set_fresh_gems(setup);
    setup
}

/// A report for `player` at `time`, as `REPORTER`: `(task, count)` pairs for the quests and for
/// the achievements.
pub fn report_at(
    setup: ContractAddress,
    player: ContractAddress,
    time: u64,
    quests: Array<(u32, u32)>,
    achievements: Array<(u32, u32)>,
) {
    let mut quest_entries: Array<QuestProgress> = array![];
    for (task_id, count) in quests {
        quest_entries.append(QuestProgress { task_id, count });
    }
    let mut achievement_entries: Array<AchievementProgress> = array![];
    for (task_id, count) in achievements {
        achievement_entries.append(AchievementProgress { task_id, count });
    }
    start_cheat_block_timestamp_global(time);
    start_cheat_caller_address(setup, REPORTER());
    ISetupDispatcher { contract_address: setup }
        .report(player.into(), quest_entries.span(), achievement_entries.span());
    stop_cheat_caller_address(setup);
}

/// A paid game over's report: the quest entries of its tally, and the achievements' (no high
/// score).
pub fn paid_report(
    setup: ContractAddress,
    player: ContractAddress,
    time: u64,
    structures: u32,
    points: u32,
    forests: u32,
) {
    report_at(
        setup,
        player,
        time,
        array![(1, 1), (2, structures), (3, points), (4, forests)],
        array![(1, 1), (4, forests)],
    );
}

fn gems_of(setup: ContractAddress) -> ISetupGemsDispatcher {
    ISetupGemsDispatcher { contract_address: setup }
}

fn safe(setup: ContractAddress) -> ISetupGemsSafeDispatcher {
    ISetupGemsSafeDispatcher { contract_address: setup }
}

/// The first error of a refused safe call.
fn error_of<T, +Drop<T>>(result: Result<T, Array<felt252>>) -> felt252 {
    match result {
        Result::Ok(_) => 'no error',
        Result::Err(panic) => *panic.at(0),
    }
}

fn as_caller(setup: ContractAddress, caller: ContractAddress) {
    start_cheat_caller_address(setup, caller);
}

/// A day with `day % 3 == rotation`, after week 0 starts: 12 + rotation (day 12 is a Saturday).
fn day_of_rotation(rotation: u64) -> u64 {
    12 + rotation
}

// Packing (7.1)

fn round_trip_account(value: Account) {
    assert_eq!(AccountPacking::unpack(AccountPacking::pack(value)), value);
}

fn round_trip_progress(value: Progress) {
    assert_eq!(ProgressPacking::unpack(ProgressPacking::pack(value)), value);
}

fn round_trip_quest(value: QuestGems) {
    assert_eq!(QuestGemsPacking::unpack(QuestGemsPacking::pack(value)), value);
}

fn round_trip_achievement(value: AchievementGems) {
    assert_eq!(AchievementGemsPacking::unpack(AchievementGemsPacking::pack(value)), value);
}

#[test]
#[available_gas(l2_gas: 1921093)]
fn test_gems_packing_round_trips_at_zero_one_and_maximum() {
    let m16 = Bounded::<u16>::MAX;
    let m32 = Bounded::<u32>::MAX;
    let m64 = Bounded::<u64>::MAX;
    round_trip_account(Default::default());
    round_trip_account(
        Account {
            gems: 1,
            credits: 1,
            games: 1,
            forests: 1,
            wonders: 1,
            big: 1,
            high: 1,
            achievements_claimed: 1,
        },
    );
    round_trip_account(
        Account {
            gems: m64,
            credits: m16,
            games: m16,
            forests: m16,
            wonders: m16,
            big: m16,
            high: m16,
            achievements_claimed: m64,
        },
    );
    // [Info] Each field alone at its maximum: no field spills into a neighbour
    round_trip_account(Account { wonders: m16, ..Default::default() });
    round_trip_account(Account { big: m16, ..Default::default() });
    round_trip_progress(Default::default());
    round_trip_progress(
        Progress { games: 1, structures: 1, forests: 1, points: 1, claimed: 1, credit: true },
    );
    round_trip_progress(
        Progress {
            games: m16, structures: m16, forests: m16, points: m32, claimed: m64, credit: true,
        },
    );
    round_trip_progress(Progress { points: m32, ..Default::default() });
    round_trip_progress(Progress { credit: true, ..Default::default() });
    round_trip_quest(Default::default());
    round_trip_quest(QuestGems { gems: 1, kind: 1, task: 1, total: 1, start: 1, interval: 1 });
    round_trip_quest(
        QuestGems {
            gems: Bounded::<u8>::MAX,
            kind: Bounded::<u8>::MAX,
            task: m32,
            total: m32,
            start: m64,
            interval: m32,
        },
    );
    round_trip_achievement(Default::default());
    round_trip_achievement(AchievementGems { gems: 1, task: 1, total: 1 });
    round_trip_achievement(AchievementGems { gems: Bounded::<u8>::MAX, task: m32, total: m32 });
}

#[test]
#[available_gas(l2_gas: 1990575)]
fn test_gems_quest_list_round_trips() {
    // [Info] Empty, one, the bound of 15 with the highest id; a 16th is refused
    assert_eq!(list_ids(list_word(array![].span())).len(), 0);
    assert_eq!(list_ids(list_word(array![63].span())), array![63]);
    let full = array![1, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 62, 63];
    assert_eq!(list_ids(list_word(full.span())), full);
}

#[test]
#[available_gas(l2_gas: 62465)]
#[should_panic(expected: 'Setup: list full')]
fn test_gems_quest_list_refuses_a_sixteenth() {
    list_word(array![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].span());
}

/// The counters saturate at their maximum and never wrap (7.1).
#[test]
#[available_gas(l2_gas: 13179384)]
fn test_gems_counters_saturate() {
    let setup = setup_alone();
    let time = WEEK_START;
    let max = Bounded::<u32>::MAX;
    report_at(setup, PLAYER(), time, array![(1, 65535), (2, max), (3, max), (4, 70000)], array![]);
    report_at(setup, PLAYER(), time, array![(1, 1), (3, 1)], array![]);
    report_at(
        setup, PLAYER(), time, array![], array![(1, max), (4, max), (5, max), (6, max), (7, max)],
    );
    report_at(setup, PLAYER(), time, array![], array![(1, 1), (7, 1)]);
    let day = gems_of(setup).day_progress(PLAYER().into(), time / DAY);
    assert_eq!(day.games, 65535);
    assert_eq!(day.structures, 65535);
    assert_eq!(day.forests, 65535);
    assert_eq!(day.points, max);
    assert_eq!(gems_of(setup).week_progress(PLAYER().into(), 0), day);
    let account = gems_of(setup).account(PLAYER().into());
    assert_eq!(account.games, 65535);
    assert_eq!(account.forests, 65535);
    assert_eq!(account.wonders, 65535);
    assert_eq!(account.big, 65535);
    assert_eq!(account.high, 65535);
    assert_eq!(account.gems, 0);
    assert_eq!(account.credits, 0);
}

// Calendar (7.1)

#[test]
#[available_gas(l2_gas: 218453)]
fn test_gems_calendar_boundaries() {
    // [Info] A day is 00:00:00 to 23:59:59 UTC
    assert_eq!(86399_u64 / DAY, 0);
    assert_eq!(86400_u64 / DAY, 1);
    // [Info] Before Monday 1970-01-05 there is no week; that Monday starts week 0
    assert!(week_of(0).is_none());
    assert!(week_of(WEEK_START - 1).is_none());
    assert_eq!(week_of(WEEK_START), Option::Some(0));
    // [Info] Sunday 23:59:59 to Monday 00:00:00
    assert_eq!(week_of(WEEK_START + WEEK - 1), Option::Some(0));
    assert_eq!(week_of(WEEK_START + WEEK), Option::Some(1));
    // [Info] 2026-10-12 (Monday, day 20,738) starts its week
    assert_eq!(week_of(20738 * DAY), week_of(20738 * DAY + 6 * DAY + 86399));
    assert!(week_of(20738 * DAY) != week_of(20738 * DAY - 1));
}

/// `is_active` on the copied schedules of every fresh quest, for 9 consecutive days and 3 weeks:
/// Daily Run every day, one rotating quest of each family by day mod 3, the weeklies every week.
#[test]
#[available_gas(l2_gas: 128313728)]
fn test_gems_fresh_schedules_are_live_as_specified() {
    let setup = fresh_setup();
    let gems = gems_of(setup);
    let mut day: u64 = 100;
    while day < 109 {
        for (id, _, _, start, _, interval, _) in fresh_quests() {
            let entry = gems.quest_gems(id);
            if entry.kind == WEEKLY {
                continue;
            }
            let live = entry.is_active(entry.period_start(day));
            let expected = (day * DAY - start) % interval.into() < DAY;
            assert_eq!(live, expected);
            if id == 1 {
                assert!(live);
            }
        }
        // [Info] The rotation: quests 5 + r, 8 + r and 11 + r live when day % 3 == r
        let r: u32 = (day % 3).try_into().unwrap();
        for family in array![5_u32, 8, 11] {
            let entry = gems.quest_gems(family + r);
            assert!(entry.is_active(entry.period_start(day)));
        }
        day += 1;
    }
    let mut week: u64 = 0;
    while week < 3 {
        for id in array![14_u32, 15, 16] {
            let entry = gems.quest_gems(id);
            assert_eq!(entry.kind, WEEKLY);
            assert!(entry.is_active(entry.period_start(week)));
        }
        week += 1;
    }
}

#[test]
#[available_gas(l2_gas: 307251)]
fn test_gems_schedule_shapes() {
    let daily = QuestSchedule { start: 0, end: 0, duration: 86400, interval: 86400 };
    assert_eq!(schedule_kind(daily), DAILY);
    assert_eq!(schedule_kind(QuestSchedule { interval: 259200, start: 172800, ..daily }), DAILY);
    let weekly = QuestSchedule { start: 345600, end: 0, duration: 604800, interval: 604800 };
    assert_eq!(schedule_kind(weekly), WEEKLY);
    assert_eq!(schedule_kind(QuestSchedule { start: 345600 + 604800, ..weekly }), WEEKLY);
    // [Info] Neither: an end, a short day, an interval off the day, a week not from a Monday
    assert_eq!(schedule_kind(QuestSchedule { end: 864000, ..daily }), 0);
    assert_eq!(schedule_kind(QuestSchedule { duration: 3600, ..daily }), 0);
    assert_eq!(schedule_kind(QuestSchedule { interval: 90000, ..daily }), 0);
    assert_eq!(schedule_kind(QuestSchedule { start: 3600, ..daily }), 0);
    assert_eq!(schedule_kind(QuestSchedule { interval: 0, ..daily }), 0);
    assert_eq!(schedule_kind(QuestSchedule { start: 0, ..weekly }), 0);
    assert_eq!(schedule_kind(QuestSchedule { interval: 1209600, ..weekly }), 0);
}

// The owner's settings (3.2, 7.1)

#[test]
#[available_gas(l2_gas: 56984282)]
#[feature("safe_dispatcher")]
fn test_gems_set_quest_gems_lists_and_emits() {
    let setup = setup_alone();
    define_fresh(setup);
    let mut spy = spy_events();
    as_caller(setup, OWNER());
    gems_of(setup).set_quest_gems(6, 10);
    gems_of(setup).set_quest_gems(6, 12);
    gems_of(setup).set_quest_gems(14, 15);
    let entry = gems_of(setup).quest_gems(6);
    assert_eq!(
        entry,
        QuestGems { gems: 12, kind: DAILY, task: 2, total: 8, start: 86400, interval: 259200 },
    );
    assert_eq!(gems_of(setup).quest_gems(14).kind, WEEKLY);
    spy
        .assert_emitted(
            @array![
                (
                    setup,
                    Setup::Event::QuestGemsSet(
                        Setup::QuestGemsSet { quest_id: 6, gems: 10, kind: DAILY },
                    ),
                ),
                (
                    setup,
                    Setup::Event::QuestGemsSet(
                        Setup::QuestGemsSet { quest_id: 14, gems: 15, kind: WEEKLY },
                    ),
                ),
            ],
        );
    // [Info] 0 removes the gems and the list entry: a daily credit then finds no live quest
    gems_of(setup).set_quest_gems(6, 0);
    assert_eq!(gems_of(setup).quest_gems(6), Default::default());
    stop_cheat_caller_address(setup);
    paid_report(setup, PLAYER(), 13 * DAY, 8, 0, 0);
    as_caller(setup, PLAYER());
    assert_eq!(error_of(safe(setup).claim_daily_credit(13)), 'Setup: no live quest');
    assert_eq!(error_of(safe(setup).claim_quest(6, 13)), 'Setup: no gems');
}

#[test]
#[available_gas(l2_gas: 66722124)]
#[feature("safe_dispatcher")]
fn test_gems_set_quest_gems_refuses_every_bound() {
    let setup = setup_alone();
    define_fresh(setup);
    let admin = ISetupDispatcher { contract_address: setup };
    as_caller(setup, OWNER());
    let schedule = QuestSchedule { start: 0, end: 0, duration: 86400, interval: 86400 };
    // [Setup] Quests that cannot carry gems: two tasks, a task the ledger does not sum, an end,
    // an hourly window, and one retired; one with id 64
    admin
        .define_quest(
            20,
            schedule,
            array![QuestTask { task_id: 1, total: 1 }, QuestTask { task_id: 2, total: 1 }].span(),
            array![].span(),
        );
    admin
        .define_quest(
            21, schedule, array![QuestTask { task_id: 5, total: 1 }].span(), array![].span(),
        );
    admin
        .define_quest(
            22,
            QuestSchedule { end: 864000, ..schedule },
            array![QuestTask { task_id: 1, total: 1 }].span(),
            array![].span(),
        );
    admin
        .define_quest(
            23,
            QuestSchedule { duration: 3600, ..schedule },
            array![QuestTask { task_id: 1, total: 1 }].span(),
            array![].span(),
        );
    admin
        .define_quest(
            24, schedule, array![QuestTask { task_id: 1, total: 1 }].span(), array![].span(),
        );
    admin.retire_quest(24);
    admin
        .define_quest(
            64, schedule, array![QuestTask { task_id: 1, total: 1 }].span(), array![].span(),
        );
    let s = safe(setup);
    assert_eq!(error_of(s.set_quest_gems(1, 4)), 'Setup: invalid gems');
    assert_eq!(error_of(s.set_quest_gems(1, 16)), 'Setup: invalid gems');
    assert_eq!(error_of(s.set_quest_gems(0, 5)), 'Setup: invalid id');
    assert_eq!(error_of(s.set_quest_gems(64, 5)), 'Setup: invalid id');
    assert_eq!(error_of(s.set_quest_gems(2, 5)), 'Quest: does not exist');
    assert_eq!(error_of(s.set_quest_gems(20, 5)), 'Setup: not one task');
    assert_eq!(error_of(s.set_quest_gems(21, 5)), 'Setup: task not counted');
    assert_eq!(error_of(s.set_quest_gems(22, 5)), 'Setup: invalid schedule');
    assert_eq!(error_of(s.set_quest_gems(23, 5)), 'Setup: invalid schedule');
    assert_eq!(error_of(s.set_quest_gems(24, 5)), 'Setup: retired');
    // [Info] The bounds themselves are accepted
    s.set_quest_gems(1, 5).unwrap();
    s.set_quest_gems(1, 15).unwrap();
    stop_cheat_caller_address(setup);
    as_caller(setup, PLAYER());
    assert_eq!(error_of(s.set_quest_gems(1, 5)), 'Ownable: caller is not owner');
}

#[test]
#[available_gas(l2_gas: 59375525)]
#[feature("safe_dispatcher")]
fn test_gems_set_achievement_gems_refuses_every_bound() {
    let setup = setup_alone();
    define_fresh(setup);
    let admin = ISetupDispatcher { contract_address: setup };
    as_caller(setup, OWNER());
    let always = AchievementWindow { start: 0, end: 0 };
    admin
        .define_achievement(
            20,
            always,
            array![
                AchievementTask { task_id: 1, total: 1 }, AchievementTask { task_id: 4, total: 1 },
            ]
                .span(),
            10,
        );
    admin
        .define_achievement(
            21, always, array![AchievementTask { task_id: 1, total: 65536 }].span(), 10,
        );
    admin
        .define_achievement(
            22,
            AchievementWindow { start: 0, end: 864000 },
            array![AchievementTask { task_id: 1, total: 1 }].span(),
            10,
        );
    admin
        .define_achievement(
            23, always, array![AchievementTask { task_id: 2, total: 1 }].span(), 10,
        );
    admin
        .define_achievement(
            24, always, array![AchievementTask { task_id: 1, total: 65535 }].span(), 10,
        );
    admin.retire_achievement(3);
    let s = safe(setup);
    assert_eq!(error_of(s.set_achievement_gems(2, 9)), 'Setup: invalid gems');
    assert_eq!(error_of(s.set_achievement_gems(2, 91)), 'Setup: invalid gems');
    assert_eq!(error_of(s.set_achievement_gems(0, 10)), 'Setup: invalid id');
    assert_eq!(error_of(s.set_achievement_gems(64, 10)), 'Setup: invalid id');
    assert_eq!(error_of(s.set_achievement_gems(40, 10)), 'Achievement: does not exist');
    assert_eq!(error_of(s.set_achievement_gems(20, 10)), 'Setup: not one task');
    assert_eq!(error_of(s.set_achievement_gems(21, 10)), 'Setup: total too high');
    assert_eq!(error_of(s.set_achievement_gems(22, 10)), 'Setup: achievement windowed');
    assert_eq!(error_of(s.set_achievement_gems(23, 10)), 'Setup: task not counted');
    assert_eq!(error_of(s.set_achievement_gems(3, 20)), 'Setup: retired');
    // [Info] On the Podium (task 8) has no gems in v1: not counted on chain
    assert_eq!(error_of(s.set_achievement_gems(9, 50)), 'Setup: task not counted');
    // [Info] The bounds are accepted, and a total of 65,535
    s.set_achievement_gems(2, 10).unwrap();
    s.set_achievement_gems(2, 90).unwrap();
    s.set_achievement_gems(24, 10).unwrap();
    stop_cheat_caller_address(setup);
    as_caller(setup, PLAYER());
    assert_eq!(error_of(s.set_achievement_gems(2, 10)), 'Ownable: caller is not owner');
}

#[test]
#[available_gas(l2_gas: 45504048)]
fn test_gems_set_achievement_gems_copies_and_emits() {
    let setup = setup_alone();
    define_fresh(setup);
    let mut spy = spy_events();
    as_caller(setup, OWNER());
    gems_of(setup).set_achievement_gems(16, 80);
    assert_eq!(
        gems_of(setup).achievement_gems(16), AchievementGems { gems: 80, task: 1, total: 1000 },
    );
    spy
        .assert_emitted(
            @array![
                (
                    setup,
                    Setup::Event::AchievementGemsSet(
                        Setup::AchievementGemsSet { achievement_id: 16, gems: 80 },
                    ),
                ),
            ],
        );
    gems_of(setup).set_achievement_gems(16, 0);
    assert_eq!(gems_of(setup).achievement_gems(16), Default::default());
}

/// `retire_quest` and `retire_achievement` clear the gems in the same call (3.2): a retired quest
/// or achievement cannot be claimed, and leaves its kind's list.
#[test]
#[available_gas(l2_gas: 93813716)]
#[feature("safe_dispatcher")]
fn test_gems_retire_clears_the_gems() {
    let setup = fresh_setup();
    let admin = ISetupDispatcher { contract_address: setup };
    paid_report(setup, PLAYER(), 12 * DAY, 4, 2000, 2);
    let mut spy = spy_events();
    as_caller(setup, OWNER());
    admin.retire_quest(5);
    admin.retire_achievement(2);
    spy
        .assert_emitted(
            @array![
                (
                    setup,
                    Setup::Event::QuestGemsSet(
                        Setup::QuestGemsSet { quest_id: 5, gems: 0, kind: DAILY },
                    ),
                ),
                (
                    setup,
                    Setup::Event::AchievementGemsSet(
                        Setup::AchievementGemsSet { achievement_id: 2, gems: 0 },
                    ),
                ),
            ],
        );
    assert_eq!(gems_of(setup).quest_gems(5), Default::default());
    as_caller(setup, PLAYER());
    assert_eq!(error_of(safe(setup).claim_quest(5, 12)), 'Setup: no gems');
    assert_eq!(error_of(safe(setup).claim_achievement(2)), 'Setup: no gems');
    // [Info] Day 12's credit no longer needs quest 5: the three others are met
    safe(setup).claim_daily_credit(12).unwrap();
}

// Claims (3.3, 7.1)

#[test]
#[available_gas(l2_gas: 93104396)]
fn test_gems_claim_quest_credits_the_gems_once() {
    let setup = fresh_setup();
    // [Info] Day 13 (13 % 3 == 1): Public Works (6, 8 structures) is live
    paid_report(setup, PLAYER(), 13 * DAY + 10, 5, 100, 0);
    paid_report(setup, PLAYER(), 13 * DAY + 86399, 3, 100, 0);
    let mut spy = spy_events();
    as_caller(setup, PLAYER());
    gems_of(setup).claim_quest(6, 13);
    gems_of(setup).claim_quest(1, 13);
    let p: felt252 = PLAYER().into();
    spy
        .assert_emitted(
            @array![
                (
                    setup,
                    Setup::Event::GemsClaimed(
                        Setup::GemsClaimed {
                            player_id: p, kind: 1, id: 6, period: 13, gems: 10, balance: 10,
                        },
                    ),
                ),
                (
                    setup,
                    Setup::Event::GemsClaimed(
                        Setup::GemsClaimed {
                            player_id: p, kind: 1, id: 1, period: 13, gems: 5, balance: 15,
                        },
                    ),
                ),
            ],
        );
    assert_eq!(gems_of(setup).account(p).gems, 15);
    let day = gems_of(setup).day_progress(p, 13);
    assert_eq!(day.claimed, 0x40 + 0x2);
    assert_eq!(day.structures, 8);
}

#[test]
#[available_gas(l2_gas: 94558912)]
#[feature("safe_dispatcher")]
fn test_gems_claim_quest_refusals() {
    let setup = fresh_setup();
    // [Info] Day 13: Public Works needs 8 structures, 7 are reported
    paid_report(setup, PLAYER(), 13 * DAY, 7, 0, 0);
    as_caller(setup, PLAYER());
    let s = safe(setup);
    assert_eq!(error_of(s.claim_quest(6, 13)), 'Setup: not completed');
    // [Info] The wrong day of a rotating quest: Small Works (5) is live on days % 3 == 0
    assert_eq!(error_of(s.claim_quest(5, 13)), 'Setup: not live');
    // [Info] No gems: quests 2 to 4 are not defined
    assert_eq!(error_of(s.claim_quest(2, 13)), 'Setup: no gems');
    // [Info] A future period has an empty slot
    assert_eq!(error_of(s.claim_quest(1, 14)), 'Setup: not completed');
    // [Info] One more structure: completed
    stop_cheat_caller_address(setup);
    paid_report(setup, PLAYER(), 13 * DAY, 1, 0, 0);
    as_caller(setup, PLAYER());
    s.claim_quest(6, 13).unwrap();
}

/// A weekly quest is claimed for its week; a week before a quest's start is not live.
#[test]
#[available_gas(l2_gas: 102025894)]
#[feature("safe_dispatcher")]
fn test_gems_claim_weekly_quest() {
    let setup = fresh_setup();
    let admin = ISetupDispatcher { contract_address: setup };
    as_caller(setup, OWNER());
    // [Setup] A weekly quest from week 2 on
    admin
        .define_quest(
            30,
            QuestSchedule {
                start: WEEK_START + 2 * WEEK, end: 0, duration: 604800, interval: 604800,
            },
            array![QuestTask { task_id: 1, total: 1 }].span(),
            array![].span(),
        );
    gems_of(setup).set_quest_gems(30, 15);
    stop_cheat_caller_address(setup);
    // [Info] Week 1: 3 games of 2 forests, on Monday, Wednesday and Sunday
    let monday = WEEK_START + WEEK;
    paid_report(setup, PLAYER(), monday, 0, 0, 2);
    paid_report(setup, PLAYER(), monday + 2 * DAY, 0, 0, 2);
    paid_report(setup, PLAYER(), monday + 7 * DAY - 1, 0, 0, 1);
    as_caller(setup, PLAYER());
    let s = safe(setup);
    s.claim_quest(14, 1).unwrap();
    assert_eq!(error_of(s.claim_quest(14, 1)), 'Setup: claimed');
    assert_eq!(error_of(s.claim_quest(14, 0)), 'Setup: not completed');
    assert_eq!(error_of(s.claim_quest(30, 1)), 'Setup: not live');
    assert_eq!(gems_of(setup).account(PLAYER().into()).gems, 15);
    assert_eq!(gems_of(setup).week_progress(PLAYER().into(), 1).forests, 5);
}

/// Past periods have no deadline: day 13 is claimed on day 400.
#[test]
#[available_gas(l2_gas: 88631815)]
fn test_gems_claim_past_period_has_no_deadline() {
    let setup = fresh_setup();
    paid_report(setup, PLAYER(), 13 * DAY, 0, 0, 0);
    start_cheat_block_timestamp_global(400 * DAY);
    as_caller(setup, PLAYER());
    gems_of(setup).claim_quest(1, 13);
    assert_eq!(gems_of(setup).account(PLAYER().into()).gems, 5);
}

#[test]
#[available_gas(l2_gas: 107766653)]
#[feature("safe_dispatcher")]
fn test_gems_claim_achievement() {
    let setup = fresh_setup();
    as_caller(setup, PLAYER());
    let s = safe(setup);
    assert_eq!(error_of(s.claim_achievement(2)), 'Setup: not completed');
    // [Info] On the Podium has no gems
    assert_eq!(error_of(s.claim_achievement(9)), 'Setup: no gems');
    stop_cheat_caller_address(setup);
    let mut i: u32 = 0;
    while i < 10 {
        report_at(setup, PLAYER(), 20 * DAY, array![], array![(1, 1), (7, 1)]);
        i += 1;
    }
    as_caller(setup, PLAYER());
    let mut spy = spy_events();
    s.claim_achievement(2).unwrap();
    s.claim_achievement(3).unwrap();
    s.claim_achievement(8).unwrap();
    s.claim_achievement(13).unwrap();
    assert_eq!(error_of(s.claim_achievement(4)), 'Setup: not completed');
    assert_eq!(error_of(s.claim_achievement(14)), 'Setup: not completed');
    let account = gems_of(setup).account(PLAYER().into());
    assert_eq!(account.gems, 10 + 20 + 30 + 50);
    assert_eq!(account.achievements_claimed, 0x4 + 0x8 + 0x100 + 0x2000);
    spy
        .assert_emitted(
            @array![
                (
                    setup,
                    Setup::Event::GemsClaimed(
                        Setup::GemsClaimed {
                            player_id: PLAYER().into(),
                            kind: 2,
                            id: 13,
                            period: 0,
                            gems: 50,
                            balance: 110,
                        },
                    ),
                ),
            ],
        );
}

/// First Stone (task 10) through the tutorial claim (D-21): refused before `claim_tutorial`,
/// credited once after it.
#[test]
#[available_gas(l2_gas: 86619244)]
#[feature("safe_dispatcher")]
fn test_gems_first_stone_through_the_tutorial_claim() {
    let setup = fresh_setup();
    as_caller(setup, PLAYER());
    let s = safe(setup);
    assert_eq!(error_of(s.claim_achievement(1)), 'Setup: not completed');
    ISetupDispatcher { contract_address: setup }.claim_tutorial();
    s.claim_achievement(1).unwrap();
    assert_eq!(error_of(s.claim_achievement(1)), 'Setup: claimed');
    assert_eq!(gems_of(setup).account(PLAYER().into()).gems, 10);
}

// Credits (3.4, 7.1)

/// Completes the four dailies of `day` for `player` in one paid game: Daily Run and the three
/// rotating quests' hard targets (12 structures, 4 forests, 8,000 points).
fn complete_day(setup: ContractAddress, player: ContractAddress, day: u64) {
    paid_report(setup, player, day * DAY, 12, 8000, 4);
}

#[test]
#[available_gas(l2_gas: 108082474)]
#[feature("safe_dispatcher")]
fn test_gems_daily_credit_on_every_rotation() {
    let setup = fresh_setup();
    let mut r: u64 = 0;
    while r < 3 {
        let day = day_of_rotation(r);
        complete_day(setup, PLAYER(), day);
        as_caller(setup, PLAYER());
        let mut spy = spy_events();
        safe(setup).claim_daily_credit(day).unwrap();
        spy
            .assert_emitted(
                @array![
                    (
                        setup,
                        Setup::Event::CreditClaimed(
                            Setup::CreditClaimed {
                                player_id: PLAYER().into(),
                                kind: DAILY,
                                period: day,
                                credits: (r + 1).try_into().unwrap(),
                            },
                        ),
                    ),
                ],
            );
        assert_eq!(error_of(safe(setup).claim_daily_credit(day)), 'Setup: credit claimed');
        assert!(gems_of(setup).day_progress(PLAYER().into(), day).credit);
        stop_cheat_caller_address(setup);
        r += 1;
    }
    assert_eq!(gems_of(setup).account(PLAYER().into()).credits, 3);
    // [Info] The credit does not need the gem claims, nor the reverse
    as_caller(setup, PLAYER());
    gems_of(setup).claim_quest(1, day_of_rotation(0));
}

/// Each live daily missing by one count fails the day's credit: Daily Run (no game cannot be),
/// so the three rotating quests of day 14 (% 3 == 2: 7, 10, 13), one player each.
#[test]
#[available_gas(l2_gas: 104633455)]
#[feature("safe_dispatcher")]
fn test_gems_daily_credit_missing_one_quest_by_one() {
    let setup = fresh_setup();
    let day = day_of_rotation(2);
    let players = array![PLAYER(), ANYONE(), OWNER()];
    paid_report(setup, PLAYER(), day * DAY, 11, 8000, 4);
    paid_report(setup, ANYONE(), day * DAY, 12, 8000, 3);
    paid_report(setup, OWNER(), day * DAY, 12, 7999, 4);
    for player in players {
        as_caller(setup, player);
        assert_eq!(error_of(safe(setup).claim_daily_credit(day)), 'Setup: not completed');
        stop_cheat_caller_address(setup);
    }
    // [Info] A day with no game: Daily Run is not met
    as_caller(setup, PLAYER());
    assert_eq!(error_of(safe(setup).claim_daily_credit(day + 1)), 'Setup: not completed');
}

/// A day with no live daily (no daily quest has gems) gives no credit.
#[test]
#[available_gas(l2_gas: 50312722)]
#[feature("safe_dispatcher")]
fn test_gems_daily_credit_needs_a_live_quest() {
    let setup = setup_alone();
    define_fresh(setup);
    paid_report(setup, PLAYER(), 12 * DAY, 12, 8000, 4);
    as_caller(setup, PLAYER());
    assert_eq!(error_of(safe(setup).claim_daily_credit(12)), 'Setup: no live quest');
    assert_eq!(error_of(safe(setup).claim_weekly_credit(1)), 'Setup: no live quest');
}

#[test]
#[available_gas(l2_gas: 107216267)]
#[feature("safe_dispatcher")]
fn test_gems_weekly_credit() {
    let setup = fresh_setup();
    let monday = WEEK_START + 2 * WEEK;
    // [Info] Week 2: 5 forests, 30 structures, 20,000 points over three games
    paid_report(setup, PLAYER(), monday, 10, 8000, 2);
    paid_report(setup, PLAYER(), monday + 3 * DAY, 10, 8000, 2);
    paid_report(setup, PLAYER(), monday + 6 * DAY, 9, 3999, 1);
    as_caller(setup, PLAYER());
    // [Info] One structure and one point short
    assert_eq!(error_of(safe(setup).claim_weekly_credit(2)), 'Setup: not completed');
    stop_cheat_caller_address(setup);
    paid_report(setup, PLAYER(), monday + 6 * DAY + 86399, 1, 0, 0);
    as_caller(setup, PLAYER());
    assert_eq!(error_of(safe(setup).claim_weekly_credit(2)), 'Setup: not completed');
    stop_cheat_caller_address(setup);
    paid_report(setup, PLAYER(), monday + 6 * DAY, 0, 1, 0);
    as_caller(setup, PLAYER());
    let mut spy = spy_events();
    safe(setup).claim_weekly_credit(2).unwrap();
    spy
        .assert_emitted(
            @array![
                (
                    setup,
                    Setup::Event::CreditClaimed(
                        Setup::CreditClaimed {
                            player_id: PLAYER().into(), kind: WEEKLY, period: 2, credits: 1,
                        },
                    ),
                ),
            ],
        );
    assert_eq!(error_of(safe(setup).claim_weekly_credit(2)), 'Setup: credit claimed');
    // [Info] The next Monday is week 3: nothing there
    assert_eq!(error_of(safe(setup).claim_weekly_credit(3)), 'Setup: not completed');
}

// The audit properties (7.5)

/// A1: gems grow only by a claim, by the amount the owner set, from a met target; a report adds
/// none, whatever it reports.
#[test]
#[available_gas(l2_gas: 92386381)]
fn test_gems_A1_no_gem_minted_outside_a_claim() {
    let setup = fresh_setup();
    complete_day(setup, PLAYER(), 14);
    report_at(
        setup,
        PLAYER(),
        14 * DAY,
        array![],
        array![(1, 1000), (4, 100), (5, 100), (6, 100), (7, 100)],
    );
    assert_eq!(gems_of(setup).account(PLAYER().into()).gems, 0);
    as_caller(setup, PLAYER());
    gems_of(setup).claim_quest(7, 14);
    assert_eq!(gems_of(setup).account(PLAYER().into()).gems, 15);
    gems_of(setup).claim_achievement(16);
    assert_eq!(gems_of(setup).account(PLAYER().into()).gems, 95);
}

/// A2: each claim sets its bit in the write that credits it, once per (player, quest, period),
/// (player, achievement), and the credit per (player, day) and (player, week); no path clears a
/// bit. Another period, or another player, has its own bit.
#[test]
#[available_gas(l2_gas: 119187281)]
#[feature("safe_dispatcher")]
fn test_gems_A2_no_double_claim() {
    let setup = fresh_setup();
    complete_day(setup, PLAYER(), 12);
    complete_day(setup, PLAYER(), 15);
    complete_day(setup, ANYONE(), 12);
    paid_report(setup, PLAYER(), WEEK_START + WEEK, 30, 20000, 5);
    as_caller(setup, PLAYER());
    let s = safe(setup);
    s.claim_quest(1, 12).unwrap();
    assert_eq!(error_of(s.claim_quest(1, 12)), 'Setup: claimed');
    s.claim_quest(1, 15).unwrap();
    s.claim_achievement(2).unwrap();
    assert_eq!(error_of(s.claim_achievement(2)), 'Setup: claimed');
    s.claim_daily_credit(12).unwrap();
    assert_eq!(error_of(s.claim_daily_credit(12)), 'Setup: credit claimed');
    s.claim_weekly_credit(1).unwrap();
    assert_eq!(error_of(s.claim_weekly_credit(1)), 'Setup: credit claimed');
    s.claim_quest(16, 1).unwrap();
    assert_eq!(error_of(s.claim_quest(16, 1)), 'Setup: claimed');
    // [Info] A later report of the same day keeps the bits
    stop_cheat_caller_address(setup);
    complete_day(setup, PLAYER(), 12);
    as_caller(setup, PLAYER());
    assert_eq!(error_of(s.claim_quest(1, 12)), 'Setup: claimed');
    assert_eq!(error_of(s.claim_daily_credit(12)), 'Setup: credit claimed');
    stop_cheat_caller_address(setup);
    // [Info] Another player's bits are their own
    as_caller(setup, ANYONE());
    s.claim_quest(1, 12).unwrap();
    s.claim_daily_credit(12).unwrap();
    let account = gems_of(setup).account(PLAYER().into());
    assert_eq!(account.gems, 5 + 5 + 10 + 15);
    assert_eq!(account.credits, 2);
}

/// A3: no entry point acts for another address. A claim is the caller's, from the caller's
/// ledger: a player cannot claim from another's progress, and a claim moves nothing between
/// accounts.
#[test]
#[available_gas(l2_gas: 94781702)]
#[feature("safe_dispatcher")]
fn test_gems_A3_no_transfer_path() {
    let setup = fresh_setup();
    complete_day(setup, PLAYER(), 12);
    as_caller(setup, ANYONE());
    let s = safe(setup);
    assert_eq!(error_of(s.claim_quest(1, 12)), 'Setup: not completed');
    assert_eq!(error_of(s.claim_daily_credit(12)), 'Setup: not completed');
    assert_eq!(error_of(s.claim_achievement(2)), 'Setup: not completed');
    stop_cheat_caller_address(setup);
    as_caller(setup, PLAYER());
    s.claim_quest(1, 12).unwrap();
    s.claim_daily_credit(12).unwrap();
    assert_eq!(gems_of(setup).account(ANYONE().into()), Default::default());
    assert_eq!(gems_of(setup).account(PLAYER().into()).gems, 5);
    assert_eq!(gems_of(setup).account(PLAYER().into()).credits, 1);
}

/// A5: a credit falls only in `spend_credit`, by one, when positive, from an allowlisted reporter;
/// it is earned only by a credit claim, once per period.
#[test]
#[available_gas(l2_gas: 100870883)]
#[feature("safe_dispatcher")]
fn test_gems_A5_a_credit_is_spent_once() {
    let setup = fresh_setup();
    let p: felt252 = PLAYER().into();
    as_caller(setup, REPORTER());
    assert_eq!(error_of(safe(setup).spend_credit(p, 1)), 'Setup: no credit');
    stop_cheat_caller_address(setup);
    complete_day(setup, PLAYER(), 12);
    as_caller(setup, PLAYER());
    gems_of(setup).claim_daily_credit(12);
    // [Info] The player cannot spend it directly
    assert_eq!(error_of(safe(setup).spend_credit(p, 1)), 'Quest: not reporter');
    stop_cheat_caller_address(setup);
    let mut spy = spy_events();
    as_caller(setup, REPORTER());
    gems_of(setup).spend_credit(p, 7);
    spy
        .assert_emitted(
            @array![
                (
                    setup,
                    Setup::Event::CreditSpent(
                        Setup::CreditSpent { player_id: p, game_id: 7, credits: 0 },
                    ),
                ),
            ],
        );
    assert_eq!(error_of(safe(setup).spend_credit(p, 8)), 'Setup: no credit');
    assert_eq!(gems_of(setup).account(p).credits, 0);
    // [Info] A revoked reporter spends nothing
    stop_cheat_caller_address(setup);
    complete_day(setup, PLAYER(), 15);
    as_caller(setup, PLAYER());
    gems_of(setup).claim_daily_credit(15);
    as_caller(setup, OWNER());
    ISetupDispatcher { contract_address: setup }.set_reporter(REPORTER(), false);
    as_caller(setup, REPORTER());
    assert_eq!(error_of(safe(setup).spend_credit(p, 9)), 'Quest: not reporter');
    assert_eq!(gems_of(setup).account(p).credits, 1);
}

/// A6: every setter is the owner's; `report` and `spend_credit` are an allowlisted reporter's,
/// and the allowlist is the owner's. The residual trust: a reporter can report any progress for
/// any player, so any claimable gems and credits (`report` below, for `ANYONE`).
#[test]
#[available_gas(l2_gas: 93003654)]
#[feature("safe_dispatcher")]
fn test_gems_A6_access() {
    let setup = fresh_setup();
    let s = safe(setup);
    let admin = paved::systems::setup::ISetupSafeDispatcher { contract_address: setup };
    as_caller(setup, PLAYER());
    assert_eq!(error_of(s.set_quest_gems(1, 5)), 'Ownable: caller is not owner');
    assert_eq!(error_of(s.set_achievement_gems(2, 10)), 'Ownable: caller is not owner');
    assert_eq!(error_of(admin.set_reporter(PLAYER(), true)), 'Ownable: caller is not owner');
    assert_eq!(error_of(admin.retire_quest(1)), 'Ownable: caller is not owner');
    assert_eq!(
        error_of(admin.report(PLAYER().into(), array![].span(), array![].span())),
        'Quest: not reporter',
    );
    assert_eq!(error_of(s.spend_credit(PLAYER().into(), 1)), 'Quest: not reporter');
    stop_cheat_caller_address(setup);
    // [Info] The owner is not a reporter either
    as_caller(setup, OWNER());
    assert_eq!(error_of(s.spend_credit(PLAYER().into(), 1)), 'Quest: not reporter');
    stop_cheat_caller_address(setup);
    complete_day(setup, ANYONE(), 12);
    assert_eq!(gems_of(setup).day_progress(ANYONE().into(), 12).structures, 12);
}

// The report (1.2, 7.2)

/// A paid report writes the day, the week and the account; a report with no quest entries (a free
/// game's) writes the account only; before week 0 there is no week.
#[test]
#[available_gas(l2_gas: 14711156)]
fn test_gems_report_writes_the_ledger() {
    let setup = setup_alone();
    let p: felt252 = PLAYER().into();
    let time = WEEK_START + 3 * WEEK + 2 * DAY + 5;
    paid_report(setup, PLAYER(), time, 3, 1200, 2);
    let day = gems_of(setup).day_progress(p, time / DAY);
    assert_eq!(
        day,
        Progress { games: 1, structures: 3, forests: 2, points: 1200, claimed: 0, credit: false },
    );
    assert_eq!(gems_of(setup).week_progress(p, 3), day);
    let account = gems_of(setup).account(p);
    assert_eq!(account.games, 1);
    assert_eq!(account.forests, 2);
    // [Info] A free game's report: achievements only
    report_at(setup, PLAYER(), time, array![], array![(1, 1), (5, 1), (6, 2), (7, 1)]);
    assert_eq!(gems_of(setup).day_progress(p, time / DAY), day);
    assert_eq!(gems_of(setup).week_progress(p, 3), day);
    let account = gems_of(setup).account(p);
    assert_eq!(
        account,
        Account {
            gems: 0,
            credits: 0,
            games: 2,
            forests: 2,
            wonders: 1,
            big: 2,
            high: 1,
            achievements_claimed: 0,
        },
    );
    // [Info] Day 1, before week 0: the day only
    paid_report(setup, ANYONE(), DAY, 1, 1, 1);
    assert_eq!(gems_of(setup).day_progress(ANYONE().into(), 1).games, 1);
    assert_eq!(gems_of(setup).week_progress(ANYONE().into(), 0), Default::default());
}

// Fuzz (7.4)

/// A small generator (a 64-bit LCG): the next state, and a value below `bound`.
fn next(ref state: u64, bound: u64) -> u64 {
    let wide: u128 = state.into() * 6364136223846793005 + 1442695040888963407;
    state = (wide % 0x10000000000000000).try_into().unwrap();
    (state / 65536) % bound
}

/// The sum the ledger should hold, from the test's own tally: `sums` keys a period's task as
/// `period * 8 + task` (weeks from 1,000,000).
fn sum_of(ref sums: Felt252Dict<u32>, key: u64) -> u32 {
    sums.get(key.into())
}

fn add_to(ref sums: Felt252Dict<u32>, key: u64, by: u32) {
    let k: felt252 = key.into();
    sums.insert(k, sums.get(k) + by);
}

const WEEKS: u64 = 1000000;

/// The ledger (7.4): random paid reports at random block times over two weeks (days 11 to 24),
/// then every claim the ledger could allow, each twice. A claim succeeds exactly when the test's
/// own sums meet the target in a live period, never twice, and the gems and credits credited are
/// exactly the sum of those claims (A1, A2).
#[test]
#[available_gas(l2_gas: 383137644)]
#[fuzzer(runs: 12, seed: 61)]
#[feature("safe_dispatcher")]
fn test_gems_fuzz_ledger(seed: u64) {
    let setup = fresh_setup();
    let mut state = seed;
    let mut sums: Felt252Dict<u32> = Default::default();
    let mut games: u32 = 0;
    let mut forests: u32 = 0;
    let mut high: u32 = 0;
    let first_day: u64 = 11;
    let days: u64 = 14;
    // [Setup] Up to 12 reports
    let reports = 1 + next(ref state, 12);
    let mut n = 0;
    while n < reports {
        let time = first_day * DAY + next(ref state, days * DAY);
        let structures: u32 = next(ref state, 13).try_into().unwrap();
        let points: u32 = next(ref state, 9000).try_into().unwrap();
        let wood: u32 = next(ref state, 5).try_into().unwrap();
        let top: u32 = next(ref state, 2).try_into().unwrap();
        report_at(
            setup,
            PLAYER(),
            time,
            array![(1, 1), (2, structures), (3, points), (4, wood)],
            array![(1, 1), (4, wood), (7, top)],
        );
        let day = time / DAY;
        let week = WEEKS + week_of(time).unwrap();
        for (task, count) in array![(1_u64, 1_u32), (2, structures), (3, points), (4, wood)] {
            add_to(ref sums, day * 8 + task, count);
            add_to(ref sums, week * 8 + task, count);
        }
        games += 1;
        forests += wood;
        high += top;
        n += 1;
    }
    // [Check] Every quest claim of every period, twice; every credit, twice
    let s = safe(setup);
    let gems = gems_of(setup);
    as_caller(setup, PLAYER());
    let mut expected_gems: u64 = 0;
    let mut expected_credits: u16 = 0;
    let mut day = first_day;
    while day < first_day + days {
        let mut all = true;
        for (id, task, total, _, _, _, amount) in fresh_quests() {
            let entry = gems.quest_gems(id);
            if entry.kind != DAILY {
                continue;
            }
            let live = entry.is_active(entry.period_start(day));
            let met = sum_of(ref sums, day * 8 + task.into()) >= total;
            let result = s.claim_quest(id, day);
            if live && met {
                assert!(result.is_ok());
                expected_gems += amount.into();
                assert_eq!(error_of(s.claim_quest(id, day)), 'Setup: claimed');
            } else {
                assert!(result.is_err());
            }
            if live && !met {
                all = false;
            }
        }
        let result = s.claim_daily_credit(day);
        assert_eq!(result.is_ok(), all);
        if all {
            expected_credits += 1;
            assert!(s.claim_daily_credit(day).is_err());
        }
        day += 1;
    }
    let mut week: u64 = 1;
    while week < 4 {
        let mut all = true;
        for (id, task, total, _, _, _, amount) in fresh_quests() {
            if gems.quest_gems(id).kind != WEEKLY {
                continue;
            }
            let met = sum_of(ref sums, (WEEKS + week) * 8 + task.into()) >= total;
            assert_eq!(s.claim_quest(id, week).is_ok(), met);
            if met {
                expected_gems += amount.into();
                assert!(s.claim_quest(id, week).is_err());
            } else {
                all = false;
            }
        }
        assert_eq!(s.claim_weekly_credit(week).is_ok(), all);
        if all {
            expected_credits += 1;
        }
        week += 1;
    }
    // [Check] The achievements counted on chain, from the lifetime counts
    for (id, task, total, points) in fresh_achievements() {
        if id == 1 || id == 9 {
            continue;
        }
        let count = match task {
            1 => games,
            4 => forests,
            7 => high,
            _ => 0,
        };
        let met = count >= total;
        assert_eq!(s.claim_achievement(id).is_ok(), met);
        if met {
            expected_gems += points.into();
            assert!(s.claim_achievement(id).is_err());
        }
    }
    let account = gems.account(PLAYER().into());
    assert_eq!(account.gems, expected_gems);
    assert_eq!(account.credits, expected_credits);
    assert_eq!(account.games.into(), games);
}
