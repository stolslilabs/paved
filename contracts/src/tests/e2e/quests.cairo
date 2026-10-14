//! Quests and achievements (P7, `docs/architecture/quests.md`): the owner-only definitions, the
//! accepted list, and the report a game over makes, with the `GameOver` it must never prevent.
//! Since D-20 nothing is ranked on chain and task 9 (`WIN`) is never reported. Since D-24 the
//! definitions and the progress are `Setup`'s: `Daily` emits `GameOver`, then reports to `Setup`,
//! which emits the progress (`e2e/setup_system.cairo` tests `Setup` alone).

use paved::constants;
use paved::events::game_over;
use paved::models::game::{GameImpl, GameTrait};
use paved::models::tile::CENTER;
use paved::systems::challenge::Challenge;
use paved::systems::setup::{ISetupDispatcher, ISetupDispatcherTrait, Setup};
use paved::tests::setup::setup;
use paved::tests::setup::setup::{IChallengeDispatcherTrait, OWNER, PLAYER, TestStoreTrait};
use paved::types::mode::Mode;
use paved::types::orientation::Orientation;
use paved::types::plan::Plan;
use quiver_achievement::component::AchievementComponent;
use quiver_achievement::events::index::{AchievementDefined, AchievementProgressed};
use quiver_achievement::types::task::AchievementTask;
use quiver_achievement::types::window::AchievementWindow;
use quiver_quest::component::QuestComponent;
use quiver_quest::events::index::{QuestDefined, QuestProgressed};
use quiver_quest::types::schedule::QuestSchedule;
use quiver_quest::types::task::QuestTask;
use snforge_std::{
    EventSpyAssertionsTrait, EventSpyTrait, load, map_entry_address, spy_events,
    start_cheat_block_timestamp_global, start_cheat_caller_address, stop_cheat_caller_address,
};
use starknet::ContractAddress;

const DAY: u32 = 86400;

fn quest_event(event: QuestComponent::Event) -> Setup::Event {
    Setup::Event::QuestEvent(event)
}

fn achievement_event(event: AchievementComponent::Event) -> Setup::Event {
    Setup::Event::AchievementEvent(event)
}

fn quest_progressed(player_id: felt252, task_id: u32, count: u32) -> Setup::Event {
    quest_event(
        QuestComponent::Event::QuestProgressed(QuestProgressed { player_id, task_id, count }),
    )
}

fn achievement_progressed(player_id: felt252, task_id: u32, count: u32) -> Setup::Event {
    achievement_event(
        AchievementComponent::Event::AchievementProgressed(
            AchievementProgressed { player_id, task_id, count },
        ),
    )
}

fn daily_quest(id_task: u32, total: u32) -> (QuestSchedule, Array<QuestTask>) {
    (
        QuestSchedule { start: 0, end: 0, duration: DAY, interval: DAY },
        array![QuestTask { task_id: id_task, total }],
    )
}

/// Defines the accepted list (P-22) on `Setup`: 4 daily quests and 9 achievements, as the owner.
pub fn define_accepted_list(setup_address: ContractAddress) {
    let admin = ISetupDispatcher { contract_address: setup_address };
    start_cheat_caller_address(setup_address, OWNER());
    let (schedule, tasks) = daily_quest(constants::TASK_GAME_FINISHED, 1);
    admin.define_quest(1, schedule, tasks.span(), array![].span());
    let (schedule, tasks) = daily_quest(constants::TASK_STRUCTURE_SCORED, 6);
    admin.define_quest(2, schedule, tasks.span(), array![].span());
    let (schedule, tasks) = daily_quest(constants::TASK_FOREST_SCORED, 1);
    admin.define_quest(3, schedule, tasks.span(), array![].span());
    let (schedule, tasks) = daily_quest(constants::TASK_POINTS, 3000);
    admin.define_quest(4, schedule, tasks.span(), array![].span());
    let window = AchievementWindow { start: 0, end: 0 };
    let list = array![
        (1_u32, constants::TASK_TUTORIAL_FINISHED, 1_u32, 10_u16),
        (2, constants::TASK_GAME_FINISHED, 1, 10), (3, constants::TASK_GAME_FINISHED, 10, 20),
        (4, constants::TASK_GAME_FINISHED, 50, 40), (5, constants::TASK_BIG_STRUCTURE, 1, 20),
        (6, constants::TASK_FOREST_SCORED, 10, 20), (7, constants::TASK_WONDER_SCORED, 1, 30),
        (8, constants::TASK_HIGH_SCORE, 1, 30), (9, constants::TASK_PODIUM, 1, 50),
    ];
    let mut list = list.span();
    while let Option::Some((id, task_id, total, points)) = list.pop_front() {
        admin
            .define_achievement(
                *id,
                window,
                array![AchievementTask { task_id: *task_id, total: *total }].span(),
                *points,
            );
    }
    stop_cheat_caller_address(setup_address);
}

