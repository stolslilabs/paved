import { poseidon } from "../engine/draw";
import { BASE_DECK_CARDS, baseCopies, basePlanOfCard } from "./rarity";

// Chests (PvP v2, #732, #736, owner decisions of 2026-10-24). An attack's stars give a chest's rank: 1 star basic (one tile,
// no choice), 2 rare (a choice of 1 among 2), 3 epic (1 among 3); none for 0 stars. Story gives one only on 3 stars, the
// first time, its rank by the level's place in its campaign (the first half basic, then rare, the last level epic). The
// Challenge and a defence give none. The tiles follow the base deck's odds. There is no "take Cobbles" option: a chest has
// instead a small chance of Cobbles, higher with its rank, boosted by the player's league. At most 3 PvP chests a day;
// Story chests are outside the cap (they come once per level). A chest's choices are always distinct plans (#868).
// The ranks are named Basic, Rare and Epic, not Bronze, Silver and Gold, so they are not taken for the leagues (owner, 2026-10-29).

export type ChestRank = "basic" | "rare" | "epic";

export const CHEST_RANKS: readonly ChestRank[] = ["basic", "rare", "epic"];

/** The tiles a chest shows, of which the player takes one. */
export const CHEST_CHOICES: Readonly<Record<ChestRank, number>> = { basic: 1, rare: 2, epic: 3 };

/** The chance of Cobbles in a chest, in basis points, before the league's boost (#736 open point 1: 2 / 5 / 10 %). */
export const CHEST_COBBLE_BPS: Readonly<Record<ChestRank, number>> = { basic: 200, rare: 500, epic: 1_000 };

/** The Cobbles a chest holds when they drop. */
export const CHEST_COBBLES = 10;

/** The PvP chests a player can get in a day (UTC on the device, the chain day on chain). */
export const PVP_CHESTS_PER_DAY = 3;

/** The highest league's number (`league_of`: 0 Wood to 22 Grand Master). */
export const TOP_LEAGUE = 22;

const BPS = 10_000;

/** The league's boost of the Cobble chance, in basis points: x1 in the lowest league up to x2 in the highest, linear. */
export function leagueBoostBps(league: number): number {
  const at = Math.min(TOP_LEAGUE, Math.max(0, Math.floor(league)));
  return BPS + Math.floor((BPS * at) / TOP_LEAGUE);
}

/** The chance of Cobbles of a chest of `rank` for a player in `league`, in basis points. */
export function cobbleChanceBps(rank: ChestRank, league: number): number {
  return Math.floor((CHEST_COBBLE_BPS[rank] * leagueBoostBps(league)) / BPS);
}

/** The chest of an attack with `stars`, or null for none. */
export function pvpChestRank(stars: number): ChestRank | null {
  return stars >= 3 ? "epic" : stars === 2 ? "rare" : stars === 1 ? "basic" : null;
}

/** The rank of a Story level's chest by its place `level` (from 1) in a campaign of `levels`: the first half basic, then rare, the last epic. */
export function storyRankAt(level: number, levels: number): ChestRank {
  if (level >= levels) return "epic";
  return level <= Math.floor(levels / 2) ? "basic" : "rare";
}

/** The chest of a Story run with `stars` on a level whose best was `best`: only on 3 stars, the first time. */
export function storyChestRank(level: number, levels: number, best: number, stars: number): ChestRank | null {
  return stars >= 3 && best < 3 ? storyRankAt(level, levels) : null;
}

/** Whether a PvP chest is granted after `today` PvP chests that day. */
export const pvpChestGranted = (today: number): boolean => today < PVP_CHESTS_PER_DAY;

/** A chest opened: the plans shown (1, 2 or 3) and the Cobbles it holds (0 or `CHEST_COBBLES`). */
export interface ChestDraw {
  readonly rank: ChestRank;
  readonly plans: readonly number[];
  readonly cobbles: number;
}

const COBBLE_ROLL = 0x434f42424c45n; // 'COBBLE'

/**
 * A chest opened from `random` (the VRF's on chain), its choices distinct plans drawn without putting back (#868): for choice
 * `i`, the cards of the plans already shown leave the base deck's 72, and the choice is the plan of the card at
 * `Poseidon(random, i) % left` among the cards left, in the deck's order. One draw per choice, no retry. The first choice
 * follows the base deck's odds; each next one weighs the plans not yet shown by their copies. The chance of at least one rare
 * (6 of the 72 cards) is 8.3 / 16.6 / 24.7 % for 1, 2 and 3 choices (with putting back it was 8.3 / 16.0 / 23.0 %). The
 * Cobbles drop when `Poseidon(random, 'COBBLE') % 10,000` is under the chance.
 */
export function drawChest(rank: ChestRank, league: number, random: bigint): ChestDraw {
  const plans: number[] = [];
  let left = BASE_DECK_CARDS;
  for (let i = 0; i < CHEST_CHOICES[rank]; i++) {
    let at = Number(poseidon(random, i) % BigInt(left));
    for (let card = 0; card < BASE_DECK_CARDS; card++) {
      const plan = basePlanOfCard(card);
      if (plans.includes(plan)) continue;
      if (at === 0) {
        plans.push(plan);
        left -= baseCopies(plan);
        break;
      }
      at -= 1;
    }
  }
  const roll = Number(poseidon(random, COBBLE_ROLL) % BigInt(BPS));
  return { rank, plans, cobbles: roll < cobbleChanceBps(rank, league) ? CHEST_COBBLES : 0 };
}
