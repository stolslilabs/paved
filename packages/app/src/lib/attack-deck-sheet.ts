import { PlanType } from "@paved/game-core";

// The deck sheet of a PvP v2 attack (#789, owner decisions of 2026-10-26): the attack's deck is every tile the defender
// placed plus extras drawn at random, in a hidden order. The sheet shows what the attacker can know: the defender's tiles by
// plan (their village is in view), the extras as unknown cards, the cards played crossed out and the three tiles seen (the
// one in hand and the next two) marked. The order is never shown.

/** Where a card of the attack's deck stands: on the board, discarded, in hand, among the next two, or not drawn yet. */
export type AttackCardState = "placed" | "discarded" | "hand" | "next" | "left";

/** One card of the attack's deck: its plan (chain id), or null for an extra not drawn yet (the unknown card). */
export interface AttackCard {
  plan: number | null;
  state: AttackCardState;
}

/** The defender's cards of one plan. */
export interface AttackDeckPlan {
  plan: number;
  code: string;
  /** One per card: the ones out first, then the seen ones, then those left. */
  cards: AttackCardState[];
}

export interface AttackDeckSheet {
  /** The defender's tiles, by plan, in the plans' order. */
  plans: AttackDeckPlan[];
  /** The extras: the ones revealed (played or seen) first, as their plan, then the unknown ones. */
  extras: AttackCard[];
  /** The deck's size. */
  size: number;
  placed: number;
  discarded: number;
  /** The tiles still to draw, the one in hand included: `size - placed - discarded`. */
  left: number;
}

export interface AttackDeckInput {
  /** The defender's placed tiles (chain plan ids), the starter left out: every one is in the deck. */
  defenderPlans: readonly number[];
  /** The deck's size, ceil(1.15 x S); never fewer than the defender's tiles. */
  size: number;
  /** The moves played, in order, each with the plan it played. */
  moves: readonly { readonly plan: number; readonly discard: boolean }[];
  /** The tile in hand and the next two (fewer at the deck's end). */
  view: readonly number[];
}

/**
 * The attack's deck as the sheet shows it. A played or seen plan takes one of the defender's cards of that plan while some are
 * left, else an extra, which then shows that plan (#789 open point 1): the order is hidden, so the sheet never claims more than
 * the plans say. Each card is counted once, so the tiles left plus the played ones always make the deck's size.
 */
export function attackDeckSheet({ defenderPlans, size, moves, view }: AttackDeckInput): AttackDeckSheet {
  const ids = Object.values(PlanType);
  const groups = new Map<number, AttackDeckPlan>();
  for (const plan of [...defenderPlans].sort((a, b) => a - b)) {
    const group = groups.get(plan) ?? { plan, code: ids[plan] ?? "", cards: [] };
    group.cards.push("left");
    groups.set(plan, group);
  }
  const total = Math.max(Math.floor(size), defenderPlans.length);
  const extras: AttackCard[] = Array.from({ length: total - defenderPlans.length }, () => ({ plan: null, state: "left" }));
  const take = (plan: number, state: AttackCardState) => {
    const cards = groups.get(plan)?.cards;
    const i = cards?.indexOf("left") ?? -1;
    if (cards && i >= 0) {
      cards[i] = state;
      return;
    }
    const extra = extras.find((e) => e.plan === null);
    if (extra) Object.assign(extra, { plan, state });
  };
  for (const move of moves) take(move.plan, move.discard ? "discarded" : "placed");
  view.forEach((plan, i) => take(plan, i === 0 ? "hand" : "next"));
  const plans = [...groups.values()];
  const all = [...plans.flatMap((p) => p.cards), ...extras.map((e) => e.state)];
  const count = (state: AttackCardState) => all.filter((s) => s === state).length;
  const placed = count("placed");
  const discarded = count("discarded");
  return { plans, extras, size: total, placed, discarded, left: total - placed - discarded };
}
