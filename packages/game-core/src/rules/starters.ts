import { poseidon } from "../engine/draw";
import { STARTER_LAYOUTS } from "./starter-layouts";
import type { LayoutTile } from "./free-village";

// The starter layouts (PvP v2, #732, #741): a new village is the starter plus 8 tiles in a valid layout that closes at least
// one structure (laid out at random, 24 starts in 30 scored 0), with no mythic plan. `STARTER_LAYOUTS` is generated offline by
// `scripts/v2-layouts.ts` on the engine's search (`grow.ts`), from common and uncommon plans only; every one scores more than
// 0. A new player gets the one their address picks, the same on every device.

export { STARTER_LAYOUTS };

/** The tiles of a starter layout, the starter left out. */
export const STARTER_TILES = 8;

const STARTER = 0x53544152544552n; // 'STARTER'

/** The index of the starter layout of a player: `Poseidon('STARTER', player) % 64`. */
export function starterIndex(player: bigint): number {
  return Number(poseidon(STARTER, player) % BigInt(STARTER_LAYOUTS.length));
}

/** The starter layout of a player, copied. */
export function starterLayout(player: bigint): LayoutTile[] {
  return STARTER_LAYOUTS[starterIndex(player)]!.map((t) => ({ ...t }));
}
