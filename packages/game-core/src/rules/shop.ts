import { poseidon } from "../engine/draw";
import { BASE_PLAN_CODES, rarityOf, type Rarity } from "./rarity";

// The daily tile shop (PvP v2, #732, #737, owner decisions of 2026-10-24): 3 base plans a day, the same for everyone, drawn
// from the date (fully predictable, which is fine); prices by rarity in round values; each offer bought at most once a day
// per player, all three allowed. Bought with Cobbles, into the inventory.

/** The offers of a day. */
export const SHOP_OFFERS = 3;

/** The price of a tile by its rarity, in Cobbles (#737 open point 1: 10 / 20 / 50). */
export const SHOP_PRICES: Readonly<Record<Rarity, number>> = { common: 10, uncommon: 20, mythic: 50 };

/** A day is 86,400 s from the Unix epoch (UTC on the device, the chain day on chain). */
export const DAY_S = 86_400;

const SHOP = 0x53484f50n; // 'SHOP'

/** The day of a time in seconds. */
export const dayOf = (seconds: number): number => Math.floor(seconds / DAY_S);

/** When a day's shop ends (the next one's start), in seconds. */
export const shopEndsAt = (day: number): number => (day + 1) * DAY_S;

/** An offer of the shop: its slot (0 to 2), plan code, rarity and price. */
export interface ShopOffer {
  readonly slot: number;
  readonly plan: number;
  readonly rarity: Rarity;
  readonly price: number;
}

/**
 * The day's 3 offers: 3 distinct plans drawn uniformly among the 19 (a partial Fisher-Yates, the `k`-th pick
 * `Poseidon('SHOP', day, k) % (19 - k)`), so a mythic shows about one day in six.
 */
export function shopOffers(day: number): ShopOffer[] {
  const pool = [...BASE_PLAN_CODES];
  const offers: ShopOffer[] = [];
  for (let k = 0; k < SHOP_OFFERS; k++) {
    const pick = k + Number(poseidon(SHOP, day, k) % BigInt(pool.length - k));
    [pool[k], pool[pick]] = [pool[pick]!, pool[k]!];
    const plan = pool[k]!;
    const rarity = rarityOf(plan);
    offers.push({ slot: k, plan, rarity, price: SHOP_PRICES[rarity] });
  }
  return offers;
}
