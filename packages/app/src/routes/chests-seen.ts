import { createDeviceStore } from "../data/device-store";

/**
 * The last UTC day the Chests page was seen on this device (#759, the home's cue at the reset): until the page is seen on a new
 * day, the home's Chests badge also counts the day's free PvP slots. Storage off keeps it for the visit (the store's twin).
 */
export const chestsSeenDay = createDeviceStore<number>(
  "chests-seen-day",
  -1,
  (raw) => (/^\d+$/.test(raw) ? Number(raw) : null),
  String,
);

/** The home's Chests badge: the chests waiting, plus the day's free slots while the page has not been seen today. */
export function chestsBadge(waiting: number, freeSlots: number, day: number, seenDay: number): number {
  return waiting + (seenDay < day ? Math.max(0, freeSlots) : 0);
}
