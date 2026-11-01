import type { PlayerAchievement, PlayerAchievements, TaskProgress } from "@paved/chain";
import type { GameMission } from "../components/containers/game-missions";
import { MOCK_DAILY_FAMILY } from "../data/mock/dailies";
import { MOCK_PVP_WEEKLIES } from "../data/mock/weeklies";
import { isLiveOnDay, questWindow, type QuestSchedule, type ScheduledQuest, type ScheduledQuests } from "../lib/quest-window";
import { DAY, HOUR, MOCK_NOW } from "./clock";
import { PLAYER_ID, TODAY } from "./players";

/**
 * The quests and achievements as the indexer serves them (`/v1/players/:id/quests?day=`, `/v1/players/:id/achievements`,
 * `packages/indexer/src/api.ts`), in the shapes `@paved/chain`'s indexer client reads them into. The quests are the fresh
 * deployment's definitions (below, quests.md "As built: v2a" and "Four dailies a day", with #869's fifth daily); the sixteen
 * achievements are the accepted list and v2a's higher tiers, their targets as defined there.
 */

/** Task ids (`TaskId` of the contracts, quests.md). */
const GAME_FINISHED = 1;
const STRUCTURE_SCORED = 2;
const POINTS = 3;
const FOREST_SCORED = 4;
const WONDER_SCORED = 5;
const BIG_STRUCTURE = 6;
const HIGH_SCORE = 7;
const PODIUM = 8;
const TUTORIAL_FINISHED = 10;

const task = (taskId: number, total: number, count: number): TaskProgress => ({ taskId, total, count: Math.min(count, total) });

/** The first day the app shows quests for: the day the fresh deployment defined them (a mock date; nothing is live before it). */
export const QUESTS_FROM = TODAY - 21;

/*
 * The definitions of the fresh deployment (quests.md "As built: v2a" and "Four dailies a day", the PM's ruling of 2026-10-14;
 * `FRESH_QUESTS` of scripts/deploy.sh), schedules as defined, from the epoch, with the fifth daily of #869 (the owner's
 * decisions of 2026-10-28, open point 2's default: one more family in the rotation; the contracts' definitions follow, #738):
 *
 *  - Daily Run (id 1) is live every day (`duration = interval = 1 day`, `start` 0). Quests 2 to 4 (v1's) are NOT defined.
 *  - Twelve rotating dailies in four sets of three: structures 5 to 7, forests 8 to 10, points 11 to 13, and games finished
 *    17 to 19 (#869, the mock's ids, the next free ones: `MOCK_DAILY_FAMILY`, which the mock's indexer adds). Each lasts one
 *    day in a 3-day interval, `start` offset by 0, 1 or 2 days, so the one live on a UTC day is the one whose offset is the
 *    day number mod 3. Five dailies are live a day
 *    (`DAILY_QUESTS`): Daily Run and one of each family (today, day 20,740, offset 1: quests 1, 6, 9, 12 and 18). None pays on
 *    its own since #869: the day's milestones do (`DAILY_MILESTONES`, 3 done and 5 done).
 *  - Five weeklies (`WEEKLY_QUESTS`), `duration = interval = 7 days`, `start` 345,600: Monday 1970-01-05 00:00 UTC, so a week
 *    runs Monday to Sunday UTC (the epoch is a Thursday; a start of 0 would have put the boundary on Thursdays). Ids 14 to 16 on
 *    the Challenge, and #976's two on the PvP (the owner's decisions of 2026-11-01, the mock's ids 20 and 21:
 *    `MOCK_PVP_WEEKLIES`, which the mock's indexer adds): Weekly Raider, 10 attacks settled, and Weekly Stars, 15 stars. The
 *    week pays at its milestones (`WEEKLY_MILESTONES`, 3 done and 5 done).
 *
 * The client still reads the week from the definition, it does not assume Monday (`lib/quest-window.ts`). The schedule fields are
 * the document's (`start`, `interval`, `duration`); `@paved/chain`'s parsed quest types do not carry them yet (P9).
 */
const dailyAt = (offsetDays: number, everyDays: number): QuestSchedule => ({ start: offsetDays * DAY, interval: everyDays * DAY, duration: DAY });
const weekly: QuestSchedule = { start: 345_600, interval: 7 * DAY, duration: 7 * DAY };

