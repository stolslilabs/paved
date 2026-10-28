import type { Definitions, IndexedGame, PlayerGames, PlayerQuest, PlayerQuests, QuestDefinition } from "@paved/chain";
import { DAY_S, isLiveOnDay, questPeriod, questWindow } from "../../lib/quest-window";

// The fifth daily of the mock (#869, the owner's decisions of 2026-10-28, open point 2's default: one more family in the
// rotation). The deployed `Setup` defines Daily Run and three rotating families, four dailies a day; until the contracts
// define the fifth (#738), the mock's indexer overlay (`overlay.ts`, `mockIndexer`) adds a fourth family to the definitions
// and its live quest to each day's progress, counted from the player's own paid Challenge games, so a day can reach five
// dailies done. The ledger's milestone claims count the dailies done through the same overlay.

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

/** The indexer's definitions with the fourth family. */
export function withMockDailies(definitions: Definitions): Definitions {
  const family = familyOf(definitions);
  return family.length === 0 ? definitions : { ...definitions, quests: [...definitions.quests, ...family] };
}

/** Whether a day's progress needs the player's games: a daily of the indexer is live that day, and the family adds one. */
export function needsMockDailies(definitions: Definitions, progress: PlayerQuests): boolean {
  return progress.quests.length > 0 && familyOf(definitions).some((d) => isLiveOnDay(schedule(d), progress.day));
}

const schedule = (d: QuestDefinition) => ({ start: d.startTime, interval: d.interval, duration: d.duration });

/** How long a Challenge game can run: it expires 24 h after it starts (`views.cairo`, `expires_at`). */
const GAME_LIFE_S = DAY_S;

/**
 * The player's Challenge games that can have ended on `day`, from the indexer's pages (newest first by start time, `page`
 * reads the one after the cursor `before`): every page down to the first game started more than a game's life before the day,
 * so a day's games are all read however many newer games came after them.
 */
export async function gamesUpTo(day: number, page: (before: string | undefined) => Promise<PlayerGames>): Promise<IndexedGame[]> {
  const games: IndexedGame[] = [];
  let before: string | undefined;
  for (;;) {
    const answer = await page(before);
    games.push(...answer.games);
    const oldest = answer.games.at(-1);
    if (answer.next === null || !oldest || oldest.startTime < day * DAY_S - GAME_LIFE_S) return games;
    before = answer.next;
  }
}

/**
 * When a game finished, as far as the indexer knows. `GameOver.end_time` is set only for a game over on the UTC day it started
 * (`end_in_day`, `playable.cairo`); one finished on a later day reports 0, yet its quests count on its finish. The mock's
 * estimate: the day after its start (a game lives 24 h, `GAME_LIFE_S`), at that day's start. A known limit of the mock (#869,
 * the Overseer's ruling): a game surrendered more than a day after its start (`surrender` checks no expiry) counts on that day
 * instead of its finish day, and `gamesUpTo` reads no game started earlier. The indexer must expose a finish time for such
 * games for the fifth daily to be exact (#738).
 */
export function finishedAt(game: IndexedGame): number {
  return game.endTime > 0 ? game.endTime : (Math.floor(game.startTime / DAY_S) + 1) * DAY_S;
}

/**
 * A day's progress with the family's live quest, its count the player's paid Challenge games over in that UTC day (as the
 * contract reports a daily: the games that finish that day, those started the day before included; a free game reports none),
 * done when the game that reached its total finished (`finishedAt`). Nothing is added to a day with no daily live (before the
 * quests were defined).
 */
export function withMockDailyProgress(definitions: Definitions, progress: PlayerQuests, games: readonly IndexedGame[]): PlayerQuests {
  if (!needsMockDailies(definitions, progress)) return progress;
  const ends = games
    // A free game reports no quest progress (`Challenge.finish`, cobbles v1 4.2): it counts for no daily.
    .filter((g) => g.contract === "challenge" && !g.free && g.over && Math.floor(finishedAt(g) / DAY_S) === progress.day)
    .map(finishedAt)
    .sort((a, b) => a - b);
  const added = familyOf(definitions)
    .filter((d) => isLiveOnDay(schedule(d), progress.day))
    .map((d): PlayerQuest => {
      const w = questWindow(schedule(d), progress.day * DAY_S);
      const total = d.tasks[0]!.total;
      const count = Math.min(ends.length, total);
      const completed = count >= total;
      return {
        questId: d.questId,
        intervalId: w.active ? w.intervalId : w.intervalId + 1,
        tasks: [{ taskId: GAME_FINISHED, total, count }],
        completed,
        completedAt: completed ? ends[total - 1]! : null,
        retired: false,
      };
    });
  return { ...progress, quests: [...progress.quests, ...added] };
}

/** The dailies done in a day's progress: those whose definition is a daily's. */
export function dailiesDone(definitions: Definitions, progress: PlayerQuests): number {
  const daily = new Set(definitions.quests.filter((d) => questPeriod(schedule(d)) === "daily").map((d) => d.questId));
  return progress.quests.filter((q) => q.completed && daily.has(q.questId)).length;
}
