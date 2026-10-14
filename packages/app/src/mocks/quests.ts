import type { PlayerAchievement, PlayerAchievements, PlayerQuest, PlayerQuests, TaskProgress } from "@paved/chain";
import { DAY, HOUR, MOCK_NOW } from "./clock";
import { PLAYER_ID, TODAY } from "./players";

/**
 * The quests and achievements as the indexer serves them (`/v1/players/:id/quests?day=`, `/v1/players/:id/achievements`,
 * `packages/indexer/src/api.ts`), in the shapes `@paved/chain`'s indexer client reads them into. The four dailies and the
 * nine achievements of the accepted list (docs/architecture/quests.md), their targets as defined there.
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

/** The day the dailies were defined: their schedule starts at its 00:00 UTC, so a day's interval id counts from it. */
export const QUESTS_FROM = TODAY - 21;

const quest = (questId: number, tasks: TaskProgress[], completedAt: number | null = null): Omit<PlayerQuest, "intervalId"> => {
  const completed = tasks.every((t) => t.count >= t.total);
  return { questId, tasks, completed, completedAt: completed ? (completedAt ?? MOCK_NOW - 2 * HOUR) : null, retired: false };
};

const day = (d: number, quests: Omit<PlayerQuest, "intervalId">[]): PlayerQuests => ({
  playerId: PLAYER_ID,
  day: d,
  startTime: d * DAY,
  endTime: (d + 1) * DAY,
  quests: quests.map((q) => ({ ...q, intervalId: d - QUESTS_FROM })),
});

/** Today, under way: Daily Run done, Master Builder 4 of 6, Into the Woods not started, Point Chaser 2,710 of 3,000. */
export const QUESTS_TODAY = day(TODAY, [
  quest(1, [task(GAME_FINISHED, 1, 1)], MOCK_NOW - 3 * HOUR),
  quest(2, [task(STRUCTURE_SCORED, 6, 4)]),
  quest(3, [task(FOREST_SCORED, 1, 0)]),
  quest(4, [task(POINTS, 3_000, 2_710)]),
]);

/** Yesterday, closed: all four done. */
export const QUESTS_ALL_DONE = day(TODAY - 1, [
  quest(1, [task(GAME_FINISHED, 1, 1)], (TODAY - 1) * DAY + 9 * HOUR),
  quest(2, [task(STRUCTURE_SCORED, 6, 9)], (TODAY - 1) * DAY + 11 * HOUR),
  quest(3, [task(FOREST_SCORED, 1, 2)], (TODAY - 1) * DAY + 11 * HOUR),
  quest(4, [task(POINTS, 3_000, 4_410)], (TODAY - 1) * DAY + 17 * HOUR),
]);

/** A past day the player did not play: every count at 0. */
export const QUESTS_IDLE = day(TODAY - 4, [
  quest(1, [task(GAME_FINISHED, 1, 0)]),
  quest(2, [task(STRUCTURE_SCORED, 6, 0)]),
  quest(3, [task(FOREST_SCORED, 1, 0)]),
  quest(4, [task(POINTS, 3_000, 0)]),
]);

/** A day before the dailies were defined: none active. */
export const QUESTS_NONE = day(QUESTS_FROM - 2, []);

const achievement = (achievementId: number, points: number, tasks: TaskProgress[], completedAt: number | null = null): PlayerAchievement => {
  const completed = tasks.every((t) => t.count >= t.total);
  return { achievementId, points, tasks, completed, completedAt: completed ? (completedAt ?? MOCK_NOW - 6 * DAY) : null, retired: false };
};

const achievements = (list: PlayerAchievement[]): PlayerAchievements => ({
  playerId: PLAYER_ID,
  points: list.filter((a) => a.completed).reduce((sum, a) => sum + a.points, 0),
  achievements: list,
});

/** The player's nine: four earned, three in progress, two locked (nothing counted yet). */
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