export interface QuestDefinition extends QuestSchedule {
  questId: number;
  taskId: number;
  total: number;
}

export const QUEST_DEFINITIONS: readonly QuestDefinition[] = [
  { questId: 1, taskId: GAME_FINISHED, total: 1, ...dailyAt(0, 1) },
  { questId: 5, taskId: STRUCTURE_SCORED, total: 4, ...dailyAt(0, 3) },
  { questId: 6, taskId: STRUCTURE_SCORED, total: 8, ...dailyAt(1, 3) },
  { questId: 7, taskId: STRUCTURE_SCORED, total: 12, ...dailyAt(2, 3) },
  { questId: 8, taskId: FOREST_SCORED, total: 2, ...dailyAt(0, 3) },
  { questId: 9, taskId: FOREST_SCORED, total: 3, ...dailyAt(1, 3) },
  { questId: 10, taskId: FOREST_SCORED, total: 4, ...dailyAt(2, 3) },
  { questId: 11, taskId: POINTS, total: 2_000, ...dailyAt(0, 3) },
  { questId: 12, taskId: POINTS, total: 5_000, ...dailyAt(1, 3) },
  { questId: 13, taskId: POINTS, total: 8_000, ...dailyAt(2, 3) },
  { questId: 14, taskId: FOREST_SCORED, total: 5, ...weekly },
  { questId: 15, taskId: STRUCTURE_SCORED, total: 30, ...weekly },
  { questId: 16, taskId: POINTS, total: 20_000, ...weekly },
  // The fifth daily's family, as the mock's indexer adds it (`data/mock/dailies.ts`).
  ...MOCK_DAILY_FAMILY.map((q) => ({ questId: q.questId, taskId: GAME_FINISHED, total: q.total, ...dailyAt(q.offset, 3) })),
  // The PvP weeklies, as the mock's indexer adds them (`data/mock/weeklies.ts`).
  ...MOCK_PVP_WEEKLIES.map((q) => ({ questId: q.questId, taskId: q.taskId, total: q.total, ...weekly })),
];

const quest = (def: QuestDefinition, day: number, count: number, completedAt: number | null): ScheduledQuest => {
  // The window live on that day: the one open at its start, or the one that opens during it.
  const w = questWindow(def, day * DAY);
  const intervalId = w.active ? w.intervalId : w.intervalId + 1;
  const tasks = [task(def.taskId, def.total, count)];
  const completed = tasks.every((t) => t.count >= t.total);
  const { start, interval, duration } = def;
  return { questId: def.questId, intervalId, tasks, completed, completedAt: completed ? (completedAt ?? MOCK_NOW - 2 * HOUR) : null, retired: false, start, interval, duration };
};

/** A day as the indexer serves it: the definitions live at some second of it, with the counts given (0 for the others). */
const day = (d: number, counts: Record<number, number>, completedAt: Record<number, number> = {}): ScheduledQuests => ({
  playerId: PLAYER_ID,
  day: d,
  startTime: d * DAY,
  endTime: (d + 1) * DAY,
  // Nothing is live before the day the quests were defined.
  quests: (d < QUESTS_FROM ? [] : QUEST_DEFINITIONS.filter((def) => isLiveOnDay(def, d))).map((def) => quest(def, d, counts[def.questId] ?? 0, completedAt[def.questId] ?? null)),
});

/** When Daily Run was done today. */
const DONE_TODAY = { 1: MOCK_NOW - 3 * HOUR };

/**
 * Today (Wednesday 2026-10-14, day 20,740: the rotation is 6, 9, 12 and 18, beside Daily Run; the week began on Monday). Counts
 * are per task, as the indexer's are: 1 game, 4 structures, 1 forest and 2,710 points scored today, so Daily Run is done, Public
 * Works is 4 of 8, Deep Woods 1 of 3, Strong Day 2,710 of 5,000 and Busy Day 1 of 3: one daily of five done. The week: Weekly
 * Forester 3 of 5, Builder 22 of 30, Points 12,400 of 20,000, Raider 4 of 10 attacks and Stars 7 of 15 stars (#976).
 */
const TODAY_COUNTS = { 1: 1, 6: 4, 9: 1, 12: 2_710, 18: 1, 14: 3, 15: 22, 16: 12_400, 20: 4, 21: 7 };
export const QUESTS_TODAY = day(TODAY, TODAY_COUNTS, DONE_TODAY);