/// The definitions are in `Setup`'s own storage, at the addresses the components give
/// (`Quest_definitions`, `Achievement_definitions`): the layout pin of the quiver components.
#[test]
#[available_gas(l2_gas: 71506506)]
fn test_quests_definitions_live_in_setups_storage() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let setup_address = systems.setup.contract_address;
    let quest = map_entry_address(selector!("Quest_definitions"), array![1].span());
    let achievement = map_entry_address(selector!("Achievement_definitions"), array![9].span());
    assert(*load(setup_address, quest, 1).at(0) == 0, 'Quests: stored before');
    assert(*load(setup_address, achievement, 1).at(0) == 0, 'Achievements: stored before');
    define_accepted_list(setup_address);
    assert(*load(setup_address, quest, 1).at(0) != 0, 'Quests: not in setup');
    assert(*load(setup_address, achievement, 1).at(0) != 0, 'Achievements: not in setup');
}

#[test]
#[available_gas(l2_gas: 72987111)]
fn test_quests_owner_defines_the_accepted_list() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let setup_address = systems.setup.contract_address;
    let mut spy = spy_events();
    define_accepted_list(setup_address);

    // [Assert] The indexer reads them from events
    let (schedule, tasks) = daily_quest(constants::TASK_GAME_FINISHED, 1);
    let defined = quest_event(
        QuestComponent::Event::QuestDefined(
            QuestDefined {
                quest_id: 1, schedule, tasks: tasks.span(), conditions: array![].span(),
            },
        ),
    );
    let defined_achievement = achievement_event(
        AchievementComponent::Event::AchievementDefined(
            AchievementDefined {
                achievement_id: 9,
                window: AchievementWindow { start: 0, end: 0 },
                tasks: array![AchievementTask { task_id: constants::TASK_PODIUM, total: 1 }].span(),
                points: 50,
            },
        ),
    );
    spy.assert_emitted(@array![(setup_address, defined), (setup_address, defined_achievement)]);
}

#[test]
#[available_gas(l2_gas: 54705509)]
#[should_panic(expected: 'Ownable: caller is not owner')]
fn test_quests_define_quest_not_owner() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let admin = ISetupDispatcher { contract_address: systems.setup.contract_address };
    start_cheat_caller_address(systems.setup.contract_address, PLAYER());
    let (schedule, tasks) = daily_quest(constants::TASK_GAME_FINISHED, 1);
    admin.define_quest(1, schedule, tasks.span(), array![].span());
}

#[test]
#[available_gas(l2_gas: 54570846)]
#[should_panic(expected: 'Ownable: caller is not owner')]
fn test_quests_define_achievement_not_owner() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let admin = ISetupDispatcher { contract_address: systems.setup.contract_address };
    start_cheat_caller_address(systems.setup.contract_address, PLAYER());
    admin
        .define_achievement(
            1,
            AchievementWindow { start: 0, end: 0 },
            array![AchievementTask { task_id: 1, total: 1 }].span(),
            10,
        );
}

#[test]
#[available_gas(l2_gas: 56473478)]
#[should_panic(expected: 'Ownable: caller is not owner')]
fn test_quests_retire_quest_not_owner() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let setup_address = systems.setup.contract_address;
    let admin = ISetupDispatcher { contract_address: setup_address };
    start_cheat_caller_address(setup_address, OWNER());
    let (schedule, tasks) = daily_quest(constants::TASK_GAME_FINISHED, 1);
    admin.define_quest(1, schedule, tasks.span(), array![].span());
    start_cheat_caller_address(setup_address, PLAYER());
    admin.retire_quest(1);
}

#[test]
#[available_gas(l2_gas: 54368133)]
#[should_panic(expected: 'Ownable: caller is not owner')]
fn test_quests_retire_achievement_not_owner() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let admin = ISetupDispatcher { contract_address: systems.setup.contract_address };
    start_cheat_caller_address(systems.setup.contract_address, PLAYER());
    admin.retire_achievement(1);
}

