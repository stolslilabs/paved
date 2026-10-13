import type { GameMode } from "@paved/chain";

/** The chain's modes, and Training: the free off-chain mode of the same route (it has no game id, no wallet, no chain). */
export type RouteMode = GameMode | "training";

/** `/game?mode=..&id=..` shows a game. Starting one is not a URL: see `start-game.ts`. `/game?mode=training` plays Training. */
export function buildGameRoute(params: { gameId?: number; mode: RouteMode; readonly?: boolean }): string {
  const search = new URLSearchParams({ mode: params.mode });
  if (params.gameId !== undefined && params.mode !== "training") search.set("id", String(params.gameId));
  if (params.readonly) search.set("readonly", "true");
  return `/game?${search.toString()}`;
}

export function modeFromParam(mode: string | null | undefined): GameMode {
  return mode === "tutorial" ? "tutorial" : "daily";
}

/** True for `?mode=training`: the page plays the off-chain engine and reads nothing from the chain. */
export function isTrainingParam(mode: string | null | undefined): boolean {
  return mode === "training";
}
