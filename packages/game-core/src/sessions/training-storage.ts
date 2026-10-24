import { browserStore, type KeyValueStore } from "./storage";

/**
 * The key Training saved its game in progress under, before Training stopped saving it (#718): every entry now starts a
 * new game, held in memory only. Kept so the old save can be cleared (`clearGame`); nothing writes it any more.
 */
export const TRAINING_KEY = "paved:training:v1";

/** Removes the old Training save of this device, if any (#718). */
export function clearGame(store: () => KeyValueStore | null = browserStore): void {
  try {
    store()?.removeItem(TRAINING_KEY);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}
