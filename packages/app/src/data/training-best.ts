import { useMemo } from "react";
import type { KeyValueStore } from "@paved/game-core";

/** The best Training score of this device (#539), apart from the save: `paved.training-best.v1`. */
export const TRAINING_BEST_KEY = "paved.training-best.v1";

/** The best so far, the game (its seed) that set it, and the best before that game: a reload of its over page says "New best" again. */
interface BestRecord {
  score: number;
  seed: string;
  previous: number | null;
}

function read(store: KeyValueStore | null): BestRecord | null {
  try {
    const value = JSON.parse(store?.getItem(TRAINING_BEST_KEY) ?? "null") as Partial<BestRecord> | null;
    if (!value || typeof value.score !== "number" || typeof value.seed !== "string") return null;
    return { score: value.score, seed: value.seed, previous: typeof value.previous === "number" ? value.previous : null };
  } catch {
    return null;
  }
}

/**
 * The best before a finished Training game (`seed`, its `score`), and this game recorded when it beats it. Null on the
 * device's first game, or when the browser gives no storage. The game that set the best keeps the best before it, so its
 * over page reads the same after a reload.
 */
export function trainingPreviousBest(store: () => KeyValueStore | null, seed: string, score: number): number | null {
  let kv: KeyValueStore | null;
  try {
    kv = store();
  } catch {
    return null;
  }
  const record = read(kv);
  if (record?.seed === seed) return record.previous;
  const previous = record?.score ?? null;
  if (previous === null || score > previous) {
    try {
      kv?.setItem(TRAINING_BEST_KEY, JSON.stringify({ score, seed, previous } satisfies BestRecord));
    } catch {
      // A refused write: the next game compares with the old best.
    }
  }
  return previous;
}

/** `trainingPreviousBest` once per game; null, and nothing written, while the game is not over (`score` null). */
export function useTrainingPreviousBest(store: () => KeyValueStore | null, seed: string, score: number | null): number | null {
  return useMemo(() => (score === null ? null : trainingPreviousBest(store, seed, score)), [store, seed, score]);
}
