import type { TileRenderData } from "@paved/renderer";
import { TILE_SIZE } from "@paved/renderer";
import { offset } from "@paved/game-core";
import type { CharacterData, TileData } from "@paved/game-core";
import board38 from "../../../game-core/bench/fixtures/board-38.json?raw";
import board72 from "../../../game-core/bench/fixtures/board-72.json?raw";
import placements38 from "../../../game-core/bench/fixtures/placements-38.json?raw";
import placements72 from "../../../game-core/bench/fixtures/placements-72.json?raw";
import type { PathBounds } from "./camera-path";

/** Recorded boards of the bench (packages/game-core/bench/fixtures), by tile count. */
const FIXTURES: Record<number, { board: string; placements: string }> = {
  38: { board: board38, placements: placements38 },
  72: { board: board72, placements: placements72 },
};

export interface BenchBoard {
  tiles: TileRenderData[];
  characters: CharacterData[];
  /** Legal placements that continue the board, in order (placements-<size>.json). */
  placements: TileRenderData[];
  bounds: PathBounds;
}

/** Same conversion as utils/game-helpers.ts toRenderBoard, from the recorded rows. */
export const toRenderTile = (t: TileData): TileRenderData => ({ ...t, worldX: t.x - offset, worldZ: offset - t.y });

/** The recorded board of `size` tiles; throws when there is no fixture of that size. */
export function loadBoard(size: number): BenchBoard {
  const fixture = FIXTURES[size];
  if (!fixture) throw new Error(`no bench board of ${size} tiles (fixtures: ${Object.keys(FIXTURES).join(", ")})`);
  const board: { tiles: TileData[]; characters: CharacterData[] } = JSON.parse(fixture.board);
  const tiles = board.tiles.map(toRenderTile);
  const xs = tiles.map((t) => t.worldX * TILE_SIZE);
  const zs = tiles.map((t) => t.worldZ * TILE_SIZE);
  return {
    tiles,
    characters: board.characters,
    placements: (JSON.parse(fixture.placements).placements as TileData[]).map(toRenderTile),
    bounds: { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) },
  };
}
