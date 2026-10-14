import { BOARD_72 } from "./board";

/** The tiles a theme's preview card draws: eighteen of the 72-tile recorded board, from its middle. */
export const THEME_TILES = BOARD_72.tiles.slice(24, 42).map(({ plan, orientation }) => ({ plan, orientation }));
