const KEY = "home-score-open";

/** Kept beside `localStorage`, as `chests-seen` is: with storage off the choice holds for the visit. */
let memory: boolean | null = null;

/**
 * The home's village score unfolded on this device (#831, open point 2: kept across visits). Default, and with storage off or
 * a value not written here: folded.
 */
export function scoreOpenStored(): boolean {
  if (memory !== null) return memory;
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** Keeps the fold. A refused write is not an error: the next load opens folded. */
export function storeScoreOpen(open: boolean): void {
  memory = open;
  try {
    localStorage.setItem(KEY, open ? "1" : "0");
  } catch {
    // Storage off: the in-memory choice above is all there is.
  }
}

/** For the tests: forget the in-memory choice. */
export function resetScoreOpenForTests(): void {
  memory = null;
}
