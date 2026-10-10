//! Quests and achievements (P7, `docs/architecture/quests.md`): the owner-only definitions, the
//! accepted list, and the report a game over makes, with the ranking and the `GameOver` it must
//! never prevent.

use paved::constants;
use paved::events::game_over;
use paved::leaderboard::{LeaderboardImpl, LeaderboardTrait};
use paved::models::game::{GameImpl, GameTrait};
use paved::models::tile::CENTER;
use paved::systems::daily::{Daily, IDailyQuestsDispatcher, IDailyQuestsDispatcherTrait};
use paved::systems::tutorial::{ITutorialDispatcherTrait, Tutorial};
use paved::tests::setup::setup;
use paved::tests::setup::setup::{IDailyDispatcherTrait, OWNER, PLAYER, TestStoreTrait};
use paved::types::mode::Mode;
use paved::types::orientation::Orientation;
use paved::types::plan::Plan;
use paved::types::role::Role;
use paved::types::spot::Spot;
use quiver_achievement::component::AchievementComponent;
use quiver_achievement::events::index::{AchievementDefined, AchievementProgressed};
use quiver_achievement::types::task::AchievementTask;
use quiver_achievement::types::window::AchievementWindow;
use quiver_quest::component::QuestComponent;
use quiver_quest::events::index::{QuestDefined, QuestProgressed};
use quiver_quest::types::schedule::QuestSchedule;
use quiver_quest::types::task::QuestTask;
use snforge_std::{
    EventSpyAssertionsTrait, EventSpyTrait, interact_with_state, load, map_entry_address,
    spy_events, start_cheat_block_timestamp_global, start_cheat_caller_address,
    stop_cheat_caller_address,
};
use starknet::ContractAddress;

const DAY: u32 = 86400;

fn quest_event(event: QuestComponent::Event) -> Daily::Event {
    Daily::Event::QuestEvent(event)
}

fn achievement_event(event: AchievementComponent::Event) -> Daily::Event {
    Daily::Event::AchievementEvent(event)
}

fn quest_progressed(player_id: felt252, task_id: u32, count: u32) -> Daily::Event {
    quest_event(
        QuestComponent::Event::QuestProgressed(QuestProgressed { player_id, task_id, count }),
    )
}

fn achievement_progressed(player_id: felt252, task_id: u32, count: u32) -> Daily::Event {
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

/// Defines the accepted list (P-22): 4 daily quests and 9 achievements, as the owner.
fn define_accepted_list(daily: ContractAddress) {
    let admin = IDailyQuestsDispatcher { contract_address: daily };
    start_cheat_caller_address(daily, OWNER());
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
    stop_cheat_caller_address(daily);
    start_cheat_caller_address(daily, PLAYER());
}

/// The definitions `Lobby`'s code writes are in `Daily`'s storage, at the addresses the components
/// give (`Quest_definitions`, `Achievement_definitions`): the layout pin of the quiver components.
#[test]
#[available_gas(l2_gas: 77111543)]
fn test_quests_definitions_live_in_the_callers_storage() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let daily = systems.daily.contract_address;
    let quest = map_entry_address(selector!("Quest_definitions"), array![1].span());
    let achievement = map_entry_address(selector!("Achievement_definitions"), array![9].span());
    assert(*load(daily, quest, 1).at(0) == 0, 'Quests: stored before');
    assert(*load(daily, achievement, 1).at(0) == 0, 'Achievements: stored before');
    define_accepted_list(daily);
    assert(*load(daily, quest, 1).at(0) != 0, 'Quests: not in the caller');
    assert(*load(daily, achievement, 1).at(0) != 0, 'Achievements: not in the caller');
}

#[test]
#[available_gas(l2_gas: 78592148)]
fn test_quests_owner_defines_the_accepted_list() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let daily = systems.daily.contract_address;
    let mut spy = spy_events();
    define_accepted_list(daily);

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
    spy.assert_emitted(@array![(daily, defined), (daily, defined_achievement)]);
}

#[test]
#[available_gas(l2_gas: 57366041)]
#[should_panic(expected: 'Ownable: caller is not owner')]
fn test_quests_define_quest_not_owner() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let admin = IDailyQuestsDispatcher { contract_address: systems.daily.contract_address };
    start_cheat_caller_address(systems.daily.contract_address, PLAYER());
    let (schedule, tasks) = daily_quest(constants::TASK_GAME_FINISHED, 1);
    admin.define_quest(1, schedule, tasks.span(), array![].span());
}

