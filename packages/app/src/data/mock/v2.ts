import { attackDeckSize, emptyInventory, layoutScore, slotsOf, type ChestRank, type LayoutTile, type QueuedMove } from "@paved/game-core";
import type { ChestOrigin } from "../free-village-base";
import { RIVAL_SEEDS } from "./rivals";

// The mock's PvP v2 (#741, MOCK-FIRST): what a player's free village, inventory, chests, shop and attacks hold on the device
// (`StoredV2`, kept in the ledger's state under each player), and the rival villages. Another player's village lives on another
// device, so the opponents are 30 rivals from level 1 to 20, their crowns spread over the low leagues with their level, their
// layouts grown offline by the engine's search (`scripts/mock-rivals.ts`, `rivals.ts`): the same at every load. The rules are
// game-core's (`packages/game-core/src/rules`); the ledger (`ledger.ts`) applies them.

/** A chest waiting: its rank, and the league it was granted in (the Cobble chance's boost is read at the grant). */
export interface StoredChest {
  rank: ChestRank;
  league: number;
  /** Where it was won (#784): a day's PvP slot or a Story level; absent in a save from before it. */
  origin?: ChestOrigin;
}

/** An attack of PvP v2: its snapshot (the defender, slots, target, the deck drawn at the start), the moves, the end. */
export interface StoredAttackV2 {
  id: number;
  status: "open" | "finished" | "surrendered";
  defender: string;
  slots: number;
  target: number;
  /**
   * The defender's layout at the attack's start, the starter left out (#786): the match shows the village as it was, whatever
   * the defender changed since. Absent in a save from before it (a rival's layout, which never changes, stands in).
   */
  village?: LayoutTile[];
  offer: number;
  cost: number;
  /** The deck in draw order: never shown past the tile in hand and the next two. */
  deck: number[];
  moves: (QueuedMove & { plan: number })[];
  openedAt: number;
  score: number;
  stars: number;
  xp: number;
  chest: ChestRank | null;
  gained: number;
  lost: number;
  finishedAt: number;
}

/**
 * An attack of a rival on the player's village (#786), ended at once: the mock's rivals live on no device, so the rival the
 * player attacked last answers at the player's next search. Its snapshot is the player's layout then, its build the plain
 * player's on the deck drawn from it.
 */
export interface StoredDefenceV2 {
  id: number;
  attacker: string;
  slots: number;
  /** The player's layout at the attack's start, the starter left out, and its score (the target). */
  village: LayoutTile[];
  target: number;
  deck: number[];
  moves: (QueuedMove & { plan: number })[];
  score: number;
  stars: number;
  /** The player's crowns: lost to the attack's stars (negative), or won when it took none. */
  crowns: number;
  finishedAt: number;
}

/** A player's PvP v2 state. */
export interface StoredV2 {
  xp: number;
  /** The tiles held, by plan (19 counts). */
  inventory: number[];
  /** The saved layout, the starter left out; null: not founded. */
  layout: LayoutTile[] | null;
  chests: { pending: StoredChest[]; open: { rank: ChestRank; plans: number[]; cobbles: number; origin?: ChestOrigin } | null; opened: number };
  /** The PvP chests granted, by day. */
  pvpChests: Record<string, number>;
  /** The shop's slots bought, by day. */
  bought: Record<string, number[]>;
  /** The best stars reported of each Story level, by `campaign:level`. */
  story: Record<string, number>;
  match: { opponent: string; offer: number; cost: number } | null;
  draws: number;
  attacks: StoredAttackV2[];
  /** The rivals' attacks on the player's village (#786), oldest first; absent in a save from before them. */
  defences?: StoredDefenceV2[];
  /** The attack id a rival last answered (#786): one answer per attack. */
  answered?: number;
}

export const freshV2 = (): StoredV2 => ({
  xp: 0,
  inventory: emptyInventory(),
  layout: null,
  chests: { pending: [], open: null, opened: 0 },
  pvpChests: {},
  bought: {},
  story: {},
  match: null,
  draws: 0,
  attacks: [],
});

/** A rival village of PvP v2. */
export interface MockRivalV2 {
  address: string;
  name: string;
  level: number;
  slots: number;
  crowns: number;
  tiles: LayoutTile[];
  score: number;
  /** The deck an attack on it draws. */
  deck: number;
}

let rivals: MockRivalV2[] | null = null;

/** The rivals, by crowns. Their addresses are above 255 (never an NPC's) and apart from PvP v1's (`pvp.ts`). */
export function mockRivalsV2(): readonly MockRivalV2[] {
  rivals ??= RIVAL_SEEDS.map((r, i) => {
    const tiles = r.tiles.map(([plan, orientation, x, y]) => ({ plan, orientation, x, y }));
    const slots = slotsOf(r.level);
    return { address: `0x${(0x7e2a0000 + i + 1).toString(16)}`, name: r.name, level: r.level, slots, crowns: r.crowns, tiles, score: layoutScore(tiles), deck: attackDeckSize(slots) };
  });
  return rivals;
}

/** A rival by address, or null. */
export function mockRivalV2(address: string): MockRivalV2 | null {
  let id: bigint;
  try {
    id = BigInt(address);
  } catch {
    return null;
  }
  return mockRivalsV2().find((r) => BigInt(r.address) === id) ?? null;
}
