import type { GameMode } from "@paved/chain";
import { modeFromParam } from "./mode-routing";

export interface GameParams {
  mode: GameMode;
  /** The game to show; null when the URL has no id, or a malformed one (`invalidId`). */
  gameId: number | null;
  /** An id was given but is not a positive integer: the page shows "Game not found". */
  invalidId: boolean;
  readonly: boolean;
}

/** Reads the URL: a game to show, never a consent to pay (that is the history state: `start-game.ts`). */
export function parseGameParams(searchParams: URLSearchParams): GameParams {
  const mode = modeFromParam(searchParams.get("mode"));
  const idParam = searchParams.get("id");
  const valid = idParam !== null && /^[1-9][0-9]*$/.test(idParam) && Number(idParam) <= 0xffffffff;
  return {
    mode,
    gameId: valid ? Number(idParam) : null,
    invalidId: idParam !== null && !valid,
    readonly: searchParams.get("readonly") === "true",
  };
}
