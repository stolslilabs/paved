import { browserStore, type KeyValueStore } from "./storage";

/** One move of a saved game: the placement of the tile in hand, or a discard, or the surrender. */
export type SavedMove = { k: "b"; o: number; x: number; y: number } | { k: "d" } | { k: "s" };

/** The game in progress: the seed and the moves, replayed on load (the engine stays the only source of truth). */
export interface SavedGame {
  /** 1: a game before #645 (the seed reseeded by each placement); 2: the three-tile queue of #645. */
  v: 1 | 2;
  /** The seed as a hex felt. */
  seed: string;
  moves: SavedMove[];
}

export const TRAINING_KEY = "paved:training:v1";

function isMove(m: unknown): m is SavedMove {
  if (typeof m !== "object" || m === null) return false;
  const k = (m as { k?: unknown }).k;
  if (k === "d" || k === "s") return true;
  const b = m as { o?: unknown; x?: unknown; y?: unknown };
  return k === "b" && Number.isInteger(b.o) && Number.isInteger(b.x) && Number.isInteger(b.y);
}

/** The saved game, or null: nothing saved, storage unavailable, or a value that is not a saved game. */
export function loadGame(store: () => KeyValueStore | null = browserStore): SavedGame | null {
  try {
    const raw = store()?.getItem(TRAINING_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<SavedGame>;
    if ((value.v !== 1 && value.v !== 2) || typeof value.seed !== "string" || !/^0x[0-9a-f]{1,64}$/.test(value.seed)) return null;
    if (!Array.isArray(value.moves) || !value.moves.every(isMove)) return null;
    return { v: value.v, seed: value.seed, moves: value.moves };
  } catch {
    return null;
  }
}

/** Saves the game; false when storage refused (the game still plays, it is just not resumable). */
export function saveGame(game: SavedGame, store: () => KeyValueStore | null = browserStore): boolean {
  try {
    const s = store();
    if (!s) return false;
    s.setItem(TRAINING_KEY, JSON.stringify(game));
    return true;
  } catch {
    return false;
  }
}

export function clearGame(store: () => KeyValueStore | null = browserStore): void {
  try {
    store()?.removeItem(TRAINING_KEY);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}
