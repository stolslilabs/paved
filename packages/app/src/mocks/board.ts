import type { BoardTile, ScoredStructure } from "@paved/chain";
import type { TileData } from "@paved/game-core";
import board38 from "../../../game-core/bench/fixtures/board-38.json?raw";
import board72 from "../../../game-core/bench/fixtures/board-72.json?raw";
import placements38 from "../../../game-core/bench/fixtures/placements-38.json?raw";
import placements72 from "../../../game-core/bench/fixtures/placements-72.json?raw";

/**
 * The recorded boards of the bench (`packages/game-core/bench/fixtures`, read, never copied), as the session's
 * `BoardTile`s: the board scene draws them with the real renderer. `next` is the first legal placement that continues
 * the board, the tile in hand.
 */
function recorded(board: string, placements: string): { tiles: BoardTile[]; next: BoardTile } {
  const toBoardTile = ({ id, plan, orientation, x, y }: TileData): BoardTile => ({ id, plan, orientation, x, y });
  const tiles = (JSON.parse(board) as { tiles: TileData[] }).tiles.map(toBoardTile);
  const next = toBoardTile((JSON.parse(placements) as { placements: TileData[] }).placements[0]);
  return { tiles, next };
}

export const BOARD_38 = recorded(board38, placements38);
export const BOARD_72 = recorded(board72, placements72);

/**
 * One closing of a game: a `Scored` event (`ScoredStructure`) and the tile whose placement closed it. The tile is the
 * move's, read from the receipt; the over screen lists every closing of the game (the PM's P7 addition).
 */
export interface GameClosing extends ScoredStructure {
  /** The tile id of the move that closed it. */
  tileId: number;
}

/** `CategoryType` indices: 1 Forest, 2 Road, 3 City, 5 Wonder. */
const FOREST = 1;
const ROAD = 2;
const CITY = 3;
const WONDER = 5;

/** The closings of the 38-tile game, in move order: what the over scene lists and the board's feed shows. */
export const CLOSINGS_38: GameClosing[] = [
  { tileId: 4, category: ROAD, size: 3, points: 30 },
  { tileId: 7, category: CITY, size: 2, points: 40 },
  { tileId: 9, category: FOREST, size: 4, points: 0 },
  { tileId: 12, category: ROAD, size: 5, points: 50 },
  { tileId: 15, category: CITY, size: 4, points: 120 },
  { tileId: 19, category: ROAD, size: 2, points: 20 },
  { tileId: 22, category: FOREST, size: 6, points: 60 },
  { tileId: 26, category: CITY, size: 6, points: 240 },
  { tileId: 29, category: WONDER, size: 9, points: 180 },
  { tileId: 31, category: ROAD, size: 7, points: 70 },
  { tileId: 34, category: CITY, size: 3, points: 90 },
  { tileId: 37, category: FOREST, size: 5, points: 50 },
  { tileId: 38, category: CITY, size: 8, points: 320 },
];

/** What the last move closed: two structures at once, as the board's feed shows them arriving. */
export const LAST_SCORED: ScoredStructure[] = [
  { category: CITY, size: 8, points: 320 },
  { category: FOREST, size: 5, points: 50 },
];
