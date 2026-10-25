const KEY = "chests-seen-day";

/** Kept beside `localStorage`, as `welcomed` is: with storage off the page seen holds for the visit. */
let memory = -1;

/** The UTC day of `seconds`, as game-core's `dayOf`: written here so the home's first load does not take game-core's index. */
export const utcDay = (seconds: number): number => Math.floor(seconds / 86_400);

/**
 * The last UTC day the Chests page was seen on this device (#759, the home's cue at the reset): until the page is seen on a new
 * day, the home's Chests badge also counts the day's free PvP slots. Storage that throws counts as the visit's memory alone.
 */
export function chestsSeenDay(): number {
  try {
    const raw = localStorage.getItem(KEY);
    return Math.max(memory, raw && /^\d+$/.test(raw) ? Number(raw) : -1);
  } catch {
    return memory;
  }
}

/** Marks the page seen today. A refused write is not an error: the badge then counts the free slots again on the next load. */
export function markChestsSeen(day: number): void {
  memory = Math.max(memory, day);
  try {
    localStorage.setItem(KEY, String(day));
  } catch {
    // Storage off: the in-memory day above is all there is.
  }
}

/** The home's Chests badge: the chests waiting, plus the day's free slots while the page has not been seen today. */
export function chestsBadge(waiting: number, freeSlots: number, day: number, seenDay: number): number {
  return waiting + (seenDay < day ? Math.max(0, freeSlots) : 0);
}

/** For the tests: forget the in-memory day. */
export function resetChestsSeenForTests(): void {
  memory = -1;
}
