import type { PvpPlayer } from "../lib/pvp-rules";
import { NEXT_PRICE } from "../lib/pvp-rules";
import { ATTACK_STAR_PERCENTS, ATTACK_VIEW, attackDeckSize, attackStars } from "../lib/pvp-v2-rules";
import type { PvpAttackSceneProps } from "../components/scenes/pvp-attack-scene";
import type { PvpScoutSceneProps } from "../components/scenes/pvp-scout-scene";
import { MOCK_NOW } from "./clock";
import { STAKES } from "./pvp";
import { attackDeckOf, buildFreeVillage, placedPlans, playAttackV2, type AttackStep } from "./pvp-attack";

/**
 * The PvP v2 attack's fakes (#740, step 1 of #732), played on the engine: a rival's free village of S = 8 + level slots,
 * the attack's deck of ceil(1.15 x S) tiles (the village's placed tiles and extras from the base deck, shuffled), played on
 * an unbounded board from the starter, the tile in hand and the next two shown, stars at 80 / 90 / 100 %.
 */

/** The defender: level 12, so 20 slots and a deck of 23 tiles. */
export const RIVAL_V2: PvpPlayer = { name: "Wren of Hollowmere", address: "0x05c8f3a2b1d4e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f2", level: 12, crowns: 1_236 };

/** The rival's slots: 8 + level (#741). */
export const RIVAL_V2_SLOTS = 8 + RIVAL_V2.level;
/** The attack's deck: ceil(1.15 x 20) = 23. */
export const V2_DECK_SIZE = attackDeckSize(RIVAL_V2_SLOTS);

/** The rival's village: every slot filled, 20 tiles past the starter. */
export const RIVAL_V2_VILLAGE = buildFreeVillage(31, RIVAL_V2_SLOTS);
/** The attack's deck, in draw order: the village's 20 tiles and 3 extras. */
export const V2_DECK = attackDeckOf(RIVAL_V2_VILLAGE, V2_DECK_SIZE, 7);
/** The attack played in the stories, every move kept. */
export const V2_ATTACK_STEPS = playAttackV2(V2_DECK, 5);

/** A scene's data without its callbacks. */
type Data<P> = { [K in keyof P as K extends `on${string}` ? never : K]: P[K] };

// Scout

const SMALL_VILLAGE = buildFreeVillage(11, 9);

const deck = { slots: RIVAL_V2_SLOTS, size: V2_DECK_SIZE, placed: placedPlans(RIVAL_V2_VILLAGE).length };
const scout = { defender: RIVAL_V2, village: RIVAL_V2_VILLAGE, stakes: STAKES, deck, starPercents: ATTACK_STAR_PERCENTS, next: { price: NEXT_PRICE, balance: 640 }, now: MOCK_NOW };

export const PVP_V2_SCOUT = {
  ready: scout,
  attacking: { ...scout, pending: "attacking" },
  /** A level-1 village: 9 slots, a deck of 11 tiles. */
  small: { ...scout, defender: { ...RIVAL_V2, level: 1 }, village: SMALL_VILLAGE, deck: { slots: 9, size: attackDeckSize(9), placed: placedPlans(SMALL_VILLAGE).length } },
} satisfies Record<string, Data<PvpScoutSceneProps>>;

// Attack

/**
 * The attack scene at step `i` of `steps`: the board with no territory, the score against the 80 / 90 / 100 % marks, the tile
 * in hand and the next two of the deck (`ATTACK_VIEW`), the deck's tiles left.
 */
export function attackV2At(steps: readonly AttackStep[], i: number): Data<PvpAttackSceneProps> {
  const at = Math.min(i, steps.length - 1);
  const step = steps[at]!;
  const coming = steps.slice(at + 1, at + ATTACK_VIEW).flatMap((s) => (s.hand ? [{ plan: s.hand.plan }] : []));
  return {
    defender: RIVAL_V2,
    target: RIVAL_V2_VILLAGE.score,
    starPercents: ATTACK_STAR_PERCENTS,
    tiles: step.tiles,
    score: step.score,
    delta: step.delta,
    lastScored: step.lastScored,
    remaining: step.remaining,
    hand: { tile: step.hand, state: step.hand ? "placing" : "empty", coming, fitsNowhere: step.hand !== null && step.slots.length === 0 },
    slots: step.slots,
    pilePlans: V2_DECK,
  };
}

/** The tile in hand at step `i` placed where the attack puts it next: the bubble on it, its points over the score. */
function placedV2At(i: number): Data<PvpAttackSceneProps> {
  const base = attackV2At(V2_ATTACK_STEPS, i);
  const next = V2_ATTACK_STEPS[i + 1]!;
  const tile = next.placed!;
  return {
    ...base,
    hand: { ...base.hand, tile: { plan: tile.plan, orientation: tile.orientation }, slotChosen: true, preview: next.delta },
    ghost: { x: tile.x, y: tile.y, plan: tile.plan, orientation: tile.orientation, placed: true, fits: true },
    bubble: { cell: { x: tile.x, y: tile.y }, rotations: 1, onRotate: () => {}, onClose: () => {}, onDiscard: () => {}, onConfirm: () => {}, canConfirm: true },
  };
}

const stars = (s: AttackStep) => attackStars(s.score, RIVAL_V2_VILLAGE.score);
/** The first step at the first star. */
export const V2_ONE_STAR = V2_ATTACK_STEPS.findIndex((s) => stars(s) >= 1);
/** The first step at two stars. */
export const V2_TWO_STARS = V2_ATTACK_STEPS.findIndex((s) => stars(s) >= 2);
/** A step halfway through the deck, a tile placed next. */
export const V2_MIDWAY = V2_ATTACK_STEPS.findIndex((s, i) => i >= 10 && V2_ATTACK_STEPS[i + 1]?.placed);
const last = V2_ATTACK_STEPS.length - 1;

export const PVP_V2_ATTACK = {
  /** The first tile: the starter alone, the deck whole (23 tiles), the next two shown. */
  start: attackV2At(V2_ATTACK_STEPS, 0),
  midway: attackV2At(V2_ATTACK_STEPS, V2_MIDWAY),
  placed: placedV2At(V2_MIDWAY),
  oneStar: attackV2At(V2_ATTACK_STEPS, V2_ONE_STAR),
  twoStars: attackV2At(V2_ATTACK_STEPS, V2_TWO_STARS),
  /** Two tiles left: the tile in hand and one coming. */
  twoLeft: attackV2At(V2_ATTACK_STEPS, last - 2),
  /** The last tile: none coming. */
  lastTile: attackV2At(V2_ATTACK_STEPS, last - 1),
  /** The deck played out: the final score. */
  end: attackV2At(V2_ATTACK_STEPS, last),
} satisfies Record<string, Data<PvpAttackSceneProps>>;
