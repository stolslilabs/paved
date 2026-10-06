import type { GameMode } from "@paved/chain";
import { modeFromParam } from "./mode-routing";

export interface GameParams {
  mode: GameMode;
  gameId: number | null;
  readonly: boolean;
}

export function parseGameParams(searchParams: URLSearchParams): GameParams {
  const mode = modeFromParam(searchParams.get("mode"));
  const idParam = searchParams.get("id");
  const id = idParam ? Number(idParam) : NaN;
  const gameId = Number.isInteger(id) && id > 0 ? id : null;
  const readonly = searchParams.get("readonly") === "true";
  return { mode, gameId, readonly };
}
