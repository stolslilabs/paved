// Whether a player shows as online (#952, open point 4's default): seen within the last 5 minutes.

/** How long after their last activity a player still shows as online, in seconds. */
export const ONLINE_WINDOW_S = 300;

/** Online: last seen (seconds since the epoch) less than `ONLINE_WINDOW_S` before `now` (seconds). */
export const isOnline = (lastSeen: number, now: number): boolean => now - lastSeen < ONLINE_WINDOW_S;
