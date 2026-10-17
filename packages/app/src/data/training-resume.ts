import { LocalSession, type KeyValueStore, type PageState, type SavedGame } from "@paved/game-core";

// Replays a Training save to its state. Apart from `training-save.ts`, which loads it with `import()`: a module that names
// `LocalSession` is a chunk the first route does not fetch, where `import("@paved/game-core")` would be the whole barrel.

/** The game a save stands at, or null when the save does not replay. */
export function resumedGame(saved: SavedGame, store: () => KeyValueStore | null): PageState["game"] | null {
  return LocalSession.resume(saved, store)?.state.game ?? null;
}