#[test]
#[available_gas(l2_gas: 57207386)]
#[should_panic(expected: 'Ownable: caller is not owner')]
fn test_quests_define_achievement_not_owner() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let admin = IDailyQuestsDispatcher { contract_address: systems.daily.contract_address };
    start_cheat_caller_address(systems.daily.contract_address, PLAYER());
    admin
        .define_achievement(
            1,
            AchievementWindow { start: 0, end: 0 },
            array![AchievementTask { task_id: 1, total: 1 }].span(),
            10,
        );
}

#[test]
#[available_gas(l2_gas: 59289756)]
#[should_panic(expected: 'Ownable: caller is not owner')]
fn test_quests_retire_quest_not_owner() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let daily = systems.daily.contract_address;
    let admin = IDailyQuestsDispatcher { contract_address: daily };
    start_cheat_caller_address(daily, OWNER());
    let (schedule, tasks) = daily_quest(constants::TASK_GAME_FINISHED, 1);
    admin.define_quest(1, schedule, tasks.span(), array![].span());
    start_cheat_caller_address(daily, PLAYER());
    admin.retire_quest(1);
}

#[test]
#[available_gas(l2_gas: 56943321)]
#[should_panic(expected: 'Ownable: caller is not owner')]
fn test_quests_retire_achievement_not_owner() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let admin = IDailyQuestsDispatcher { contract_address: systems.daily.contract_address };
    start_cheat_caller_address(systems.daily.contract_address, PLAYER());
    admin.retire_achievement(1);
}

#[test]
#[available_gas(l2_gas: 78290850)]
fn test_quests_owner_retires() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let daily = systems.daily.contract_address;
    let admin = IDailyQuestsDispatcher { contract_address: daily };
    define_accepted_list(daily);
    start_cheat_caller_address(daily, OWNER());
    admin.retire_quest(1);
    admin.retire_achievement(9);
}

/// A recurring quest rolls over at 00:00 UTC only when its start is a multiple of a day (Q-6), the
/// hour where `TournamentImpl::compute_id` rolls over.
#[test]
#[available_gas(l2_gas: 57364781)]
#[should_panic(expected: 'Daily: quest not on UTC day')]
fn test_quests_define_quest_misaligned() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let daily = systems.daily.contract_address;
    let admin = IDailyQuestsDispatcher { contract_address: daily };
    start_cheat_caller_address(daily, OWNER());
    let schedule = QuestSchedule { start: 3600, end: 0, duration: DAY, interval: DAY };
    admin
        .define_quest(
            1, schedule, array![QuestTask { task_id: 1, total: 1 }].span(), array![].span(),
        );
}

/// A definition is created once.
#[test]
#[available_gas(l2_gas: 78093408)]
#[should_panic(expected: 'Quest: already defined')]
fn test_quests_define_twice() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let daily = systems.daily.contract_address;
    define_accepted_list(daily);
    let admin = IDailyQuestsDispatcher { contract_address: daily };
    start_cheat_caller_address(daily, OWNER());
    let (schedule, tasks) = daily_quest(constants::TASK_GAME_FINISHED, 1);
    admin.define_quest(1, schedule, tasks.span(), array![].span());
}

/// A game over with nothing scored reports the finished game only: the ranking (a score of 0
/// never ranks) and `GameOver` happen.
#[test]
#[available_gas(l2_gas: 140148472)]
fn test_quests_game_over_every_count_zero() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let daily = systems.daily.contract_address;
    define_accepted_list(daily);
    let mut spy = spy_events();
    systems.daily.surrender(context.game_id);

    let game = store.game(context.game_id);
    assert(game.is_over(), 'Quests: game over');
    assert(game.score == 0 && game.counts == 0, 'Quests: counters');
    let over = Daily::Event::PavedEvent(game_over(game, context.player_id));
    spy
        .assert_emitted(
            @array![
                (daily, over),
                (daily, quest_progressed(context.player_id, constants::TASK_GAME_FINISHED, 1)),
                (
                    daily,
                    achievement_progressed(context.player_id, constants::TASK_GAME_FINISHED, 1),
                ),
            ],
        );
}

