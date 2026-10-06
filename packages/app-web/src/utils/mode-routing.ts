import type { GameMode } from "@paved/chain";

/** `/game?mode=..&id=..`; without an id the game page spawns a new game of that mode. */
export function buildGameRoute(params: { gameId?: number; mode: GameMode; readonly?: boolean }): string {
  const search = new URLSearchParams({ mode: params.mode });
  if (params.gameId !== undefined) search.set("id", String(params.gameId));
  if (params.readonly) search.set("readonly", "true");
  return `/game?${search.toString()}`;
}

export function modeFromParam(mode: string | null | undefined): GameMode {
  return mode === "tutorial" ? "tutorial" : "daily";
}