/** Public Works one structure from done, 7 of 8: scoring it completes the quest (the toast's story). */
export const QUESTS_TODAY_ONE_TO_GO = day(TODAY, { ...TODAY_COUNTS, 6: 7 }, DONE_TODAY);
/** ... and the read after it: 8 of 8. */
export const QUESTS_TODAY_COMPLETED = day(TODAY, { ...TODAY_COUNTS, 6: 8 }, { ...DONE_TODAY, 6: MOCK_NOW });

/** The same day with Weekly Forester done (5 of 5). */
export const QUESTS_WEEKLY_DONE = day(TODAY, { ...TODAY_COUNTS, 14: 5 }, { ...DONE_TODAY, 14: MOCK_NOW - 5 * HOUR });

/** The same day with the three Challenge weeklies done, the two PvP ones at today's counts: the week's bonus can be claimed. */
export const QUESTS_WEEK_DONE = day(TODAY, { ...TODAY_COUNTS, 14: 5, 15: 30, 16: 20_000 }, { ...DONE_TODAY, 14: MOCK_NOW - 5 * HOUR, 15: MOCK_NOW - 4 * HOUR, 16: MOCK_NOW - HOUR });

/**
 * Today with `done` of the five weeklies done (#976, the week's milestones: none, three and five done are the stories), the
 * others at today's counts, or at none with nothing done. Done in the order Weekly Forester, Builder, Points, Raider, Stars.
 */
export const questsWeekDone = (done: number): ScheduledQuests => {
  const order = [14, 15, 16, 20, 21].slice(0, done);
  const totals = Object.fromEntries(order.map((id) => [id, QUEST_DEFINITIONS.find((d) => d.questId === id)!.total]));
  const none = done === 0 ? { 14: 0, 15: 0, 16: 0, 20: 0, 21: 0 } : {};
  return day(TODAY, { ...TODAY_COUNTS, ...none, ...totals }, { ...DONE_TODAY, ...Object.fromEntries(order.map((id, i) => [id, MOCK_NOW - (6 - i) * HOUR])) });
};

/** The same day for a player who has not played yet (#832, a new player): every count at 0. */
export const QUESTS_TODAY_FRESH = day(TODAY, {});

/** The same day with every daily and weekly done (#832, everything done): the five dailies and the five weeklies at their totals. */
export const QUESTS_TODAY_ALL_DONE = day(
  TODAY,
  { 1: 3, 6: 8, 9: 3, 12: 5_000, 18: 3, 14: 5, 15: 30, 16: 20_000, 20: 10, 21: 15 },
  {
    ...DONE_TODAY,
    6: MOCK_NOW - 2 * HOUR,
    9: MOCK_NOW - 90 * 60,
    12: MOCK_NOW - HOUR,
    18: MOCK_NOW - 30 * 60,
    14: MOCK_NOW - 5 * HOUR,
    15: MOCK_NOW - 4 * HOUR,
    16: MOCK_NOW - HOUR,
    20: MOCK_NOW - 3 * HOUR,
    21: MOCK_NOW - 45 * 60,
  },
);

/**
 * Yesterday, closed (day 20,739, offset 0: the rotation is 5, 8, 11 and 17): the five dailies done. The weeklies are at or below
 * today's counts (a week's progress only grows inside its interval), so this day and `QUESTS_TODAY` never contradict each other.
 */
const YESTERDAY = TODAY - 1;
export const QUESTS_ALL_DONE = day(
  YESTERDAY,
  { 1: 2, 5: 6, 8: 2, 11: 7_300, 17: 2, 14: 2, 15: 18, 16: 9_000, 20: 2, 21: 3 },
  Object.fromEntries([1, 5, 8, 11, 17].map((id, i) => [id, YESTERDAY * DAY + (8 + i * 2) * HOUR])),
);

/**
 * Today with `done` of the five dailies done, the others at today's counts (#869, the day's milestones: 0, 2, 3 and 5 done are
 * the bar's stories). The dailies are done in the order Daily Run, Public Works, Deep Woods, Strong Day, Busy Day.
 */
