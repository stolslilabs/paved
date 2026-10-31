// Whether a player shows as online (#952, open point 4's default): seen within the last 5 minutes.

/** How long after their last activity a player still shows as online, in seconds. */
export const ONLINE_WINDOW_S = 300;

/** Online: last seen (seconds since the epoch) less than `ONLINE_WINDOW_S` before `now` (seconds). */
export const isOnline = (lastSeen: number, now: number): boolean => now - lastSeen < ONLINE_WINDOW_S;

/**
 * Players in the order the social lists show them (#954): those online first, then the most recently seen. Players seen at
 * the same time keep their given order. A new array; `players` is left as it is.
 */
export function byPresence<T extends { lastSeen: number }>(players: readonly T[], now: number): T[] {
  return [...players].sort((a, b) => Number(isOnline(b.lastSeen, now)) - Number(isOnline(a.lastSeen, now)) || b.lastSeen - a.lastSeen);
}
