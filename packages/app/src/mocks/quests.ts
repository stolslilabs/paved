import type { PlayerAchievement, PlayerAchievements, TaskProgress } from "@paved/chain";
import { isLiveOnDay, questWindow, type QuestSchedule, type ScheduledQuest, type ScheduledQuests } from "../lib/quest-window";
import { DAY, HOUR, MOCK_NOW } from "./clock";
import { PLAYER_ID, TODAY } from "./players";

/**
 * The quests and achievements as the indexer serves them (`/v1/players/:id/quests?day=`, `/v1/players/:id/achievements`,
 * `packages/indexer/src/api.ts`), in the shapes `@paved/chain`'s indexer client reads them into. The quests are a v2a-shaped
 * catalogue (below); the nine achievements are the accepted list (docs/architecture/quests.md), their targets as defined there.
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

/** The day the quests were defined: their schedule starts at its 00:00 UTC, so a day's interval id counts from it. */
export const QUESTS_FROM = TODAY - 21;

/*
 * A v2a-shaped catalogue (quests-v2.md 2.1, "Rotation" and "Weekly"): definitions only, no contract change. Provisional until
 * CORE v2a and P9: the ids, the targets and the offsets are this module's, the field names (`start`, `interval`, `duration`)
 * are the document's, and the chain's parsed quest types do not carry them yet (see `lib/quest-window.ts`).
 *
 *  - Daily Run is live every day (`duration = interval = 1 day`).
 *  - Six rotating dailies in a 3-day interval, `start` offset by 0, 1 or 2 days (Nums' scheme): two are live each day.
 *  - Three weeklies in a 7-day interval. Their week starts on a Friday here on purpose: the client reads the week from the
 *    definition, it does not assume Monday.
 */
const FROM = QUESTS_FROM * DAY;
const dailyAt = (offsetDays: number, everyDays: number): QuestSchedule => ({ start: FROM + offsetDays * DAY, interval: everyDays * DAY, duration: DAY });
const WEEK_START = FROM + 2 * DAY;
const weekly: QuestSchedule = { start: WEEK_START, interval: 7 * DAY, duration: 7 * DAY };

export interface QuestDefinition extends QuestSchedule {
  questId: number;
  taskId: number;
  total: number;
}

export const QUEST_DEFINITIONS: readonly QuestDefinition[] = [
  { questId: 1, taskId: GAME_FINISHED, total: 1, ...dailyAt(0, 1) },
  { questId: 2, taskId: STRUCTURE_SCORED, total: 6, ...dailyAt(0, 3) },
  { questId: 4, taskId: POINTS, total: 3_000, ...dailyAt(0, 3) },
  { questId: 3, taskId: FOREST_SCORED, total: 1, ...dailyAt(1, 3) },
  { questId: 5, taskId: STRUCTURE_SCORED, total: 12, ...dailyAt(1, 3) },
  { questId: 6, taskId: FOREST_SCORED, total: 3, ...dailyAt(2, 3) },
  { questId: 7, taskId: POINTS, total: 6_000, ...dailyAt(2, 3) },
  { questId: 8, taskId: FOREST_SCORED, total: 5, ...weekly },
  { questId: 9, taskId: STRUCTURE_SCORED, total: 30, ...weekly },
  { questId: 10, taskId: POINTS, total: 20_000, ...weekly },
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
  quests: QUEST_DEFINITIONS.filter((def) => isLiveOnDay(def, d)).map((def) => quest(def, d, counts[def.questId] ?? 0, completedAt[def.questId] ?? null)),
});

/** Today (Wednesday, 2 days before the week ends): Daily Run done, Master Builder 4 of 6, Point Chaser 2,710 of 3,000; Weekly Forester 3 of 5, Builder 22 of 30, Points 12,400 of 20,000. */
const TODAY_COUNTS = { 1: 1, 2: 4, 4: 2_710, 8: 3, 9: 22, 10: 12_400 };
export const QUESTS_TODAY = day(TODAY, TODAY_COUNTS, { 1: MOCK_NOW - 3 * HOUR });

/** Master Builder one structure from done: scoring it completes the quest (the toast's story). */
export const QUESTS_TODAY_ONE_TO_GO = day(TODAY, { ...TODAY_COUNTS, 2: 5 }, { 1: MOCK_NOW - 3 * HOUR });
/** ... and the read after it: 6 of 6. */
export const QUESTS_TODAY_COMPLETED = day(TODAY, { ...TODAY_COUNTS, 2: 6 }, { 1: MOCK_NOW - 3 * HOUR, 2: MOCK_NOW });

/** The same day with Weekly Forester done (5 of 5). */
export const QUESTS_WEEKLY_DONE = day(TODAY, { ...TODAY_COUNTS, 8: 5 }, { 1: MOCK_NOW - 3 * HOUR, 8: MOCK_NOW - 5 * HOUR });

/** Yesterday, closed (the rotation's other pair): everything done, the week's three included. */
export const QUESTS_ALL_DONE = day(
  TODAY - 1,
  { 1: 1, 6: 4, 7: 7_300, 8: 6, 9: 31, 10: 21_500 },
  { 1: (TODAY - 1) * DAY + 9 * HOUR, 6: (TODAY - 1) * DAY + 11 * HOUR, 7: (TODAY - 1) * DAY + 17 * HOUR, 8: (TODAY - 1) * DAY + 11 * HOUR, 9: (TODAY - 1) * DAY + 12 * HOUR, 10: (TODAY - 1) * DAY + 17 * HOUR },
);

/** A past day the player did not play: every count at 0. */
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

/** The player's nine: four earned, two in progress (Settler III 21 of 50, Forester 7 of 10), three locked (nothing counted yet). */
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
]);

/** A new player: nothing counted, all nine locked. */
export const ACHIEVEMENTS_NEW = achievements(ACHIEVEMENTS_MIXED.achievements.map((a) => achievement(a.achievementId, a.points, a.tasks.map((t) => ({ ...t, count: 0 })))));

/** Every one earned. */
export const ACHIEVEMENTS_ALL = achievements(
  ACHIEVEMENTS_MIXED.achievements.map((a, i) => achievement(a.achievementId, a.points, a.tasks.map((t) => ({ ...t, count: t.total })), MOCK_NOW - (20 - i) * DAY)),
);