export const questsTodayDone = (done: number): ScheduledQuests => {
  const order = [1, 6, 9, 12, 18].slice(0, done);
  const totals = Object.fromEntries(order.map((id) => [id, QUEST_DEFINITIONS.find((d) => d.questId === id)!.total]));
  // The ones not done at today's counts; with nothing done, no game finished yet.
  const games = done === 0 ? { 1: 0, 18: 0 } : {};
  return day(TODAY, { ...TODAY_COUNTS, ...games, ...totals }, Object.fromEntries(order.map((id, i) => [id, MOCK_NOW - (5 - i) * HOUR])));
};

/** A past day the player did not play (day 20,736, offset 0: 1, 5, 8, 11 and 17, and last week's five): every count at 0. */
export const QUESTS_IDLE = day(TODAY - 4, {});

/** A day before the quests were defined: none live. */
export const QUESTS_NONE = day(QUESTS_FROM - 2, {});

const achievement = (achievementId: number, points: number, tasks: TaskProgress[], completedAt: number | null = null): PlayerAchievement => {
  const completed = tasks.every((t) => t.count >= t.total);
  return { achievementId, points, tasks, completed, completedAt: completed ? (completedAt ?? MOCK_NOW - 6 * DAY) : null, retired: false };
};

const achievements = (list: PlayerAchievement[]): PlayerAchievements => ({
  playerId: PLAYER_ID,
  points: list.filter((a) => a.completed).reduce((sum, a) => sum + a.points, 0),
  achievements: list,
});

/**
 * The player's sixteen: four earned, six in progress (Settler III 21 of 50, Forester 7 of 10, Forester II 7 of 50, Grand Builder II
 * 1 of 10, Settler IV 21 of 250, Settler V 21 of 1,000), six locked (nothing counted yet). Tiers 10 to 16 are v2a's, with its points.
 */
export const ACHIEVEMENTS_MIXED = achievements([
  achievement(1, 10, [task(TUTORIAL_FINISHED, 1, 1)], MOCK_NOW - 29 * DAY),
  achievement(2, 10, [task(GAME_FINISHED, 1, 21)], MOCK_NOW - 28 * DAY),
  achievement(3, 20, [task(GAME_FINISHED, 10, 21)], MOCK_NOW - 12 * DAY),
  achievement(4, 40, [task(GAME_FINISHED, 50, 21)]),
  achievement(5, 20, [task(BIG_STRUCTURE, 1, 1)], MOCK_NOW - 9 * DAY),
  achievement(6, 20, [task(FOREST_SCORED, 10, 7)]),
  achievement(7, 30, [task(WONDER_SCORED, 1, 0)]),
  achievement(8, 30, [task(HIGH_SCORE, 1, 0)]),
  achievement(9, 50, [task(PODIUM, 1, 0)]),
  achievement(10, 40, [task(FOREST_SCORED, 50, 7)]),
  achievement(11, 50, [task(WONDER_SCORED, 10, 0)]),
  achievement(12, 40, [task(BIG_STRUCTURE, 10, 1)]),
  achievement(13, 50, [task(HIGH_SCORE, 10, 0)]),
  achievement(14, 80, [task(HIGH_SCORE, 25, 0)]),
  achievement(15, 60, [task(GAME_FINISHED, 250, 21)]),
  achievement(16, 80, [task(GAME_FINISHED, 1_000, 21)]),
]);

/** A new player: nothing counted, all sixteen locked. */
export const ACHIEVEMENTS_NEW = achievements(ACHIEVEMENTS_MIXED.achievements.map((a) => achievement(a.achievementId, a.points, a.tasks.map((t) => ({ ...t, count: 0 })))));

/** Every one earned. */
export const ACHIEVEMENTS_ALL = achievements(
  ACHIEVEMENTS_MIXED.achievements.map((a, i) => achievement(a.achievementId, a.points, a.tasks.map((t) => ({ ...t, count: t.total })), MOCK_NOW - (20 - i) * DAY)),
);

/**
 * What one game completed (#595), as the over page lists it: Public Works and Deep Woods of the day, with no Cobbles of their own
 * (#869: the day's milestones pay), and Forester (10 forests) reached by the same game over, with its Cobbles.
 */
export const GAME_MISSIONS: readonly GameMission[] = [
  { key: "quest:6:6913", kind: "quest", title: "Public Works", icon: "castle" },
  { key: "quest:9:6913", kind: "quest", title: "Deep Woods", icon: "tree" },
  { key: "achievement:6", kind: "achievement", title: "Forester", icon: "tree", points: 20, cobbles: 20 },
];