/// A game over with every counter at the maximum of its width, a score above the high score and
/// the first rank: the largest lists (4 and 6 entries), and the game over, the ranking and
/// `GameOver` all happen.
#[test]
#[available_gas(l2_gas: 151415950)]
fn test_quests_game_over_every_counter_at_maximum() {
    // [Setup] Not day 0, whose tournament id is the unset id 0
    start_cheat_block_timestamp_global(10 * 86400);
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let daily = systems.daily.contract_address;
    define_accepted_list(daily);
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
    systems.daily.surrender(context.game_id);

    // [Assert] Game over, ranked first in its tournament
    let game = store.game(context.game_id);
    assert(game.is_over(), 'Quests: game over');
    assert(game.tournament_id != 0, 'Quests: ranked');
    let id = game.tournament_id;
    let top = interact_with_state(daily, || LeaderboardImpl::new().top(id));
    assert(top.first.score == 0xffffffff, 'Quests: first rank');
    let over = Daily::Event::PavedEvent(game_over(game, context.player_id));
    // [Assert] Order: `GameOver` before the first quiver event, the quests before the achievements
    let events = spy.get_events().events;
    let mut positions: Array<u32> = array![];
    let mut i = 0;
    while i < events.len() {
        let (from, event) = events.at(i);
        let selector = *event.keys.at(0);
        if *from == daily {
            if selector == selector!("GameOver") {
                positions.append(0);
            } else if selector == selector!("QuestProgressed") {
                positions.append(1);
            } else if selector == selector!("AchievementProgressed") {
                positions.append(2);
            }
        }
        i += 1;
    }
    let mut sorted = true;
    let mut k = 1;
    while k < positions.len() {
        if *positions.at(k) < *positions.at(k - 1) {
            sorted = false;
        }
        k += 1;
    }
    assert(positions.len() == 1 + 4 + 6 && sorted, 'Quests: event order');
    // [Assert] The report: tasks 1 to 4 to the quests, 1, 4 to 7 and 9 to the achievements, after
    // `GameOver`
    let p = context.player_id;
    spy
        .assert_emitted(
            @array![
                (daily, over), (daily, quest_progressed(p, constants::TASK_GAME_FINISHED, 1)),
                (daily, quest_progressed(p, constants::TASK_STRUCTURE_SCORED, 127)),
                (daily, quest_progressed(p, constants::TASK_POINTS, 0xffffffff)),
                (daily, quest_progressed(p, constants::TASK_FOREST_SCORED, 63)),
                (daily, achievement_progressed(p, constants::TASK_GAME_FINISHED, 1)),
                (daily, achievement_progressed(p, constants::TASK_FOREST_SCORED, 63)),
                (daily, achievement_progressed(p, constants::TASK_WONDER_SCORED, 15)),
                (daily, achievement_progressed(p, constants::TASK_BIG_STRUCTURE, 63)),
                (daily, achievement_progressed(p, constants::TASK_HIGH_SCORE, 1)),
                (daily, achievement_progressed(p, constants::TASK_WIN, 1)),
            ],
        );
}

/// A game over after its tournament closed ranks in nothing but still reports (Q-6): no WIN.
#[test]
#[available_gas(l2_gas: 122023293)]
fn test_quests_game_over_after_tournament_reports_without_win() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let daily = systems.daily.contract_address;
    let mut game = store.game(context.game_id);
    game.score = 5000;
    store.set_game(game);
    start_cheat_block_timestamp_global(game.start_time + constants::DAILY_TOURNAMENT_DURATION + 1);
    let mut spy = spy_events();
    systems.daily.surrender(context.game_id);
    assert(store.game(context.game_id).tournament_id == 0, 'Quests: ranked');
    let p = context.player_id;
    spy
        .assert_emitted(
            @array![
                (daily, quest_progressed(p, constants::TASK_POINTS, 5000)),
                (daily, achievement_progressed(p, constants::TASK_HIGH_SCORE, 1)),
            ],
        );
    spy.assert_not_emitted(@array![(daily, achievement_progressed(p, constants::TASK_WIN, 1))]);
}

/// The counters follow the scoring: a 2-tile city closed with a Lord scores one structure, not a
/// big one.
#[test]
#[available_gas(l2_gas: 126664386)]
fn test_quests_counters_follow_the_scoring() {
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let game = store.game(context.game_id);
    let builder = store.builder(game, context.player_id);
    let mut tile = store.tile(game, builder.tile_id);
    tile.plan = Plan::FFCFFFCFF.into();
    store.set_tile(tile);
    systems
        .daily
        .build(context.game_id, Orientation::North, CENTER, CENTER + 1, Role::Lord, Spot::South);
    let game = store.game(context.game_id);
    assert(game.score > 0, 'Quests: scored');
    assert(game.structures() == 1, 'Quests: structures');
    assert(game.big() == 0 && game.forests() == 0 && game.wonders() == 0, 'Quests: others');
}

