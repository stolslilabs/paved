/**
 * The PvP v2 attack's rules as the screens read them (#740, step 1 of #732; owner decisions of 2026-10-24): an unbounded
 * board from the starter, a deck of ceil(1.15 x S) tiles (S the defender's slots), the tile in hand and the next two shown,
 * stars at 80 / 90 / 100 % of the village's score. The rules themselves are game-core's (#741, `rules/attack.ts`): these
 * carry the same names and figures until that lands, then re-export it; `__tests__/pvp-v2.test.tsx` checks the figures.
 */

/** The deck is `ATTACK_DECK_PERCENT` % of the defender's slots, rounded up. */
export const ATTACK_DECK_PERCENT = 115;
/** The tiles the attacker sees: the one in hand and the next two. */
export const ATTACK_VIEW = 3;
/** The star marks, in whole percent of the village's score. */
export const ATTACK_STAR_PERCENTS = [80, 90, 100] as const;

/** The deck of an attack on a village of `slots` slots: ceil(1.15 x S), in integers. */
export function attackDeckSize(slots: number): number {
  return Math.floor((ATTACK_DECK_PERCENT * Math.max(0, Math.floor(slots)) + 99) / 100);
}

/** The extras of a deck of `slots` against `placed` defender tiles: the base deck's tiles added to the defender's. */
export const attackExtras = (placed: number, slots: number): number => Math.max(0, attackDeckSize(slots) - placed);

/** The stars an attack's score earns against the village's `target`: 0 for a score of 0, else the marks reached. */
export function attackStars(score: number, target: number): number {
  if (score <= 0) return 0;
  return ATTACK_STAR_PERCENTS.filter((p) => score * 100 >= p * target).length;
}

/** The least whole score of each star against `target`. */
export function attackStarPoints(target: number): [number, number, number] {
  return ATTACK_STAR_PERCENTS.map((p) => Math.floor((p * target + 99) / 100)) as [number, number, number];
}