#[test]
#[available_gas(l2_gas: 72374321)]
fn test_quests_owner_retires() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let setup_address = systems.setup.contract_address;
    let admin = ISetupDispatcher { contract_address: setup_address };
    define_accepted_list(setup_address);
    start_cheat_caller_address(setup_address, OWNER());
    admin.retire_quest(1);
    admin.retire_achievement(9);
}

/// A recurring quest rolls over at 00:00 UTC only when its start is a multiple of a day (Q-6), the
/// hour where the day id (`day::day_id`) rolls over.
#[test]
#[available_gas(l2_gas: 54704249)]
#[should_panic(expected: 'Setup: quest not on UTC day')]
fn test_quests_define_quest_misaligned() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let setup_address = systems.setup.contract_address;
    let admin = ISetupDispatcher { contract_address: setup_address };
    start_cheat_caller_address(setup_address, OWNER());
    let schedule = QuestSchedule { start: 3600, end: 0, duration: DAY, interval: DAY };
    admin
        .define_quest(
            1, schedule, array![QuestTask { task_id: 1, total: 1 }].span(), array![].span(),
        );
}

/// A definition is created once.
#[test]
#[available_gas(l2_gas: 72247386)]
#[should_panic(expected: 'Quest: already defined')]
fn test_quests_define_twice() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let setup_address = systems.setup.contract_address;
    define_accepted_list(setup_address);
    let admin = ISetupDispatcher { contract_address: setup_address };
    start_cheat_caller_address(setup_address, OWNER());
    let (schedule, tasks) = daily_quest(constants::TASK_GAME_FINISHED, 1);
    admin.define_quest(1, schedule, tasks.span(), array![].span());
}

/// A game over with nothing scored reports the finished game only, after `GameOver`.
#[test]
#[available_gas(l2_gas: 103362173)]
fn test_quests_game_over_every_count_zero() {
    let (store, systems, context) = setup::spawn_game(Mode::Challenge);
    let challenge = systems.challenge.contract_address;
    let setup_address = systems.setup.contract_address;
    define_accepted_list(setup_address);
    let mut spy = spy_events();
    systems.challenge.surrender(context.game_id);

    let game = store.game(context.game_id);
    assert(game.is_over(), 'Quests: game over');
    assert(game.score == 0 && game.counts == 0, 'Quests: counters');
    let p = context.player_id;
    assert_order(kinds(@spy.get_events().events, challenge, setup_address), 1, 1);
    spy.assert_emitted(@array![(challenge, Challenge::Event::PavedEvent(game_over(game, p)))]);
    spy
        .assert_emitted(
            @array![
                (setup_address, quest_progressed(p, constants::TASK_GAME_FINISHED, 1)),
                (setup_address, achievement_progressed(p, constants::TASK_GAME_FINISHED, 1)),
            ],
        );
}

/// A game over with every counter at the maximum of its width and a score above the high score,
/// the first game of its day (rank 1 before D-20): the largest lists (4 and 5 entries), after
/// `GameOver`, and no task 9.
#[test]
#[available_gas(l2_gas: 111479609)]
fn test_quests_game_over_every_counter_at_maximum() {
    // [Setup] Not day 0, whose day id is the unset id 0
    start_cheat_block_timestamp_global(10 * 86400);
    let (store, systems, context) = setup::spawn_game(Mode::Challenge);
    let challenge = systems.challenge.contract_address;
    let setup_address = systems.setup.contract_address;
    define_accepted_list(setup_address);
    let mut game = store.game(context.game_id);
    game.score = 0xffffffff;
    game
        .counts =
            GameImpl::counts_of(
                constants::MAX_STRUCTURES,
                constants::MAX_FORESTS,
                constants::MAX_WONDERS,
                constants::MAX_BIG,
            );
    store.set_game(game);

    let mut spy = spy_events();
    systems.challenge.surrender(context.game_id);

    // [Assert] Game over, in its day
    let game = store.game(context.game_id);
    assert(game.is_over(), 'Quests: game over');
    assert(game.day_id != 0, 'Quests: day set');
    // [Assert] Order: `GameOver` from `Daily` before the first quiver event from `Setup`, the
    // quests before the achievements
    assert_order(kinds(@spy.get_events().events, challenge, setup_address), 4, 5);
    // [Assert] The report: tasks 1 to 4 to the quests, 1 and 4 to 7 to the achievements, after
    // `GameOver`; no task 9 (D-20)
    let p = context.player_id;
    spy.assert_emitted(@array![(challenge, Challenge::Event::PavedEvent(game_over(game, p)))]);
    spy
        .assert_emitted(
            @array![
                (setup_address, quest_progressed(p, constants::TASK_GAME_FINISHED, 1)),
                (setup_address, quest_progressed(p, constants::TASK_STRUCTURE_SCORED, 127)),
                (setup_address, quest_progressed(p, constants::TASK_POINTS, 0xffffffff)),
                (setup_address, quest_progressed(p, constants::TASK_FOREST_SCORED, 63)),
                (setup_address, achievement_progressed(p, constants::TASK_GAME_FINISHED, 1)),
                (setup_address, achievement_progressed(p, constants::TASK_FOREST_SCORED, 63)),
                (setup_address, achievement_progressed(p, constants::TASK_WONDER_SCORED, 15)),
                (setup_address, achievement_progressed(p, constants::TASK_BIG_STRUCTURE, 63)),
                (setup_address, achievement_progressed(p, constants::TASK_HIGH_SCORE, 1)),
            ],
        );
    spy
        .assert_not_emitted(
            @array![(setup_address, achievement_progressed(p, constants::TASK_WIN, 1))],
        );
}

