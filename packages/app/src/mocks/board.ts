import type { BoardTile, ScoredStructure } from "@paved/chain";
import { CategoryType, SCORING_CATEGORIES, type ClosedStructure, type GameStats, type OpenStructure, type TileData } from "@paved/game-core";
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

const CATEGORY_TYPES = Object.values(CategoryType);

/**
 * The figures of a game (`gameStats`'s shape) from its closings, for the over scene's mocks: a closing's tiles are its
 * `size` here (the mocks have no board to count them on), `placed`, the discards and what was left open are given.
 */
export function mockStats(
  closings: GameClosing[],
  rest: { placed: number; discarded: number; discardPenalty: number; open: OpenStructure[] },
): GameStats {
  const closed: ClosedStructure[] = closings.map((c) => ({ category: CATEGORY_TYPES[c.category]!, size: c.size, tiles: c.size, points: c.points, player: 1n, tileId: c.tileId }));
  const larger = <T extends { tiles: number; points?: number }>(a: T | null, b: T): T => (!a || b.tiles > a.tiles || (b.tiles === a.tiles && (b.points ?? 0) > (a.points ?? 0)) ? b : a);
  return {
    score: closed.reduce((n, c) => n + c.points, 0) - rest.discardPenalty,
    placed: rest.placed,
    discarded: rest.discarded,
    discardPenalty: rest.discardPenalty,
    categories: SCORING_CATEGORIES.map((category) => {
      const of = closed.filter((c) => c.category === category);
      return { category, closed: of.length, points: of.reduce((n, c) => n + c.points, 0), largest: of.reduce<ClosedStructure | null>(larger, null), open: rest.open.filter((o) => o.category === category).length };
    }),
    closings: closed,
    best: closed.reduce<ClosedStructure | null>((b, c) => (!b || c.points > b.points ? c : b), null),
    open: { count: rest.open.length, largest: rest.open.reduce<OpenStructure | null>(larger, null) },
  };
}

/** What the 38-tile game left open at its end. */
const OPEN_38: OpenStructure[] = [
  { category: CategoryType.Forest, tiles: 7, size: 9 },
  { category: CategoryType.Road, tiles: 3, size: 3 },
  { category: CategoryType.City, tiles: 2, size: 2 },
  { category: CategoryType.Forest, tiles: 2, size: 2 },
];

/** The 38-tile game's figures: 37 placed after the starter, 2 discarded. */
export const STATS_38 = mockStats(CLOSINGS_38, { placed: 37, discarded: 2, discardPenalty: 100, open: OPEN_38 });
