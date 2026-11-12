import type { ScoreBoost } from "./engine/game";
import { PUZZLE_TILES } from "./puzzle";

// The Joust (the weekly allegiance event, the design proposal of 2026-11-09): an allegiance against an allegiance over a weekend.
// Registration from Monday to Thursday by an Officer or the Leader, the draw on Friday 00:00 UTC inside bands of rating, then until
// Sunday each member plays up to three games of the day's deck (a Training game's 38 tiles, every jouster's cards the same that day,
// each in an order of their own) with one structure doubled; the sum of the ten best jousters decides, and an Elo moves. The rules
// the client and the contracts will share: the calendar, the score, the rating, the pairing and the rewards. Every figure is the
// proposal's, to be calibrated before the contracts. The client runs one joust every week (the owner's ask of 2026-11-10: a new one
// starts when one ends), in place of the proposal's two a season.

/** A joust's week: Monday 00:00 UTC to the next. */
export const JOUST_WEEK_S = 7 * 86_400;
/** The registration's length from the week's start: Monday to Thursday, four days. */
export const JOUST_REGISTRATION_S = 4 * 86_400;
/** The first Monday of the epoch (1970-01-05): the weeks count from it. */
const FIRST_MONDAY_S = 4 * 86_400;

/** The games a member may play in a joust; only their best counts. */
export const JOUST_GAMES = 3;
/** The jousters an allegiance's score adds: its ten best. An empty place counts zero. */
export const JOUST_TOP = 10;
/** The tiles of a joust game, the starter included: a Training game's. */
export const JOUST_TILES = PUZZLE_TILES;
/** Every allegiance's first rating. */
export const JOUST_START_RATING = 1_000;
/** The most a joust moves a rating (the Elo's K). */
export const JOUST_K = 32;
/** The width of a pairing band, in rating points. */
export const JOUST_BAND = 100;
/** The Cobbles each jouster who played claims: the winners' (a bye pays as a win) and the losers'. No XP, no chest. */
export const JOUST_WIN_COBBLES = 50;
export const JOUST_LOSS_COBBLES = 15;

/** The joust week of a time, in seconds since the epoch. */
export const joustWeekOf = (seconds: number): number => Math.floor((seconds - FIRST_MONDAY_S) / JOUST_WEEK_S);
/** When a week starts (Monday 00:00 UTC): its registration opens. */
export const joustWeekStart = (week: number): number => FIRST_MONDAY_S + week * JOUST_WEEK_S;
/** When a week's joust opens (Friday 00:00 UTC): the registration closes, the opponents are drawn, the games start. */
export const joustOpensAt = (week: number): number => joustWeekStart(week) + JOUST_REGISTRATION_S;
/** When a week's joust ends (Sunday 24:00 UTC, the next week's start): a game counts only when it ends before. */
export const joustEndsAt = (week: number): number => joustWeekStart(week + 1);

/** A week's phase: the registration (Monday to Thursday), then the joust (Friday to Sunday). Its result is read the week after. */
export type JoustPhase = "registration" | "live";
export const joustPhaseOf = (seconds: number): JoustPhase => (seconds < joustOpensAt(joustWeekOf(seconds)) ? "registration" : "live");

/** The structure a week's joust doubles: roads and cities in turn. */
export const joustBoostOf = (week: number): ScoreBoost => (Math.abs(week) % 2 === 0 ? "roads" : "cities");

/** The band of a rating: its floor, a multiple of `JOUST_BAND` (1,184 is in the band 1,100 to 1,199). */
export const joustBandOf = (rating: number): number => Math.floor(rating / JOUST_BAND) * JOUST_BAND;

/** The share of a joust an allegiance is expected to win against another, from their ratings (the Elo's, on 400). */
export const joustExpected = (own: number, theirs: number): number => 1 / (1 + 10 ** ((theirs - own) / 400));

/** How a joust ended for an allegiance. */
export type JoustOutcome = "win" | "loss" | "draw";

/** The points a joust moves an allegiance's rating by: `JOUST_K` times the result's distance from the expected one, rounded. */
export function joustRatingChange(own: number, theirs: number, outcome: JoustOutcome): number {
  const result = outcome === "win" ? 1 : outcome === "draw" ? 0.5 : 0;
  return Math.round(JOUST_K * (result - joustExpected(own, theirs)));
}

/** An allegiance's score: the sum of its ten best jousters' bests, then what breaks a tie: the 11th best, the jousters who played. */
export interface JoustScore {
  total: number;
  eleventh: number;
  played: number;
}

/** The score of an allegiance from each jouster's best game (one figure per jouster who finished a game). */
export function joustScore(bests: readonly number[]): JoustScore {
  const sorted = [...bests].sort((a, b) => b - a);
  return { total: sorted.slice(0, JOUST_TOP).reduce((sum, s) => sum + s, 0), eleventh: sorted[JOUST_TOP] ?? 0, played: sorted.length };
}

/**
 * How a joust ends for `own` against `theirs`: the higher total wins; a tie goes to the 11th best, then to the number of jousters
 * who played; a total of zero is a loss whatever the other side did (no empty registrations).
 */
export function joustOutcome(own: JoustScore, theirs: JoustScore): JoustOutcome {
  if (own.total === 0) return "loss";
  const order = own.total - theirs.total || own.eleventh - theirs.eleventh || own.played - theirs.played;
  return order > 0 ? "win" : order < 0 ? "loss" : "draw";
}

/**
 * Friday's draw: the registered allegiances by band (`joustBandOf`), the highest first; each band is shuffled (`random`, in [0, 1))
 * and paired two by two; the odd one out joins the band below, and the very last one gets a bye. Nobody chooses their opponent.
 */
export function joustPairs<T extends { rating: number }>(entries: readonly T[], random: () => number): { pairs: [T, T][]; bye: T | null } {
  const bands = new Map<number, T[]>();
  for (const e of entries) bands.set(joustBandOf(e.rating), [...(bands.get(joustBandOf(e.rating)) ?? []), e]);
  const pairs: [T, T][] = [];
  let carried: T | null = null;
  for (const band of [...bands.keys()].sort((a, b) => b - a)) {
    const pool = bands.get(band)!;
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    // The one carried from the band above meets one of this band first.
    if (carried) pool.unshift(carried);
    carried = pool.length % 2 === 1 ? pool.pop()! : null;
    for (let i = 0; i < pool.length; i += 2) pairs.push([pool[i]!, pool[i + 1]!]);
  }
  return { pairs, bye: carried };
}
