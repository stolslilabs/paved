import { capScore, formatInteger, formatPercent, winningScore } from "@paved/game-core";
import type { RewardCurve } from "../components/containers/reward-estimate";
import { STAR_PERCENTS, shareOf } from "./pvp-rules";

/*
 * The board's score meter in every mode (GAME-OVERLAY, the owner's ask of 2026-11-08: "une barre de progression comme dans les game en
 * Ranked", restyled to the app's taste and applied to all modes): the bar's fill, its marks and its figure, one rule per mode, in the
 * Missions' even steps (a mark at each step's end, each step filled by its share, as the ends fill their stars). The Attack's stars are
 * the Ranked meter's (#647, #740); Story's say shares only (#593); a Challenge's runs to the score to beat, then to the reward's cap;
 * Training's to the device's best.
 */

/** A mark's painting: a star (the Attack, Story), the trophy (a Challenge's score to beat), the crown (Training's best), the PAVED coin (a Challenge's cap). */
export type MeterArt = "star" | "trophy" | "crown" | "paved";

export interface MeterMark {
  /** Its place on the bar, 0 (the start) to 1 (the end). */
  at: number;
  art: MeterArt;
  /** Lit: the score is there. */
  reached: boolean;
  /** What it stands for, for assistive technology (never a Story threshold). */
  name: string;
}

export interface ScoreMeterValue {
  /** The gold's length, 0 to 1 of the bar. */
  fill: number;
  marks: readonly MeterMark[];
  /** The meter's name for assistive technology. */
  label: string;
  /** Its value in words. */
  valueText: string;
  /**
   * `aria-valuenow` and `aria-valuemax`, whole numbers: percent of the goal where it is public, of the bar in Story. `now` may pass `max`
   * (a Challenge past its cap): the meter holds `aria-valuenow` to the range, the true share in `valueText` and `figure`.
   */
  now: number;
  max: number;
  /** The figure after the bar: the score's share of the goal, or none (Story, #593). */
  figure?: string | null;
}

/**
 * The Attack's share range for assistive technology, the Ranked's (#647): `aria-valuemax` the last mark and this room past it (110 % reads
 * up to 125 %, 100 % up to 115 %).
 */
export const BAR_ROOM = 0.15;

const percent = (share: number) => formatPercent(share, { maxFractionDigits: 0 });
const clamp = (x: number) => Math.min(1, Math.max(0, x));

/**
 * The bar in even steps (the Missions' rail, a node per step): each step from one mark to the next, filled by its share, the marks at the
 * steps' ends; `start` a mark at the bar's start (Story's first star). A goal's own figure is the share after the bar, never its place.
 */
function steps(shares: readonly number[], marks: readonly Omit<MeterMark, "at">[], start?: Omit<MeterMark, "at">) {
  const n = shares.length;
  return {
    fill: shares.reduce((sum, share) => sum + clamp(share), 0) / n,
    marks: [...(start ? [{ ...start, at: 0 }] : []), ...marks.map((mark, i) => ({ ...mark, at: (i + 1) / n }))],
  };
}

/**
 * An attack's meter, the Ranked's (#647): its three stars (`percents`: v1's 70 / 85 / 110 % when left out, v2's 80 / 90 / 100 %, #740) in
 * even steps, each filled from the mark before to its own (the Ranked end's `starFills`), the share of the defender's score after the
 * bar. The stars counted in integers, as the rules count: a share times a score in floating point lands just past a whole point.
 */
export function attackMeter(score: number, target: number, percents: readonly number[] = STAR_PERCENTS): ScoreMeterValue {
  const share = shareOf(score, target);
  const stars = score > 0 ? percents.filter((p) => score * 100 >= p * target).length : 0;
  const pct = percent(share);
  const shares = percents.map((p, i) => {
    const from = i === 0 ? 0 : percents[i - 1]! / 100;
    return i < stars ? 1 : Math.min(0.99, (share - from) / (p / 100 - from));
  });
  return {
    ...steps(
      shares,
      percents.map((p, i) => ({ art: "star", reached: i < stars, name: `Star ${i + 1}: ${p}% of the village` })),
    ),
    label: `Score ${pct} of the target, ${stars} of 3 stars`,
    valueText: `${pct}, ${stars} of 3 stars`,
    now: Math.round(share * 100),
    max: Math.round((percents[percents.length - 1]! / 100 + BAR_ROOM) * 100),
    figure: pct,
  };
}

/**
 * A Story level's meter (#593: shares only, no threshold ever shown): the first star at the start, held by finishing the level; the
 * second at the middle, the third at the end, each half filled by its star's share (`storyStarFills`). Where a mark stands says nothing
 * of the score it needs, and no figure is written.
 */