/// A game over after its day closed gets no day id but still reports (Q-6): no WIN.
#[test]
#[available_gas(l2_gas: 87706801)]
fn test_quests_game_over_after_its_day_reports_without_win() {
    let (store, systems, context) = setup::spawn_game(Mode::Challenge);
    let setup_address = systems.setup.contract_address;
    let mut game = store.game(context.game_id);
    game.score = 5000;
    store.set_game(game);
    start_cheat_block_timestamp_global(game.start_time + constants::CHALLENGE_DURATION + 1);
    let mut spy = spy_events();
    systems.challenge.surrender(context.game_id);
    assert(store.game(context.game_id).day_id == 0, 'Quests: day set');
    let p = context.player_id;
    spy
        .assert_emitted(
            @array![
                (setup_address, quest_progressed(p, constants::TASK_POINTS, 5000)),
                (setup_address, achievement_progressed(p, constants::TASK_HIGH_SCORE, 1)),
            ],
        );
    spy
        .assert_not_emitted(
            @array![(setup_address, achievement_progressed(p, constants::TASK_WIN, 1))],
        );
}

/// D-20: a game over no longer reports task 9. The first game of an empty day, with a score
/// (rank 1 before D-20, which reported `WIN`), surrenders: `GameOver`, then exactly the entries
/// it reported before less task 9 (quests 1 and 3, achievements 1 and 7), and no `WIN`.
#[test]
#[available_gas(l2_gas: 90351887)]
fn test_quests_game_over_first_of_its_day_reports_no_task_9() {
    start_cheat_block_timestamp_global(10 * 86400);
    let (store, systems, context) = setup::spawn_game(Mode::Challenge);
    let challenge = systems.challenge.contract_address;
    let setup_address = systems.setup.contract_address;
    let mut game = store.game(context.game_id);
    game.score = 5000;
    store.set_game(game);
    let mut spy = spy_events();
    systems.challenge.surrender(context.game_id);
    let game = store.game(context.game_id);
    assert(game.is_over() && game.day_id == 10, 'Quests: over in its day');
    let p = context.player_id;
    assert_order(kinds(@spy.get_events().events, challenge, setup_address), 2, 2);
    spy.assert_emitted(@array![(challenge, Challenge::Event::PavedEvent(game_over(game, p)))]);
    spy
        .assert_emitted(
            @array![
                (setup_address, quest_progressed(p, constants::TASK_GAME_FINISHED, 1)),
                (setup_address, quest_progressed(p, constants::TASK_POINTS, 5000)),
                (setup_address, achievement_progressed(p, constants::TASK_GAME_FINISHED, 1)),
                (setup_address, achievement_progressed(p, constants::TASK_HIGH_SCORE, 1)),
            ],
        );
    spy
        .assert_not_emitted(
            @array![(setup_address, achievement_progressed(p, constants::TASK_WIN, 1))],
        );
}

