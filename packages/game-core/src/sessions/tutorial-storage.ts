import { windowStore, type KeyValueStore } from "./storage";
import { replayTutorial, type TutorialMove } from "./tutorial-run";

/** Where the tutorial's moves are kept in this browser. Progress only: never read by anything else. */
export const TUTORIAL_STORAGE_KEY = "paved.tutorial.v1";

interface Saved {
  version: 1;
  moves: readonly TutorialMove[];
}

function isMove(value: unknown): value is TutorialMove {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.kind === "discard") return true;
  return v.kind === "build" && Number.isInteger(v.orientation) && Number.isInteger(v.x) && Number.isInteger(v.y);
}

/** The saved moves, or none when nothing is saved, storage fails, or the save no longer replays on the engine. */
export function loadMoves(store: () => KeyValueStore | null = windowStore): TutorialMove[] {
  try {
    const raw = store()?.getItem(TUTORIAL_STORAGE_KEY);
    if (!raw) return [];
    const saved = JSON.parse(raw) as Partial<Saved>;
    if (saved.version !== 1 || !Array.isArray(saved.moves) || !saved.moves.every(isMove)) return [];
    replayTutorial(saved.moves);
    return saved.moves;
  } catch {
    return [];
  }
}

/** Saves the moves (an empty run clears the entry). A failure is ignored: the page works without storage. */
export function saveMoves(moves: readonly TutorialMove[], store: () => KeyValueStore | null = windowStore): void {
  try {
    const s = store();
    if (!s) return;
    if (moves.length === 0) s.removeItem(TUTORIAL_STORAGE_KEY);
    else s.setItem(TUTORIAL_STORAGE_KEY, JSON.stringify({ version: 1, moves } satisfies Saved));
  } catch {
    // Storage is full, blocked or gone: the run goes on in memory.
  }
}
