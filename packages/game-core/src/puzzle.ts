import { DECKS } from "./engine/decks";
import { withdrawExtra } from "./engine/draw";
import { PlanType } from "./types/plan";

// The Puzzle (Play's Limited mode, `docs/architecture/puzzle-mode.md`): every player plays the same deck of the day, a Training game's
// 38 tiles, each game drawing them in its own order from the VRF; the day's best score wins its prize. The rules the client and the
// contracts share: the day, its deck, the prize and the order of a day's ranking.

/** A Puzzle day: a UTC day, the leaderboard's and the Challenge's (`timestamp / 86400`). */
export const PUZZLE_DAY_S = 86_400;

/** What the day's first place wins: Cobbles, claimed from the mailbox once the day is over. No XP, no chest. */
export const PUZZLE_PRIZE_COBBLES = 250;

/** The tiles a Puzzle game plays, the starter included: a Training game's (the simple deck's count). */
export const PUZZLE_TILES = DECKS.simple.count;

/** The day of a time, in seconds since the epoch. */
export const puzzleDayOf = (seconds: number): number => Math.floor(seconds / PUZZLE_DAY_S);

/** When a day ends (its next day's start), in seconds since the epoch: a game ranks only when it ends before. */
export const puzzleDayEnd = (day: number): number => (day + 1) * PUZZLE_DAY_S;

/**
 * The day's deck: the 38 cards every game of the day deals, the starter first, then the base deck's cards the day's seed keeps, in
 * deck order (the cards `withdrawExtra` does not withdraw, as a game's start withdraws them with `deckSeed`). Public: the deck is the
 * puzzle; the order each game draws it in is not.
 */
export function puzzleDeck(daySeed: bigint): PlanType[] {
  const rules = DECKS.simple;
  const out = withdrawExtra(1n << BigInt(rules.starter), daySeed, rules.total, rules.count);
  const deck: PlanType[] = [rules.plan(rules.starter + 1)];
  for (let index = 0; index < rules.total; index++) if ((out & (1n << BigInt(index))) === 0n) deck.push(rules.plan(index + 1));
  return deck;
}

/** One player's result of a day: their best score and when it was set (seconds), which breaks a tie. */
export interface PuzzleResult {
  score: number;
  at: number;
}

/**
 * A day's ranking: the best score first; an equal score set earlier ranks first (the earlier submission keeps its place, as the
 * Daily tournaments ranked). Each entry with its place, 1 first.
 */
export function rankPuzzle<T extends PuzzleResult>(results: readonly T[]): (T & { place: number })[] {
  return [...results].sort((a, b) => b.score - a.score || a.at - b.at).map((r, i) => ({ ...r, place: i + 1 }));
}

/** The place a result would take among `others` (the player's own left out): one more than the results ranked above it. */
export function puzzlePlaceAmong(result: PuzzleResult, others: readonly PuzzleResult[]): number {
  return 1 + others.filter((o) => o.score > result.score || (o.score === result.score && o.at < result.at)).length;
}
