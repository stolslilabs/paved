import { attackDeckSize, emptyInventory, layoutScore, layoutSlotsOf, slotsOf, type ChestRank, type LayoutSlots, type LayoutTile, type QueuedMove } from "@paved/game-core";
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
  /** The saved layout, the starter left out; null: not founded. The village: the active slot's layout (#804). */
  layout: LayoutTile[] | null;
  /**
   * The saved layouts' slots (#804): each one's layout (null: empty), the slots bought, the active one, whose entry `layout`
   * mirrors. Absent: a save from before them, read as `layout` alone in the free slot (`slotsOfV2`).
   */
  slots?: { layouts: (LayoutTile[] | null)[]; bought: number[]; active: number };
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

/** The chests' names before V4-CHEST-NAMES (owner, 2026-10-29), as a save from before it holds them. */
const OLD_CHEST_RANK: Readonly<Record<string, ChestRank>> = { bronze: "basic", silver: "rare", gold: "epic" };
const renamedRank = <T extends ChestRank | null>(rank: T): T => (rank ? (OLD_CHEST_RANK[rank] as T | undefined) ?? rank : rank);

/** A save's chests under their names (Basic, Rare, Epic): those of a save from before the rename (Bronze, Silver, Gold) are renamed in place. */
export function renameChestsV2(v2: StoredV2): void {
  for (const chest of v2.chests.pending) chest.rank = renamedRank(chest.rank);
  if (v2.chests.open) v2.chests.open.rank = renamedRank(v2.chests.open.rank);
  for (const attack of v2.attacks) attack.chest = renamedRank(attack.chest);
}

/** A founded village's layout slots: the stored ones, or (a save from before #804) its layout alone, in the free slot. */
export function slotsOfV2(v2: StoredV2 & { layout: LayoutTile[] }): LayoutSlots {
  return v2.slots ?? layoutSlotsOf(v2.layout);
}

/** The slots stored, the village (`layout`) following the active one's layout. */
export function storeSlotsV2(v2: StoredV2, slots: LayoutSlots): void {
  const layouts = slots.layouts.map((l) => (l ? l.map((t) => ({ ...t })) : null));
  v2.slots = { layouts, bought: [...slots.bought], active: slots.active };
  v2.layout = layouts[slots.active]!.map((t) => ({ ...t }));
}

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
