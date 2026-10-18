import { Base } from "./elements/decks/base";
import { PlanType } from "./types/plan";

/** One plan of the deck sheet. */
export interface DeckSheetPlan {
  /** Chain plan id (`PlanType`'s index, as `BoardTile.plan`). */
  plan: number;
  /** The plan's nine letters. */
  code: string;
  /** Cards of this plan in the deck. */
  total: number;
  /** Cards of this plan on the board (the starter included), at most `total`. */
  placed: number;
}

export interface DeckSheetCounts {
  plans: DeckSheetPlan[];
  /** Cards in the deck. */
  total: number;
  /** Cards on the board. */
  placed: number;
  /** Cards discarded: the plans of the discards are not kept, so they cross out no chip. */
  discarded: number;
}

/** The base deck as a list of plans, one per card. */
export const baseDeckPlans = (): PlanType[] => Array.from({ length: Base.count() }, (_, i) => Base.plan(i));

/**
 * What the deck sheet shows (#540), per plan: the cards of `deck`, the ones already on the board crossed out. Only what the
 * deck and the played tiles say: the withdrawn cards of the game are not an input, so the sheet cannot reveal them.
 * `deck` is an input (a Story level brings its own); `placedPlans` are the chain plan ids of the board's tiles.
 */
export function deckSheetCounts(deck: readonly PlanType[], placedPlans: readonly number[], discarded = 0): DeckSheetCounts {
  const ids = Object.values(PlanType);
  const total = new Map<number, number>();
  for (const plan of deck) {
    const id = ids.indexOf(plan);
    total.set(id, (total.get(id) ?? 0) + 1);
  }
  const placed = new Map<number, number>();
  for (const id of placedPlans) placed.set(id, (placed.get(id) ?? 0) + 1);
  const plans = [...total.entries()]
    .sort(([a], [b]) => a - b)
    .map(([plan, count]) => ({ plan, code: ids[plan]!, total: count, placed: Math.min(count, placed.get(plan) ?? 0) }));
  return { plans, total: deck.length, placed: plans.reduce((n, p) => n + p.placed, 0), discarded: Math.max(0, discarded) };
}
