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
use quiver_achievement::interface::{IAchievementViewDispatcher, IAchievementViewDispatcherTrait};
use quiver_achievement::types::task::AchievementTask;
use quiver_achievement::types::window::AchievementWindow;
use quiver_quest::component::QuestComponent;
use quiver_quest::events::index::{QuestDefined, QuestProgressed};
use quiver_quest::interface::{IQuestViewDispatcher, IQuestViewDispatcherTrait};
use quiver_quest::types::schedule::QuestSchedule;
use quiver_quest::types::task::QuestTask;
use snforge_std::{
    EventSpyAssertionsTrait, interact_with_state, spy_events, start_cheat_block_timestamp_global,
    start_cheat_caller_address, stop_cheat_caller_address,
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

#[test]
#[available_gas(l2_gas: 42896028)]
fn test_quests_owner_defines_the_accepted_list() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let daily = systems.daily.contract_address;
    let mut spy = spy_events();
    define_accepted_list(daily);

    // [Assert] The definitions are readable
    let quests = IQuestViewDispatcher { contract_address: daily };
    let (_, tasks, conditions) = quests.quest_definition(4);
    assert(
        *tasks.at(0_usize) == QuestTask { task_id: constants::TASK_POINTS, total: 3000 },
        'Quest 4 task',
    );
    assert(conditions.len() == 0, 'Quest 4 conditions');
    let achievements = IAchievementViewDispatcher { contract_address: daily };
    let (_, tasks) = achievements.achievement_definition(4);
    assert(
        *tasks.at(0_usize) == AchievementTask { task_id: constants::TASK_GAME_FINISHED, total: 50 },
        'Achievement 4 task',
    );

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
#[available_gas(l2_gas: 24094476)]
#[should_panic(expected: 'Ownable: caller is not owner')]
fn test_quests_define_quest_not_owner() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let admin = IDailyQuestsDispatcher { contract_address: systems.daily.contract_address };
    start_cheat_caller_address(systems.daily.contract_address, PLAYER());
    let (schedule, tasks) = daily_quest(constants::TASK_GAME_FINISHED, 1);
    admin.define_quest(1, schedule, tasks.span(), array![].span());
}

#[test]
#[available_gas(l2_gas: 23960024)]
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
#[available_gas(l2_gas: 25827942)]
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
#[available_gas(l2_gas: 23768378)]
#[should_panic(expected: 'Ownable: caller is not owner')]
fn test_quests_retire_achievement_not_owner() {
    let (_, systems, _) = setup::spawn_game(Mode::None);
    let admin = IDailyQuestsDispatcher { contract_address: systems.daily.contract_address };
    start_cheat_caller_address(systems.daily.contract_address, PLAYER());
    admin.retire_achievement(1);
}

#[test]
#[available_gas(l2_gas: 41449401)]
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
#[available_gas(l2_gas: 24093216)]
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
#[available_gas(l2_gas: 41275007)]
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
#[available_gas(l2_gas: 91007295)]
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
#[available_gas(l2_gas: 104736338)]
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
#[available_gas(l2_gas: 77252819)]
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
#[available_gas(l2_gas: 83391170)]
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

/// A Tutorial game over reports task 10 to the achievements, and only that.
#[test]
#[available_gas(l2_gas: 33004954)]
fn test_quests_tutorial_game_over_reports_task_10() {
    let (_, systems, context) = setup::spawn_game(Mode::Tutorial);
    let tutorial = systems.tutorial.contract_address;
    let mut spy = spy_events();
    systems.tutorial.surrender(context.game_id);
    let event = Tutorial::Event::AchievementEvent(
        AchievementComponent::Event::AchievementProgressed(
            AchievementProgressed {
                player_id: context.player_id, task_id: constants::TASK_TUTORIAL_FINISHED, count: 1,
            },
        ),
    );
    spy.assert_emitted(@array![(tutorial, event)]);
}
