import type { Definitions, PlayerQuests, QuestDefinition } from "@paved/chain";
import { DAY_S, WEEK_START_S, questPeriod } from "../../lib/quest-window";

// The fourth and fifth weeklies of the mock (#976, the owner's decisions of 2026-11-01, open point 1's default: two on the PvP).
// The fresh `Setup` defines three weeklies on the Challenge; until the contracts define these two (#738), the mock's indexer
// (`indexer.ts`) adds them to its definitions (`definitions.ts`) and counts them from the player's settled PvP attacks, as
// `Setup.report_pvp` reports each one (tasks 19 to 22, `constants.cairo`), by UTC week (Monday to Sunday). The ledger's
// week's milestones count the weeklies done through the same indexer.

const WEEK_S = 7 * DAY_S;

/** The PvP's tasks (`TaskId` of the contracts, `constants.cairo`): an attack settled, its stars, a win, three stars. */
export const PVP_TASK = { attack: 19, stars: 20, win: 21, threeStars: 22 } as const;

/** The PvP weeklies: Weekly Raider (10 attacks settled) and Weekly Stars (15 stars), the mock's ids, the next free ones. */
export const MOCK_PVP_WEEKLIES: readonly { questId: number; taskId: number; total: number }[] = [
  { questId: 20, taskId: PVP_TASK.attack, total: 10 },
  { questId: 21, taskId: PVP_TASK.stars, total: 15 },
];

/** A settled attack's report to the quests (`Setup.report_pvp`): one attack, and with stars its stars and a win, and three a three-star. */
export function pvpCounts(stars: number): Partial<Record<number, number>> {
  return {
    [PVP_TASK.attack]: 1,
    ...(stars > 0 && { [PVP_TASK.stars]: stars, [PVP_TASK.win]: 1 }),
    ...(stars === 3 && { [PVP_TASK.threeStars]: 1 }),
  };
}

const definitionOf = (q: (typeof MOCK_PVP_WEEKLIES)[number], definedAt: number): QuestDefinition => ({
  questId: q.questId,
  startTime: WEEK_START_S,
  endTime: 0,
  duration: WEEK_S,
  interval: WEEK_S,
  tasks: [{ taskId: q.taskId, total: q.total }],
  conditions: [],
  definedAt,
  retired: false,
  retiredAt: null,
  cobbles: 0,
  cobblesKind: null,
});

const schedule = (d: QuestDefinition) => ({ start: d.startTime, interval: d.interval, duration: d.duration });

/** The PvP weeklies the indexer does not have (an id it defines is left as it is), beside its own, once any weekly is defined. */
function pvpOf(definitions: Definitions): QuestDefinition[] {
  const weeklies = definitions.quests.filter((q) => !q.retired && questPeriod(schedule(q)) === "weekly");
  if (weeklies.length === 0) return [];
  const defined = new Set(definitions.quests.map((q) => q.questId));
  const definedAt = Math.min(...weeklies.map((q) => q.definedAt));
  return MOCK_PVP_WEEKLIES.filter((q) => !defined.has(q.questId)).map((q) => definitionOf(q, definedAt));
}

/** The definitions with the two PvP weeklies. */
export function withMockWeeklies(definitions: Definitions): Definitions {
  const pvp = pvpOf(definitions);
  return pvp.length === 0 ? definitions : { ...definitions, quests: [...definitions.quests, ...pvp] };
}

/** The weeklies done in a day's progress: those whose definition is a weekly's (the week's, live that day). */
export function weekliesDone(definitions: Definitions, progress: PlayerQuests): number {
  const weekly = new Set(definitions.quests.filter((d) => questPeriod(schedule(d)) === "weekly").map((d) => d.questId));
  return progress.quests.filter((q) => q.completed && weekly.has(q.questId)).length;
}

/** The first UTC day of `week` (week 0 from Monday 1970-01-05, as `weekOfDay` counts it). */
export const firstDayOfWeek = (week: number): number => (WEEK_START_S + week * WEEK_S) / DAY_S;
