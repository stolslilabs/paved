import type { GameMode } from "@paved/chain";

/**
 * `/game?mode=..&id=..` shows a game. `spawn: true` (no id) starts one: only the landing page's
 * confirm sets it, since a Daily spawn pays the entry.
 */
export function buildGameRoute(params: {
  gameId?: number;
  mode: GameMode;
  readonly?: boolean;
  spawn?: boolean;
  /** The Daily entry amount the player confirmed (base unit): the spawn refuses any other. */
  price?: bigint;
}): string {
  const search = new URLSearchParams({ mode: params.mode });
  if (params.gameId !== undefined) search.set("id", String(params.gameId));
  else if (params.spawn) {
    search.set("spawn", "1");
    if (params.price !== undefined) search.set("price", params.price.toString());
  }
  if (params.readonly) search.set("readonly", "true");
  return `/game?${search.toString()}`;
}

export function modeFromParam(mode: string | null | undefined): GameMode {
  return mode === "tutorial" ? "tutorial" : "daily";
}
