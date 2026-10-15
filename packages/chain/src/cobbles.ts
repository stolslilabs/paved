import type { Decoded } from "./codec";

// The Cobbles of `Setup` (P-61, `docs/architecture/cobbles-v1.md`, part 1, CORE #440): the ledger's views, as the
// client reads them. The claims are `PavedWriter`'s (`claimQuest`, `claimAchievement`, `claimDailyCredit`,
// `claimWeeklyCredit`, `claim` for several in one multicall).

/** The calendar of the ledger (`setup.cairo`): a day is `t / DAY`; week 0 runs from Monday 1970-01-05 (`WEEK_START`). */
export const COBBLE_DAY = 86_400;
export const COBBLE_WEEK = 604_800;
export const COBBLE_WEEK_START = 345_600;

/** The week number a UTC day falls in (Monday to Sunday), as the ledger and the indexer's `/claims` count it; null before week 0. */
export function weekOfDay(day: number): number | null {
  const time = day * COBBLE_DAY;
  return time < COBBLE_WEEK_START ? null : Math.floor((time - COBBLE_WEEK_START) / COBBLE_WEEK);
}

/** A quest's claim period: daily (a day number) or weekly (a week number). `QuestCobbles.kind` 1 and 2. */
export type CobbleKind = "daily" | "weekly";

/** `Setup.account(player_id)`: the Cobbles, the free-game credits, the lifetime counts and the claimed achievements. */
export interface CobbleAccount {
  cobbles: number;
  /** Free Challenge games left, spent by `Challenge.spawn_free`. */
  credits: number;
  games: number;
  forests: number;
  wonders: number;
  big: number;
  high: number;
  /** Bit `i` is achievement `i`, claimed. */
  achievementsClaimed: bigint;
}

/** `Setup.day_progress(player_id, day)` and `week_progress(player_id, week)`: the period's sums and its claims. */
export interface PeriodProgress {
  games: number;
  structures: number;
  forests: number;
  points: number;
  /** Bit `i` is quest `i`, claimed for that period. */
  claimed: bigint;
  /** The period's free-game credit is claimed. */
  credit: boolean;
}

/** `Setup.quest_cobbles(quest_id)`: `cobbles` 0 is a quest with none (`kind` null then). */
export interface QuestCobbles {
  questId: number;
  cobbles: number;
  kind: CobbleKind | null;
  task: number;
  total: number;
  start: number;
  interval: number;
}

/** `Setup.achievement_cobbles(achievement_id)`: `cobbles` 0 is an achievement with none. */
export interface AchievementCobbles {
  achievementId: number;
  cobbles: number;
  task: number;
  total: number;
}

/** The struct fields of the four views, in ABI order (camelCased); a test checks them against `contracts/abis/Setup.json`. */
export const COBBLE_VIEW_FIELDS = {
  "paved::systems::setup::Account": ["cobbles", "credits", "games", "forests", "wonders", "big", "high", "achievementsClaimed"],
  "paved::systems::setup::Progress": ["games", "structures", "forests", "points", "claimed", "credit"],
  "paved::systems::setup::QuestCobbles": ["cobbles", "kind", "task", "total", "start", "interval"],
  "paved::systems::setup::AchievementCobbles": ["cobbles", "task", "total"],
};

/**
 * The reads of the Cobbles ledger on `Setup`. `RpcGameViews` implements them (a `not-configured` `ViewError` without a Setup
 * address) and `FakeGameViews` answers them in memory; `GameViews` does not require them, so a views double without Cobbles
 * still satisfies it.
 */
export interface CobbleViews {
  account(playerId: string): Promise<CobbleAccount>;
  dayProgress(playerId: string, day: number): Promise<PeriodProgress>;
  weekProgress(playerId: string, week: number): Promise<PeriodProgress>;
  questCobbles(questId: number): Promise<QuestCobbles>;
  achievementCobbles(achievementId: number): Promise<AchievementCobbles>;
}

export type Struct = Record<string, Decoded>;
const int = (v: Decoded | undefined): number => Number(v ?? 0);
const word = (v: Decoded | undefined): bigint => BigInt((v as number | bigint | string | undefined) ?? 0);

export const cobbleAccount = (s: Struct): CobbleAccount => ({
  cobbles: int(s.cobbles),
  credits: int(s.credits),
  games: int(s.games),
  forests: int(s.forests),
  wonders: int(s.wonders),
  big: int(s.big),
  high: int(s.high),
  achievementsClaimed: word(s.achievementsClaimed),
});

export const periodProgress = (s: Struct): PeriodProgress => ({
  games: int(s.games),
  structures: int(s.structures),
  forests: int(s.forests),
  points: int(s.points),
  claimed: word(s.claimed),
  credit: s.credit === true,
});

export const questCobbles = (questId: number, s: Struct): QuestCobbles => ({
  questId,
  cobbles: int(s.cobbles),
  kind: int(s.cobbles) === 0 ? null : int(s.kind) === 2 ? "weekly" : int(s.kind) === 1 ? "daily" : null,
  task: int(s.task),
  total: int(s.total),
  start: int(s.start),
  interval: int(s.interval),
});

export const achievementCobbles = (achievementId: number, s: Struct): AchievementCobbles => ({
  achievementId,
  cobbles: int(s.cobbles),
  task: int(s.task),
  total: int(s.total),
});

/** One claim of the Cobbles ledger, as `PavedWriter.claim` sends it (several in one multicall). */
export type CobbleClaim =
  | { kind: "quest"; questId: number; period: number }
  | { kind: "achievement"; achievementId: number }
  | { kind: "credit"; credit: CobbleKind; period: number };

/** A player's state in `FakeGameViews`: the account, and the progress of each day and week. */
export interface FakeCobblePlayer {
  account: CobbleAccount;
  days: Map<number, PeriodProgress>;
  weeks: Map<number, PeriodProgress>;
}

export const NO_ACCOUNT: CobbleAccount = { cobbles: 0, credits: 0, games: 0, forests: 0, wonders: 0, big: 0, high: 0, achievementsClaimed: 0n };
export const NO_PROGRESS: PeriodProgress = { games: 0, structures: 0, forests: 0, points: 0, claimed: 0n, credit: false };
