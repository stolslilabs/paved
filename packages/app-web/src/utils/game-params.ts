import type { GameMode } from "@paved/chain";
import { modeFromParam } from "./mode-routing";

export interface GameParams {
  mode: GameMode;
  /** The game to show; null when the URL has no id, or a malformed one (`invalidId`). */
  gameId: number | null;
  /** An id was given but is not a positive integer: the page shows "Game not found". */
  invalidId: boolean;
  /** Start a game: set by the landing page's confirm only (it pays the Daily entry). */
  spawn: boolean;
  /** The Daily entry amount the player confirmed; null when absent or malformed. */
  price: bigint | null;
  readonly: boolean;
}

export function parseGameParams(searchParams: URLSearchParams): GameParams {
  const mode = modeFromParam(searchParams.get("mode"));
  const idParam = searchParams.get("id");
  const valid = idParam !== null && /^[1-9][0-9]*$/.test(idParam) && Number(idParam) <= 0xffffffff;
  return {
    mode,
    gameId: valid ? Number(idParam) : null,
    invalidId: idParam !== null && !valid,
    spawn: idParam === null && searchParams.get("spawn") === "1",
    price: /^(0|[1-9][0-9]{0,77})$/.test(searchParams.get("price") ?? "") ? BigInt(searchParams.get("price")!) : null,
    readonly: searchParams.get("readonly") === "true",
  };
}
