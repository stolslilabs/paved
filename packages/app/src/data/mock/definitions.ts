import type { AchievementDefinition, Definitions, QuestDefinition } from "@paved/chain";
import type { GameTally } from "./challenge";

// The quests and achievements of the mock's indexer (#927): the fresh deployment's definitions (quests.md "As built: v2a" and
// "Four dailies a day", `FRESH_QUESTS` of scripts/deploy.sh), as `Setup` defines them, so the missions read no indexer. The
// fifth daily's family (#869) is added beside them by `withMockDailies` (`dailies.ts`), the Cobbles by the ledger's
// `definitions`. Defined from the epoch: every day has its dailies.

/** Task ids (`TaskId` of the contracts, `constants.cairo`). */
export const TASK = { gameFinished: 1, structureScored: 2, points: 3, forestScored: 4, wonderScored: 5, bigStructure: 6, highScore: 7, podium: 8, tutorialFinished: 10 } as const;

/** `constants::HIGH_SCORE`: a game of this score or more counts for task 7. */
export const HIGH_SCORE = 4_000;

const DAY_S = 86_400;

const quest = (questId: number, taskId: number, total: number, startTime: number, interval: number, duration: number): QuestDefinition => ({
  questId,
  startTime,
  endTime: 0,
  duration,
  interval,
  tasks: [{ taskId, total }],
  conditions: [],
  definedAt: 0,
  retired: false,
  retiredAt: null,
  cobbles: 0,
  cobblesKind: null,
});

/** A daily of a 3-day rotation, live when the day number mod 3 is `offset`. */
const rotating = (questId: number, taskId: number, total: number, offset: number) => quest(questId, taskId, total, offset * DAY_S, 3 * DAY_S, DAY_S);
/** A weekly, Monday to Sunday UTC (`start` 345,600: Monday 1970-01-05). */
const weekly = (questId: number, taskId: number, total: number) => quest(questId, taskId, total, 345_600, 7 * DAY_S, 7 * DAY_S);

const achievement = (achievementId: number, taskId: number, total: number, points: number): AchievementDefinition => ({
  achievementId,
  startTime: 0,
  endTime: 0,
  tasks: [{ taskId, total }],
  points,
  definedAt: 0,
  retired: false,
  retiredAt: null,
  cobbles: 0,
});

/** The fresh deployment's definitions: Daily Run, nine rotating dailies, three weeklies and the sixteen achievements. */
export const FRESH_DEFINITIONS: Definitions = {
  quests: [
    quest(1, TASK.gameFinished, 1, 0, DAY_S, DAY_S),
    rotating(5, TASK.structureScored, 4, 0),
    rotating(6, TASK.structureScored, 8, 1),
    rotating(7, TASK.structureScored, 12, 2),
    rotating(8, TASK.forestScored, 2, 0),
    rotating(9, TASK.forestScored, 3, 1),
    rotating(10, TASK.forestScored, 4, 2),
    rotating(11, TASK.points, 2_000, 0),
    rotating(12, TASK.points, 5_000, 1),
    rotating(13, TASK.points, 8_000, 2),
    weekly(14, TASK.forestScored, 5),
    weekly(15, TASK.structureScored, 30),
    weekly(16, TASK.points, 20_000),
  ],
  achievements: [
    achievement(1, TASK.tutorialFinished, 1, 10),
    achievement(2, TASK.gameFinished, 1, 10),
    achievement(3, TASK.gameFinished, 10, 20),
    achievement(4, TASK.gameFinished, 50, 40),
    achievement(5, TASK.bigStructure, 1, 20),
    achievement(6, TASK.forestScored, 10, 20),
    achievement(7, TASK.wonderScored, 1, 30),
    achievement(8, TASK.highScore, 1, 30),
    achievement(9, TASK.podium, 1, 50),
    achievement(10, TASK.forestScored, 50, 40),
    achievement(11, TASK.wonderScored, 10, 50),
    achievement(12, TASK.bigStructure, 10, 40),
    achievement(13, TASK.highScore, 10, 50),
    achievement(14, TASK.highScore, 25, 80),
    achievement(15, TASK.gameFinished, 250, 60),
    achievement(16, TASK.gameFinished, 1_000, 80),
  ],
};

/** A game over's report to the quests (`quest_counts`): tasks 1 to 4. */
export function questCounts(tally: GameTally): Partial<Record<number, number>> {
  return { [TASK.gameFinished]: 1, [TASK.structureScored]: tally.structures, [TASK.points]: tally.score, [TASK.forestScored]: tally.forests };
}

/** A game over's report to the achievements (`achievement_counts`): tasks 1, 4, 5, 6 and 7. */
export function achievementCounts(tally: GameTally): Partial<Record<number, number>> {
  return {
    [TASK.gameFinished]: 1,
    [TASK.forestScored]: tally.forests,
    [TASK.wonderScored]: tally.wonders,
    [TASK.bigStructure]: tally.big,
    [TASK.highScore]: tally.score >= HIGH_SCORE ? 1 : 0,
  };
}
