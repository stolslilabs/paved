// Deterministic placement sequences for the click-to-display and in-play benches.
//
// Usage (from the repo root):  bun packages/game-core/bench/generate-placements.ts
// Writes bench/fixtures/placements-38.json and placements-72.json next to this file.
//
// A sequence continues a recorded board (board-<size>.json): tiles are drawn from the base
// deck shuffled with its own fixed seed, and each is put on a free slot next to the board
// (the board plus the earlier placements) with an orientation whose touching edges all match,
// the same rule as Game.tsx. Slots are taken nearest to the centre of the board first, so the
// bench can click them from the default camera. A tile that fits nowhere is skipped.
import { writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Base, Plan } from "../src/index";
import type { TileData } from "../src/index";
import { BOARD_SIZES, canPlace } from "./generate-boards";
import type { BoardFixture } from "./generate-boards";

export const PLACEMENT_SEED = 0xbadc0de;
/** At least 20 placements per run, as the bench requires. */
export const PLACEMENT_COUNT = 24;
const ORIENTATIONS = [1, 2, 3, 4];

export interface PlacementFixture {
  seed: number;
  /** Tiles of the board the sequence continues. */
  size: number;
  /** In order; ids continue the board's (size + 1, size + 2, ...). */
  placements: TileData[];
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generatePlacements(
  board: BoardFixture,
  count = PLACEMENT_COUNT,
  seed = PLACEMENT_SEED,
): PlacementFixture {
  const rnd = mulberry32(seed + board.size);
  const plans = Array.from({ length: Base.total_count() }, (_, i) => new Plan(Base.plan(i)).into());
  const byPos = new Map<string, TileData>(board.tiles.map((t) => [`${t.x},${t.y}`, t]));
  const cx = board.tiles.reduce((s, t) => s + t.x, 0) / board.tiles.length;
  const cy = board.tiles.reduce((s, t) => s + t.y, 0) / board.tiles.length;
  const template = board.tiles[0];
  const placements: TileData[] = [];

  for (let attempt = 0; placements.length < count && attempt < count * 20; attempt++) {
    const plan = plans[Math.floor(rnd() * plans.length)];
    const slots = new Map<string, [number, number]>();
    for (const t of byPos.values()) {
      for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
        const k = `${t.x + dx},${t.y + dy}`;
        if (!byPos.has(k)) slots.set(k, [t.x + dx, t.y + dy]);
      }
    }
    const ordered = [...slots.values()].sort(
      (a, b) => Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b[0] - cx, b[1] - cy) || a[0] - b[0] || a[1] - b[1],
    );
    let placed: TileData | null = null;
    for (const [x, y] of ordered) {
      const o = ORIENTATIONS.find((o) => canPlace(byPos, x, y, plan, o));
      if (o === undefined) continue;
      placed = { ...template, id: board.size + placements.length + 1, plan, orientation: o, x, y, occupied_spot: 0 };
      break;
    }
    if (!placed) continue;
    placements.push(placed);
    byPos.set(`${placed.x},${placed.y}`, placed);
  }
  return { seed, size: board.size, placements };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const dir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
  for (const size of BOARD_SIZES) {
    const board: BoardFixture = JSON.parse(readFileSync(join(dir, `board-${size}.json`), "utf8"));
    const seq = generatePlacements(board);
    writeFileSync(join(dir, `placements-${size}.json`), JSON.stringify(seq, null, 1) + "\n");
    console.log(`placements-${size}.json: ${seq.placements.length} placements`);
  }
}
