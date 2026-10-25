import type { BoardTile } from "@paved/chain";
import type { LayoutTile } from "@paved/game-core";
import { STARTER, isStarter } from "../components/containers/layout-starter";
import { V2RefusedError, type V2Refusal } from "../data/free-village-base";

// The v2 village's shapes between the hooks (`data/free-village.ts`, game-core's codes, the starter left out) and the scenes
// (`BoardTile`s, the starter included), and a refusal in words: light, so the home (#753) reads them in its first chunk.

/** A saved layout as the scenes draw it: the starter first (id 1), then each tile with an id of its own. */
export function boardTilesOf(tiles: readonly LayoutTile[]): BoardTile[] {
  return [{ ...STARTER }, ...tiles.map((t, i) => ({ id: STARTER.id + 1 + i, plan: t.plan, orientation: t.orientation, x: t.x, y: t.y }))];
}

/** The editor's layout as it is saved: the starter left out, the ids dropped. */
export function layoutTilesOf(tiles: readonly BoardTile[]): LayoutTile[] {
  return tiles.filter((t) => !isStarter(t)).map(({ plan, orientation, x, y }) => ({ plan, orientation, x, y }));
}

/** Counts by plan (`counts[plan - 1]`, 19 of them) as the scenes take them: a record by plan, the plans at 0 left out. */
export function countsByPlan(counts: readonly number[]): Record<number, number> {
  const out: Record<number, number> = {};
  counts.forEach((n, i) => {
    if (n > 0) out[i + 1] = n;
  });
  return out;
}

const REFUSALS: Partial<Record<V2Refusal, string>> = {
  "too-many-tiles": "The layout holds more tiles than your slots.",
  "not-held": "The layout uses a tile you no longer hold.",
  "not-connected": "Every tile must join the starter.",
  "cannot-place": "Two facing edges do not match.",
  "starter-cell": "No tile goes on the starter's cell.",
  "duplicate-cell": "Two tiles share a cell.",
  founded: "Your village is founded already.",
  "no-village": "Found your village first.",
  "no-chest": "No chest is waiting.",
  "chest-open": "A chest is open already: keep one of its tiles first.",
  "no-open-chest": "This chest was claimed already.",
  "not-a-slot": "This tile is not in the chest.",
  "shop-closed": "This shop is over: tomorrow's is open.",
  bought: "You bought this offer today already.",
  "price-changed": "The price changed: check it and buy again.",
  "not-enough-cobbles": "Not enough Cobbles.",
};

/** A write's refusal, in words: the rules' reason when they refused it, else the error's own message. */
export function refusalText(error: Error): string {
  return error instanceof V2RefusedError ? (REFUSALS[error.reason] ?? error.message) : error.message;
}
