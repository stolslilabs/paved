import type { BoardTile } from "@paved/chain";

// The starter on its own (#753): the home's light wiring reads it without the layout rules and the engine behind them.

/** The starter (`RFFFRFCFR` facing South at (0, 0), id 1): every village has it, and it stays. */
export const STARTER: BoardTile = { id: 1, plan: 9, orientation: 3, x: 0, y: 0 };
export const isStarter = (tile: Pick<BoardTile, "id">): boolean => tile.id === STARTER.id;