/// The counters follow the scoring: a 2-tile city closed with a Lord scores one structure, not a
/// big one.
#[test]
#[available_gas(l2_gas: 90512352)]
fn test_quests_counters_follow_the_scoring() {
    let (store, systems, context) = setup::spawn_game(Mode::Challenge);
    let game = store.game(context.game_id);
    let builder = store.builder(game, context.player_id);
    let mut tile = store.tile(game, builder.tile_id);
    tile.plan = Plan::FFCFFFCFF.into();
    store.set_tile(tile);
    systems.challenge.build(context.game_id, Orientation::North, CENTER, CENTER + 1);
    let game = store.game(context.game_id);
    assert(game.score > 0, 'Quests: scored');
    assert(game.structures() == 1, 'Quests: structures');
    assert(game.big() == 0 && game.forests() == 0 && game.wonders() == 0, 'Quests: others');
}

/// The kinds of the events of a game over, in the order they must come: `GameOver` (from
/// `challenge`), the quest events, then the achievement events (from `setup_address`).
pub fn kinds(
    events: @Array<(ContractAddress, snforge_std::Event)>,
    challenge: ContractAddress,
    setup_address: ContractAddress,
) -> Array<u8> {
    let mut kinds: Array<u8> = array![];
    let mut i = 0;
    while i < events.len() {
        let (address, event) = events.at(i);
        let selector = *event.keys.at(0);
        if *address == challenge && selector == selector!("GameOver") {
            kinds.append(0);
        } else if *address == setup_address && selector == selector!("QuestProgressed") {
            kinds.append(1);
        } else if *address == setup_address && selector == selector!("AchievementProgressed") {
            kinds.append(2);
        } else if selector == selector!("QuestProgressed")
            || selector == selector!("AchievementProgressed") {
            // [Info] Progress from any other address: never expected
            kinds.append(3);
        }
        i += 1;
    }
    kinds
}

/// `GameOver`, then `quests` quest events, then `achievements` achievement events, nothing else.
pub fn assert_order(kinds: Array<u8>, quests: u32, achievements: u32) {
    assert(kinds.len() == 1 + quests + achievements, 'Quests: event count');
    let mut i = 0;
    while i < kinds.len() {
        let expected: u8 = if i == 0 {
            0
        } else if i <= quests {
            1
        } else {
            2
        };
        assert(*kinds.at(i) == expected, 'Quests: event order');
        i += 1;
    }
}

/// A Daily game of score 4,500, 2 structures and a forest, with its tile limit cut to the tiles
/// drawn, so that the next `build` or `discard` ends it. Its day is empty: it ranked first before
/// D-20.
pub fn almost_over_daily() -> (setup::TestStore, setup::Systems, setup::Context) {
    start_cheat_block_timestamp_global(10 * 86400);
    let (store, systems, context) = setup::spawn_game(Mode::Challenge);
    let mut game = store.game(context.game_id);
    game.score = 4500;
    game.counts = GameImpl::counts_of(2, 1, 0, 0);
    game.tile_limit = game.tile_count.try_into().unwrap();
    store.set_game(game);
    (store, systems, context)
}

/// The report a Daily game over makes, from the game as it ended: 4 quest entries and the
/// achievement entries of a high score with a forest (3); no task 9, though the game is the first
/// of its day (D-20: before, a fourth entry, task 9).
pub fn assert_daily_report(
    systems: @setup::Systems, mut spy: snforge_std::EventSpy, p: felt252, score: u32,
) {
    let setup_address = *systems.setup.contract_address;
    assert_order(
        kinds(@spy.get_events().events, *systems.challenge.contract_address, setup_address), 4, 3,
    );
    spy
        .assert_emitted(
            @array![
                (setup_address, quest_progressed(p, constants::TASK_GAME_FINISHED, 1)),
                (setup_address, quest_progressed(p, constants::TASK_STRUCTURE_SCORED, 2)),
                (setup_address, quest_progressed(p, constants::TASK_POINTS, score)),
                (setup_address, quest_progressed(p, constants::TASK_FOREST_SCORED, 1)),
                (setup_address, achievement_progressed(p, constants::TASK_GAME_FINISHED, 1)),
                (setup_address, achievement_progressed(p, constants::TASK_FOREST_SCORED, 1)),
                (setup_address, achievement_progressed(p, constants::TASK_HIGH_SCORE, 1)),
            ],
        );
    spy
        .assert_not_emitted(
            @array![(setup_address, achievement_progressed(p, constants::TASK_WIN, 1))],
        );
}

