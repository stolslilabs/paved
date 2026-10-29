import { DECKS } from "../engine/decks";
import { PlanType } from "../types/plan";

// The rarity of a base plan (PvP v2, #732, #737): its copies among the base deck's 72 cards. The shop's prices, the chests'
// odds and the starter layouts read it. Plans are the contracts' codes, 1 to 19 (`PlanType`'s index).

const PLANS = Object.values(PlanType);

export type Rarity = "common" | "uncommon" | "mythic";

/** The cards of the base deck (`Base.total_count`). */
export const BASE_DECK_CARDS = DECKS.simple.total;

/** The base plans, by code: 1 (`CCCCCCCCC`) to 19 (`WFFFFFFFR`). */
export const BASE_PLAN_CODES: readonly number[] = PLANS.slice(1).map((_, i) => i + 1);

/** A plan with at least this many copies in the base deck is common (5 plans). */
export const COMMON_COPIES = 5;
/** A plan with at least this many copies (and fewer than `COMMON_COPIES`) is uncommon (10 plans); below it, mythic (4 plans). */
export const UNCOMMON_COPIES = 3;

const COPIES: readonly number[] = (() => {
  const copies = new Array<number>(PLANS.length).fill(0);
  for (let card = 0; card < BASE_DECK_CARDS; card++) copies[PLANS.indexOf(DECKS.simple.plan(card))]! += 1;
  return copies;
})();

/** A plan code's copies in the base deck; 0 for a code that is not a base plan. */
export function baseCopies(plan: number): number {
  return Number.isInteger(plan) && plan >= 1 && plan < PLANS.length ? COPIES[plan]! : 0;
}

/** Whether `plan` is a base plan's code (1 to 19). */
export const isPlanCode = (plan: number): boolean => baseCopies(plan) > 0;

/** The rarity of a base plan's code, by its copies; throws for a code that is not one. */
export function rarityOf(plan: number): Rarity {
  const copies = baseCopies(plan);
  if (copies === 0) throw new Error(`Not a plan code: ${plan}`);
  return copies >= COMMON_COPIES ? "common" : copies >= UNCOMMON_COPIES ? "uncommon" : "mythic";
}

/** The plan code of a base deck card (0 to 71, taken modulo 72), as `BaseDeck::plan`. */
export function basePlanOfCard(card: number): number {
  return PLANS.indexOf(DECKS.simple.plan(((card % BASE_DECK_CARDS) + BASE_DECK_CARDS) % BASE_DECK_CARDS));
}

/** The plan code a 252-bit random draws from the base deck's odds: a card `random % 72`. */
export function basePlanOf(random: bigint): number {
  return basePlanOfCard(Number(random % BigInt(BASE_DECK_CARDS)));
}
