import { replay, type TutorialMove } from "./tutorial-run";

/** Where the tutorial's moves are kept in this browser. Progress only: never read by anything else. */
export const TUTORIAL_STORAGE_KEY = "paved.tutorial.v1";

interface Saved {
  version: 1;
  moves: readonly TutorialMove[];
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function isMove(value: unknown): value is TutorialMove {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.kind === "discard") return true;
  return v.kind === "build" && Number.isInteger(v.orientation) && Number.isInteger(v.x) && Number.isInteger(v.y);
}

/** The saved moves, or none when nothing is saved, storage fails, or the save no longer replays on the engine. */
export function loadMoves(): TutorialMove[] {
  try {
    const raw = storage()?.getItem(TUTORIAL_STORAGE_KEY);
    if (!raw) return [];
    const saved = JSON.parse(raw) as Partial<Saved>;
    if (saved.version !== 1 || !Array.isArray(saved.moves) || !saved.moves.every(isMove)) return [];
    replay(saved.moves);
    return saved.moves;
  } catch {
    return [];
  }
}

/** Saves the moves (an empty run clears the entry). A failure is ignored: the page works without storage. */
export function saveMoves(moves: readonly TutorialMove[]): void {
  try {
    const store = storage();
    if (!store) return;
    if (moves.length === 0) store.removeItem(TUTORIAL_STORAGE_KEY);
    else store.setItem(TUTORIAL_STORAGE_KEY, JSON.stringify({ version: 1, moves } satisfies Saved));
  } catch {
    // Storage is full, blocked or gone: the run goes on in memory.
  }
}