/// A Daily game over on the last `build` reports to `Setup`.
#[test]
#[available_gas(l2_gas: 99743573)]
fn test_quests_daily_game_over_on_the_last_build() {
    let (store, systems, context) = almost_over_daily();
    let mut spy = spy_events();
    let game = store.game(context.game_id);
    let builder = store.builder(game, context.player_id);
    let mut tile = store.tile(game, builder.tile_id);
    tile.plan = Plan::RFFFRFFFR.into();
    store.set_tile(tile);
    systems.challenge.build(context.game_id, Orientation::North, CENTER + 1, CENTER);
    let game = store.game(context.game_id);
    assert(game.is_over(), 'Quests: not over');
    assert_daily_report(@systems, spy, context.player_id, game.score);
}

/// A Daily game over on the last `discard` reports to `Setup`.
#[test]
#[available_gas(l2_gas: 92299357)]
fn test_quests_daily_game_over_on_the_last_discard() {
    let (store, systems, context) = almost_over_daily();
    let mut spy = spy_events();
    systems.challenge.discard(context.game_id);
    let game = store.game(context.game_id);
    assert(game.is_over(), 'Quests: not over');
    assert_daily_report(@systems, spy, context.player_id, game.score);
}

/// The tutorial claim (D-21, P-49 ruling 2) credits First Stone once: the achievement the accepted
/// list gives task 10 (achievement 1).
#[test]
#[available_gas(l2_gas: 73071096)]
fn test_quests_tutorial_claim_credits_first_stone_once() {
    let (_, systems, context) = setup::spawn_game(Mode::None);
    let setup_address = systems.setup.contract_address;
    define_accepted_list(setup_address);
    let mut spy = spy_events();
    start_cheat_caller_address(setup_address, PLAYER());
    systems.setup.claim_tutorial();
    systems.setup.claim_tutorial();
    stop_cheat_caller_address(setup_address);
    let first_stone = achievement_progressed(
        context.player_id, constants::TASK_TUTORIAL_FINISHED, 1,
    );
    spy.assert_emitted(@array![(setup_address, first_stone)]);
    assert(spy.get_events().events.len() == 1, 'Quests: claimed twice');
}

/// A task total of 0 is complete before any report: refused, in a quest and in an achievement.
#[test]
#[available_gas(l2_gas: 54813480)]
#[should_panic(expected: 'Setup: task total is zero')]
fn test_quests_define_quest_total_zero() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let setup_address = systems.setup.contract_address;
    let admin = ISetupDispatcher { contract_address: setup_address };
    start_cheat_caller_address(setup_address, OWNER());
    let schedule = QuestSchedule { start: 0, end: 0, duration: DAY, interval: DAY };
    let tasks = array![QuestTask { task_id: 1, total: 1 }, QuestTask { task_id: 3, total: 0 }];
    admin.define_quest(1, schedule, tasks.span(), array![].span());
}

#[test]
#[available_gas(l2_gas: 54603501)]
#[should_panic(expected: 'Setup: task total is zero')]
fn test_quests_define_achievement_total_zero() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let setup_address = systems.setup.contract_address;
    let admin = ISetupDispatcher { contract_address: setup_address };
    start_cheat_caller_address(setup_address, OWNER());
    admin
        .define_achievement(
            1,
            AchievementWindow { start: 0, end: 0 },
            array![AchievementTask { task_id: 1, total: 0 }].span(),
            10,
        );
}

/// A task id twice in one definition gives two entries under one key: refused.
#[test]
#[available_gas(l2_gas: 54831866)]
#[should_panic(expected: 'Setup: task id repeated')]
fn test_quests_define_quest_task_repeated() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let setup_address = systems.setup.contract_address;
    let admin = ISetupDispatcher { contract_address: setup_address };
    start_cheat_caller_address(setup_address, OWNER());
    let schedule = QuestSchedule { start: 0, end: 0, duration: DAY, interval: DAY };
    let tasks = array![
        QuestTask { task_id: 1, total: 1 }, QuestTask { task_id: 3, total: 5 },
        QuestTask { task_id: 1, total: 2 },
    ];
    admin.define_quest(1, schedule, tasks.span(), array![].span());
}

#[test]
#[available_gas(l2_gas: 54650982)]
#[should_panic(expected: 'Setup: task id repeated')]
fn test_quests_define_achievement_task_repeated() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let setup_address = systems.setup.contract_address;
    let admin = ISetupDispatcher { contract_address: setup_address };
    start_cheat_caller_address(setup_address, OWNER());
    admin
        .define_achievement(
            1,
            AchievementWindow { start: 0, end: 0 },
            array![
                AchievementTask { task_id: 2, total: 1 }, AchievementTask { task_id: 2, total: 1 },
            ]
                .span(),
            10,
        );
}
