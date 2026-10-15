import { useEffect, useState } from "react";

/** The wall clock in seconds, each second: the countdowns (a game's `expiresAt`, the day's end) follow it. */
export function useNow(): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
