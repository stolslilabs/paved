const KEY = "welcomed";

/** Kept beside `localStorage`: with storage off the welcome shows once per page load, not on every visit to Home. */
let memory = false;

/** Whether the welcome was seen. Storage that throws (private mode, blocked site data) counts as not seen. */
export function hasWelcomed(): boolean {
  if (memory) return true;
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** Marks the visit. A refused write is not an error: the welcome then shows again on the next load. */
export function markWelcomed(): void {
  memory = true;
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    // Storage off: the in-memory flag above is all there is.
  }
}

/** For the tests: forget the in-memory flag. */
export function resetWelcomedForTests(): void {
  memory = false;
}
