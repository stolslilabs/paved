import type { GameMode } from "@paved/chain";

/** The chain's mode (Challenge), and Training: the free off-chain mode of the same route (it has no game id, no wallet, no chain). */
export type RouteMode = GameMode | "training";

/** `/game?mode=..&id=..` shows a game. Starting one is not a URL: see `start-game.ts`. `/game?mode=training` plays Training. */
export function buildGameRoute(params: { gameId?: number; mode: RouteMode; readonly?: boolean }): string {
  const search = new URLSearchParams({ mode: params.mode });
  if (params.gameId !== undefined && params.mode !== "training") search.set("id", String(params.gameId));
  if (params.readonly) search.set("readonly", "true");
  return `/game?${search.toString()}`;
}

/** Challenge, whatever the param says: the on-chain Tutorial left (D-21), and the tutorial is the off-chain `/tutorial` page. */
export function modeFromParam(_mode: string | null | undefined): GameMode {
  return "challenge";
}

/** True for `?mode=training`: the page plays the off-chain engine and reads nothing from the chain. */
export function isTrainingParam(mode: string | null | undefined): boolean {
  return mode === "training";
}

/** True for `?mode=tutorial`, the link of the on-chain Tutorial that left (D-21): the page sends it to `/tutorial`. */
export function isTutorialParam(mode: string | null | undefined): boolean {
  return mode === "tutorial";
}

/** True for `?mode=daily`, the link of the mode D-23 renamed Challenge: the page replaces it with `?mode=challenge`. */
export function isDailyParam(mode: string | null | undefined): boolean {
  return mode === "daily";
}

/** The same search with `mode=challenge` for an old `mode=daily`, every other param kept in its place. */
export function renamedModeSearch(search: URLSearchParams): string {
  const renamed = new URLSearchParams(search);
  renamed.set("mode", "challenge");
  return `?${renamed.toString()}`;
}
