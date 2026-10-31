import type { Definitions, PlayerQuests, QuestDefinition } from "@paved/chain";
import { DAY_S, questPeriod } from "../../lib/quest-window";

// The fifth daily of the mock (#869, the owner's decisions of 2026-10-28, open point 2's default: one more family in the
// rotation). The fresh `Setup` defines Daily Run and three rotating families, four dailies a day; until the contracts define
// the fifth (#738), the mock's indexer (`indexer.ts`) adds a fourth family to its definitions (`definitions.ts`) and counts it
// as it counts the others, from the player's paid Challenge games, so a day can reach five dailies done. The ledger's
// milestone claims count the dailies done through the same indexer.

/** `GAME_FINISHED` (`TaskId` of the contracts, quests.md). */
const GAME_FINISHED = 1;

/** The fourth rotating family: finish 2, 3 or 4 Challenge games in a day, one live a day (day number mod 3 = `offset`). */
export const MOCK_DAILY_FAMILY: readonly { questId: number; total: number; offset: number }[] = [
  { questId: 17, total: 2, offset: 0 },
  { questId: 18, total: 3, offset: 1 },
  { questId: 19, total: 4, offset: 2 },
];

const definitionOf = (q: (typeof MOCK_DAILY_FAMILY)[number], definedAt: number): QuestDefinition => ({
  questId: q.questId,
  startTime: q.offset * DAY_S,
  endTime: 0,
  duration: DAY_S,
  interval: 3 * DAY_S,
  tasks: [{ taskId: GAME_FINISHED, total: q.total }],
  conditions: [],
  definedAt,
  retired: false,
  retiredAt: null,
  cobbles: 0,
  cobblesKind: null,
});

/** The family's definitions the indexer does not have (an id it defines is left as it is), beside its own, once any daily is defined. */
function familyOf(definitions: Definitions): QuestDefinition[] {
  const dailies = definitions.quests.filter((q) => !q.retired && questPeriod({ start: q.startTime, interval: q.interval, duration: q.duration }) === "daily");
  if (dailies.length === 0) return [];
  const defined = new Set(definitions.quests.map((q) => q.questId));
  const definedAt = Math.min(...dailies.map((q) => q.definedAt));
  return MOCK_DAILY_FAMILY.filter((q) => !defined.has(q.questId)).map((q) => definitionOf(q, definedAt));
}

/** The definitions with the fourth family. */
export function withMockDailies(definitions: Definitions): Definitions {
  const family = familyOf(definitions);
  return family.length === 0 ? definitions : { ...definitions, quests: [...definitions.quests, ...family] };
}

const schedule = (d: QuestDefinition) => ({ start: d.startTime, interval: d.interval, duration: d.duration });

/** The dailies done in a day's progress: those whose definition is a daily's. */
export function dailiesDone(definitions: Definitions, progress: PlayerQuests): number {
  const daily = new Set(definitions.quests.filter((d) => questPeriod(schedule(d)) === "daily").map((d) => d.questId));
  return progress.quests.filter((q) => q.completed && daily.has(q.questId)).length;
}
