import type { BoardTile } from "@paved/chain";

// The Town Hall on its own (TOWN-HALL; the starter before it, #753): the home's light wiring reads it without the layout rules
// and the engine behind them, so its four cells are written here (`town-hall.test.ts` holds them to game-core's
// `TOWN_HALL_TILES`).

/**
 * The Town Hall: a 2 x 2 tile, four cells on the board (ids 1 to 4, at (0, 0) to (1, 1)), drawn as one model. Every village
 * has it, and it stays: never selected, moved, turned or sent back.
 */
export const TOWN_HALL: readonly BoardTile[] = [
  { id: 1, plan: 6, orientation: 4, x: 0, y: 0 },
  { id: 2, plan: 10, orientation: 2, x: 1, y: 0 },
  { id: 3, plan: 10, orientation: 1, x: 0, y: 1 },
  { id: 4, plan: 16, orientation: 4, x: 1, y: 1 },
];

/** The Town Hall's cells at `level` (1 when unset), copied: the start of a layout. */
export const townHallTiles = (level = 1): BoardTile[] => TOWN_HALL.map((t) => ({ ...t, townHall: level }));

/** Whether a tile is one of the Town Hall's cells ("the starter" of the village's rules). */
export const isStarter = (tile: Pick<BoardTile, "id">): boolean => tile.id >= 1 && tile.id <= TOWN_HALL.length;

/** The slots a layout's tiles take: each tile one, the Town Hall one for its four cells. */
export const usedSlots = (tiles: readonly Pick<BoardTile, "id">[]): number => tiles.filter((t) => !isStarter(t)).length + (tiles.some(isStarter) ? 1 : 0);
