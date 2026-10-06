// Deterministic board fixtures for the client frame-time baseline.
//
// Usage (from the repo root):  bun packages/game-core/bench/generate-boards.ts
// Writes bench/fixtures/board-38.json and board-72.json next to this file.
//
// A board is built through the game-core rules: tiles are drawn from the base deck
// (shuffled with a fixed seed), each is put on a free slot next to the board with an
// orientation whose touching edges all match (Layout.isCompatible, as Game.tsx does).
// A tile that fits nowhere is discarded and the next one is drawn; the deck is
// cycled when it runs out. A few characters are then put on legal spots.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  Base,
  Direction,
  DirectionType,
  Layout,
  Orientation,
  Plan,
  getValidSpotsForRole,
  offset,
} from "../src/index";
import type { CharacterData, TileData } from "../src/index";

export const BOARD_SEED = 0xc0ffee;
export const BOARD_SIZES = [38, 72] as const;
const GAME_ID = 1;
const PLAYER_ID = "0x1234";
const CHARACTERS_PER_BOARD = 6;
/** Orientations North..West as contract values (Orientation.from(1..4)). */
const ORIENTATIONS = [1, 2, 3, 4];

export interface BoardFixture {
  seed: number;
  size: number;
  /** Contract coordinates: x = offset + worldX, y = offset - worldZ. */
  center: number;
  tiles: TileData[];
  characters: CharacterData[];
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

function shuffle<T>(items: T[], rnd: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const NEIGHBORS: Array<[number, number, DirectionType]> = [
  [0, 1, DirectionType.North],
  [1, 0, DirectionType.East],
  [0, -1, DirectionType.South],
  [-1, 0, DirectionType.West],
];

const layoutOf = (t: TileData) => Layout.from(Plan.from(t.plan), Orientation.from(t.orientation).value);

/** Same rule as Game.tsx canPlaceTile: free, adjacent, every touching edge matches. */
export function canPlace(
  byPos: Map<string, TileData>,
  x: number,
  y: number,
  plan: number,
  orientation: number,
): boolean {
  if (byPos.has(`${x},${y}`)) return false;
  const layout = Layout.from(Plan.from(plan), Orientation.from(orientation).value);
  let touching = 0;
  for (const [dx, dy, dir] of NEIGHBORS) {
    const n = byPos.get(`${x + dx},${y + dy}`);
    if (!n) continue;
    touching++;
    if (!layout.isCompatible(layoutOf(n), new Direction(dir))) return false;
  }
  return touching > 0;
}

export function generateBoard(size: number, seed = BOARD_SEED): BoardFixture {
  const rnd = mulberry32(seed);
  const deck = shuffle(
    Array.from({ length: Base.total_count() }, (_, i) => Base.plan(i)).map((p) => new Plan(p).into()),
    rnd,
  );
  const tiles: TileData[] = [];
  const byPos = new Map<string, TileData>();
  const push = (plan: number, orientation: number, x: number, y: number) => {
    const t: TileData = {
      game_id: GAME_ID,
      id: tiles.length + 1,
      player_id: PLAYER_ID,
      plan,
      orientation,
      x,
      y,
      occupied_spot: 0,
    };
    tiles.push(t);
    byPos.set(`${x},${y}`, t);
  };

  let drawn = 0;
  push(deck[drawn++ % deck.length], 1, offset, offset);

  while (tiles.length < size) {
    const plan = deck[drawn++ % deck.length];
    // Candidate slots: free cells next to a placed tile, in a deterministic order.
    const slots: Array<[number, number]> = [];
    const seen = new Set<string>();
    for (const t of tiles) {
      for (const [dx, dy] of NEIGHBORS) {
        const k = `${t.x + dx},${t.y + dy}`;
        if (!byPos.has(k) && !seen.has(k)) {
          seen.add(k);
          slots.push([t.x + dx, t.y + dy]);
        }
      }
    }
    const options: Array<[number, number, number]> = [];
    for (const [x, y] of slots) {
      for (const o of ORIENTATIONS) if (canPlace(byPos, x, y, plan, o)) options.push([x, y, o]);
    }
    if (options.length === 0) continue; // discarded
    const [x, y, o] = options[Math.floor(rnd() * options.length)];
    push(plan, o, x, y);
  }

  // Characters: one per role index, on a legal spot of a random distinct tile.
  const characters: CharacterData[] = [];
  const free = shuffle(tiles.slice(), rnd);
  for (let index = 1; index <= CHARACTERS_PER_BOARD && free.length > 0; index++) {
    for (let i = 0; i < free.length; i++) {
      const tile = free[i];
      const spots = getValidSpotsForRole(index - 1, tile.plan, tile.orientation);
      if (spots.length === 0) continue;
      const spot = spots[Math.floor(rnd() * spots.length)];
      tile.occupied_spot = spot;
      characters.push({
        game_id: GAME_ID,
        player_id: PLAYER_ID,
        index,
        tile_id: tile.id,
        spot,
        weight: 1,
        power: 1,
      });
      free.splice(i, 1);
      break;
    }
  }
  return { seed, size, center: offset, tiles, characters };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const dir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
  for (const size of BOARD_SIZES) {
    const board = generateBoard(size);
    writeFileSync(join(dir, `board-${size}.json`), JSON.stringify(board, null, 1) + "\n");
    console.log(`board-${size}.json: ${board.tiles.length} tiles, ${board.characters.length} characters`);
  }
}