export function storyMeter(stars: number, fills: readonly number[]): ScoreMeterValue {
  const won = Math.min(Math.max(stars, 0), 3);
  const share = (i: number) => (i < won ? 1 : Math.min(0.99, fills[i] ?? 0));
  const bar = steps(
    [share(1), share(2)],
    [
      { art: "star", reached: won >= 2, name: "Star 2" },
      { art: "star", reached: won >= 3, name: "Star 3" },
    ],
    { art: "star", reached: won >= 1, name: "Star 1: finish the level" },
  );
  return {
    ...bar,
    label: `${won} of 3 stars so far`,
    valueText: `${won} of 3 stars so far`,
    now: Math.round(bar.fill * 100),
    max: 100,
    figure: null,
  };
}

/**
 * A Challenge game's meter (#705): a step to the score to beat at the day's threshold (the trophy, the HUD's "Beat"), then one from there
 * to the score that earns the cap (the PAVED coin, the HUD's "max"); the trophy alone when the two are one (a slope of `H` or more). The
 * share of the score to beat after the bar.
 */
export function challengeMeter(curve: RewardCurve, score: number): ScoreMeterValue {
  const least = winningScore(curve.threshold);
  const cap = capScore(curve.threshold, curve.slopeBps, curve.cap);
  const share = shareOf(score, least);
  const pct = percent(share);
  const beaten = score >= least;
  const trophy = { art: "trophy", reached: beaten, name: `Beat ${formatInteger(least)}` } as const;
  const toBeat = beaten ? 1 : Math.min(0.99, share);
  const bar =
    cap > least
      ? steps([toBeat, clamp((score - least) / (cap - least))], [trophy, { art: "paved", reached: score >= cap, name: `The most PAVED from ${formatInteger(cap)}` }])
      : steps([toBeat], [trophy]);
  return {
    ...bar,
    label: `Score ${pct} of the score to beat`,
    valueText: beaten ? `${pct}, beaten` : `${pct}, not beaten yet`,
    now: Math.round(share * 100),
    max: Math.round((Math.max(cap, least) / least) * 100),
    figure: pct,
  };
}

/**
 * A Puzzle game's meter (Play's Limited mode): one step to the day's first place, the trophy at its end, lit once the score passes it.
 * `target` is the best result of the day, another player's or the player's own (`mine`: their best, to beat for a new one). None while
 * the day has no result.
 */
export function puzzleMeter(target: number | null, score: number, mine = false): ScoreMeterValue | null {
  if (target === null || target <= 0) return null;
  const share = shareOf(score, target);
  const pct = percent(share);
  const beaten = score > target;
  return {
    ...steps([beaten ? 1 : Math.min(0.99, share)], [{ art: "trophy", reached: beaten, name: mine ? `Your best: ${formatInteger(target)}` : `First place: ${formatInteger(target)}` }]),
    label: mine ? `Score ${pct} of your best` : `Score ${pct} of first place`,
    valueText: beaten ? `${pct}, ${mine ? "a new best" : "first place"}` : pct,
    now: Math.round(share * 100),
    max: Math.max(100, Math.round(share * 100)),
    figure: pct,
  };
}

/**
 * A Training game's meter: one step to the device's best (`paved.training-best.v1`, #539), the crown at its end, lit by a new best; the
 * share of the best after the bar. None on the device's first game (no best to beat) or with no storage.
 */
export function trainingMeter(best: number | null, score: number): ScoreMeterValue | null {
  if (best === null || best <= 0) return null;
  const share = shareOf(score, best);
  const pct = percent(share);
  const beaten = score > best;
  return {
    ...steps([beaten ? 1 : Math.min(0.99, share)], [{ art: "crown", reached: beaten, name: `Your best: ${formatInteger(best)}` }]),
    label: `Score ${pct} of your best`,
    valueText: beaten ? `${pct}, a new best` : pct,
    now: Math.round(share * 100),
    max: Math.max(100, Math.round(share * 100)),
    figure: pct,
  };
}

/**
 * A Tournament game's meter (the weekly individual event): one step to the opponent's score, the trophy at its end, lit once the score
 * passes it. None while the opponent has not played (or there is none).
 */
export function tournamentMeter(target: number | null, score: number): ScoreMeterValue | null {
  if (target === null || target <= 0) return null;
  const share = shareOf(score, target);
  const pct = percent(share);
  const beaten = score > target;
  return {
    ...steps([beaten ? 1 : Math.min(0.99, share)], [{ art: "trophy", reached: beaten, name: `Your opponent: ${formatInteger(target)}` }]),
    label: `Score ${pct} of your opponent's`,
    valueText: beaten ? `${pct}, ahead` : pct,
    now: Math.round(share * 100),
    max: Math.max(100, Math.round(share * 100)),
    figure: pct,
  };
}