/// The kinds of the events of a game over, in the order they must come: `GameOver`, the quest
/// events, then the achievement events.
fn kinds(
    events: @Array<(ContractAddress, snforge_std::Event)>, from: ContractAddress,
) -> Array<u8> {
    let mut kinds: Array<u8> = array![];
    let mut i = 0;
    while i < events.len() {
        let (address, event) = events.at(i);
        if *address == from {
            let selector = *event.keys.at(0);
            if selector == selector!("GameOver") {
                kinds.append(0);
            } else if selector == selector!("QuestProgressed") {
                kinds.append(1);
            } else if selector == selector!("AchievementProgressed") {
                kinds.append(2);
            }
        }
        i += 1;
    }
    kinds
}

/// `GameOver`, then `quests` quest events, then `achievements` achievement events, nothing else.
fn assert_order(kinds: Array<u8>, quests: u32, achievements: u32) {
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
/// drawn, so that the next `build` or `discard` ends it. The tournament is empty: it ranks first.
pub fn almost_over_daily() -> (setup::TestStore, setup::Systems, setup::Context) {
    start_cheat_block_timestamp_global(10 * 86400);
    let (store, systems, context) = setup::spawn_game(Mode::Daily);
    let mut game = store.game(context.game_id);
    game.score = 4500;
    game.counts = GameImpl::counts_of(2, 1, 0, 0);
    game.tile_limit = game.tile_count.try_into().unwrap();
    store.set_game(game);
    (store, systems, context)
}

/// The report a Daily game over makes, from the game as it ended: 4 quest entries and the
/// achievement entries of a first-ranked high score with a forest.
fn assert_daily_report(
    daily: ContractAddress, mut spy: snforge_std::EventSpy, p: felt252, score: u32,
) {
    assert_order(kinds(@spy.get_events().events, daily), 4, 4);
    spy
        .assert_emitted(
            @array![
                (daily, quest_progressed(p, constants::TASK_GAME_FINISHED, 1)),
                (daily, quest_progressed(p, constants::TASK_STRUCTURE_SCORED, 2)),
                (daily, quest_progressed(p, constants::TASK_POINTS, score)),
                (daily, quest_progressed(p, constants::TASK_FOREST_SCORED, 1)),
                (daily, achievement_progressed(p, constants::TASK_GAME_FINISHED, 1)),
                (daily, achievement_progressed(p, constants::TASK_FOREST_SCORED, 1)),
                (daily, achievement_progressed(p, constants::TASK_HIGH_SCORE, 1)),
                (daily, achievement_progressed(p, constants::TASK_WIN, 1)),
            ],
        );
}

/// A Daily game over on the last `build` (the one library call from `Daily`) reports.
#[test]
#[available_gas(l2_gas: 136699338)]
fn test_quests_daily_game_over_on_the_last_build() {
    let (store, systems, context) = almost_over_daily();
    let mut spy = spy_events();
    let game = store.game(context.game_id);
    let builder = store.builder(game, context.player_id);
    let mut tile = store.tile(game, builder.tile_id);
    tile.plan = Plan::RFFFRFFFR.into();
    store.set_tile(tile);
    systems
        .daily
        .build(context.game_id, Orientation::North, CENTER + 1, CENTER, Role::None, Spot::None);
    let game = store.game(context.game_id);
    assert(game.is_over(), 'Quests: not over');
    assert_daily_report(systems.daily.contract_address, spy, context.player_id, game.score);
}

/// A Daily game over on the last `discard` (in `Lobby`) reports.
#[test]
#[available_gas(l2_gas: 129111665)]
fn test_quests_daily_game_over_on_the_last_discard() {
    let (store, systems, context) = almost_over_daily();
    let mut spy = spy_events();
    systems.daily.discard(context.game_id);
    let game = store.game(context.game_id);
    assert(game.is_over(), 'Quests: not over');
    assert_daily_report(systems.daily.contract_address, spy, context.player_id, game.score);
}

/// A Tutorial game over (see the checks): `GameOver`, then one unit of task 10 from the Tutorial.
fn assert_first_stone(tutorial: ContractAddress, mut spy: snforge_std::EventSpy, p: felt252) {
    assert_order(kinds(@spy.get_events().events, tutorial), 0, 1);
    let event = Tutorial::Event::AchievementEvent(
        AchievementComponent::Event::AchievementProgressed(
            AchievementProgressed {
                player_id: p, task_id: constants::TASK_TUTORIAL_FINISHED, count: 1,
            },
        ),
    );
    spy.assert_emitted(@array![(tutorial, event)]);
}

/// P-28: a Tutorial ended by placing its last tile credits First Stone once.
#[test]
#[available_gas(l2_gas: 143234730)]
fn test_quests_tutorial_game_over_on_the_last_build_credits_task_10() {
    let (store, systems, context) = setup::spawn_game(Mode::Tutorial);
    let mut i: u8 = 0;
    while i < 7 {
        systems.tutorial.build(context.game_id);
        i += 1;
    }
    systems.tutorial.discard(context.game_id);
    assert(!store.game(context.game_id).is_over(), 'Quests: over too soon');
    let mut spy = spy_events();
    systems.tutorial.build(context.game_id);
    assert(store.game(context.game_id).is_over(), 'Quests: not over');
    assert_first_stone(systems.tutorial.contract_address, spy, context.player_id);
}

/// P-28: a Tutorial ended by discarding its last tile credits First Stone once.
#[test]
#[available_gas(l2_gas: 131602274)]
fn test_quests_tutorial_game_over_on_the_last_discard_credits_task_10() {
    let (store, systems, context) = setup::spawn_game(Mode::Tutorial);
    let mut i: u8 = 0;
    while i < 7 {
        systems.tutorial.build(context.game_id);
        i += 1;
    }
    // [Setup] The tile the script discards is the last one
    let mut game = store.game(context.game_id);
    game.tile_limit = game.tile_count.try_into().unwrap();
    store.set_game(game);
    let mut spy = spy_events();
    systems.tutorial.discard(context.game_id);
    assert(store.game(context.game_id).is_over(), 'Quests: not over');
    assert_first_stone(systems.tutorial.contract_address, spy, context.player_id);
}

/// P-28: a Tutorial surrender credits nothing, however early or late, but the game is over.
#[test]
#[available_gas(l2_gas: 68299000)]
fn test_quests_tutorial_surrender_credits_no_task_10() {
    let (store, systems, context) = setup::spawn_game(Mode::Tutorial);
    let tutorial = systems.tutorial.contract_address;
    let mut spy = spy_events();
    systems.tutorial.surrender(context.game_id);
    assert(store.game(context.game_id).is_over(), 'Quests: not over');
    let kinds = kinds(@spy.get_events().events, tutorial);
    assert(kinds.len() == 1 && *kinds.at(0) == 0, 'Quests: surrender credited');
}

/// A task total of 0 is complete before any report: refused, in a quest and in an achievement.
#[test]
#[available_gas(l2_gas: 57496755)]
#[should_panic(expected: 'Daily: task total is zero')]
fn test_quests_define_quest_total_zero() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let daily = systems.daily.contract_address;
    let admin = IDailyQuestsDispatcher { contract_address: daily };
    start_cheat_caller_address(daily, OWNER());
    let schedule = QuestSchedule { start: 0, end: 0, duration: DAY, interval: DAY };
    let tasks = array![QuestTask { task_id: 1, total: 1 }, QuestTask { task_id: 3, total: 0 }];
    admin.define_quest(1, schedule, tasks.span(), array![].span());
}

