import type { VillageCell, VillageTile } from "@paved/chain";
import { EngineGame, OrientationType, PlanType, baseDeckPlans, poseidon, startTerritory } from "@paved/game-core";

// The mock's PvP (#647 PR 2, MOCK-FIRST): what `Matchmaker` and `Arena` hold that the device cannot see. Another player's
// village lives on another device, so the mock's opponents are rival villages grown here on game-core's engine (a seeded
// territory, then the base deck's tiles placed where they score most), the same at every load. Their crowns are fixed; an
// attack shields them for 8 hours, as `Matchmaker` does. The rules (draws, stakes, stars, the settlement) are the ledger's
// (`ledger.ts`), with the contracts' figures.

const PLANS = Object.values(PlanType);
const ORIENTATIONS = Object.values(OrientationType);

/** A rival village of the mock: its address, name, crowns and village as `Village`'s views list it. */
export interface MockRival {
  address: string;
  name: string;
  crowns: number;
  cells: VillageCell[];
  tiles: VillageTile[];
  score: number;
}

/** The rivals' seeds, names, crowns, parcels and tiles: a spread of crowns around a new village's 0 and the first leagues. */
const RIVALS: readonly { seed: number; name: string; crowns: number; parcels: number; tiles: number }[] = [
  { seed: 11, name: "Rook of Ashford", crowns: 40, parcels: 14, tiles: 20 },
  { seed: 23, name: "millstone_mara", crowns: 120, parcels: 18, tiles: 24 },
  { seed: 37, name: "Vael", crowns: 260, parcels: 22, tiles: 27 },
  { seed: 41, name: "harbourwright", crowns: 430, parcels: 25, tiles: 30 },
  { seed: 53, name: "Old Tom Cobble", crowns: 610, parcels: 27, tiles: 32 },
  { seed: 67, name: "Wren", crowns: 880, parcels: 29, tiles: 35 },
];

/** A seeded generator from Poseidon: the k-th value of `seed`, in [0, 1). */
const at = (seed: number, k: number): number => Number(poseidon(0x5056504en, BigInt(seed), BigInt(k)) % 1_000_000n) / 1_000_000;

/** A village grown on the engine: `parcels` cells bought next to the territory, then up to `tiles` tiles placed. */
function grow(seed: number, parcels: number, count: number): { cells: VillageCell[]; tiles: VillageTile[]; score: number } {
  const cells: VillageCell[] = startTerritory().map((c) => ({ x: c.x, y: c.y }));
  const owned = new Set(cells.map((c) => `${c.x},${c.y}`));
  let k = 0;
  while (cells.length < 9 + parcels) {
    const free = [...new Map(cells.flatMap((c) => [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: c.x + dx!, y: c.y + dy! }))).filter((c) => !owned.has(`${c.x},${c.y}`)).map((c) => [`${c.x},${c.y}`, c])).values()];
    const cell = free[Math.floor(at(seed, k++) * free.length)]!;
    owned.add(`${cell.x},${cell.y}`);
    cells.push(cell);
  }
  const game = EngineGame.village({ territory: cells });
  const deck = baseDeckPlans();
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(at(seed, 1_000 + i) * (i + 1));
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  for (const plan of deck) {
    if (game.placed().length > count) break;
    let best: { placement: ReturnType<EngineGame["legalPlacements"]>[number]; points: number } | null = null;
    for (const placement of game.legalPlacements(plan)) {
      const points = game.clone().place(plan, placement).points;
      if (!best || points > best.points) best = { placement, points };
    }
    if (best) game.place(plan, best.placement);
  }
  const tiles = game.placed().map((t) => ({ id: t.id, plan: PLANS.indexOf(t.plan), orientation: ORIENTATIONS.indexOf(t.orientation), x: t.x, y: t.y }));
  return { cells, tiles, score: game.score };
}

let rivals: MockRival[] | null = null;

/** The mock's rival villages, grown once per page. Their addresses are above 255: never an NPC's. */
export function mockRivals(): readonly MockRival[] {
  rivals ??= RIVALS.map((r, i) => ({ address: `0x${(0x7e1a0000 + i + 1).toString(16)}`, name: r.name, crowns: r.crowns, ...grow(r.seed, r.parcels, r.tiles) }));
  return rivals;
}

/** A rival by address, or null. */
export function mockRival(address: string): MockRival | null {
  const id = BigInt(address);
  return mockRivals().find((r) => BigInt(r.address) === id) ?? null;
}

/**
 * The season starts of 2026 to 2028 (`SEASON_STARTS`' first twelve, JPL's DE440s, #644): the mock's season clock starts at
 * the September 2026 equinox, season 1.
 */
export const MOCK_SEASON_STARTS = [1790121913, 1797886214, 1805574281, 1813587050, 1821679303, 1829443330, 1837131428, 1845144120, 1853235918, 1860999580] as const;

/** The mock's season of a time (seconds): 0 before its clock, then 1 on. */
export function mockSeasonOf(time: number): number {
  return MOCK_SEASON_STARTS.filter((s) => s <= time).length;
}
