import type { GameMode } from "@paved/chain";

/** The chain's mode (Daily), and Training: the free off-chain mode of the same route (it has no game id, no wallet, no chain). */
export type RouteMode = GameMode | "training";

/** `/game?mode=..&id=..` shows a game. Starting one is not a URL: see `start-game.ts`. `/game?mode=training` plays Training. */
export function buildGameRoute(params: { gameId?: number; mode: RouteMode; readonly?: boolean }): string {
  const search = new URLSearchParams({ mode: params.mode });
  if (params.gameId !== undefined && params.mode !== "training") search.set("id", String(params.gameId));
  if (params.readonly) search.set("readonly", "true");
  return `/game?${search.toString()}`;
}

/** Daily, whatever the param says: the on-chain Tutorial left (D-21), and the tutorial is the off-chain `/tutorial` page. */
export function modeFromParam(_mode: string | null | undefined): GameMode {
  return "daily";
}

/** True for `?mode=training`: the page plays the off-chain engine and reads nothing from the chain. */
export function isTrainingParam(mode: string | null | undefined): boolean {
  return mode === "training";
}

/** True for `?mode=tutorial`, the link of the on-chain Tutorial that left (D-21): the page sends it to `/tutorial`. */
export function isTutorialParam(mode: string | null | undefined): boolean {
  return mode === "tutorial";
}