#[test]
#[available_gas(l2_gas: 57240041)]
#[should_panic(expected: 'Daily: task total is zero')]
fn test_quests_define_achievement_total_zero() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let daily = systems.daily.contract_address;
    let admin = IDailyQuestsDispatcher { contract_address: daily };
    start_cheat_caller_address(daily, OWNER());
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
#[available_gas(l2_gas: 57537884)]
#[should_panic(expected: 'Daily: task id repeated')]
fn test_quests_define_quest_task_repeated() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let daily = systems.daily.contract_address;
    let admin = IDailyQuestsDispatcher { contract_address: daily };
    start_cheat_caller_address(daily, OWNER());
    let schedule = QuestSchedule { start: 0, end: 0, duration: DAY, interval: DAY };
    let tasks = array![
        QuestTask { task_id: 1, total: 1 }, QuestTask { task_id: 3, total: 5 },
        QuestTask { task_id: 1, total: 2 },
    ];
    admin.define_quest(1, schedule, tasks.span(), array![].span());
}

#[test]
#[available_gas(l2_gas: 57310265)]
#[should_panic(expected: 'Daily: task id repeated')]
fn test_quests_define_achievement_task_repeated() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let daily = systems.daily.contract_address;
    let admin = IDailyQuestsDispatcher { contract_address: daily };
    start_cheat_caller_address(daily, OWNER());
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
