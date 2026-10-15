import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Definitions } from "@paved/chain";
import { DAY_S } from "../lib/quest-window";
import { useDataSources } from "./sources";

// The quests' clock and calendar (P9): the indexer's block time is `now` (section 12, P9's note), so the day shown, the
// windows and the countdowns follow the chain's time, not the browser's.

/** The key of the clock read (`/v1/head`'s served block); it moves to `keys.ts` after P6. */
export const clockKey = () => ["indexer", "clock"] as const;

/** The indexer's clock as read: the served block's time (seconds), and when it was read (the browser's ms). */
export interface IndexerClock {
  timestamp: number;
  readAt: number;
}

/**
 * The indexer's clock, ticking each second from its last read: the served block's time plus the time elapsed since. One
 * read, refreshed on focus like the others; the tick is a local timer, not a request. Null before the first read.
 */
export function useIndexerNow(): { now: number | null; error: Error | null } {
  const { indexer } = useDataSources();
  const clock = useQuery({
    queryKey: clockKey(),
    queryFn: async (): Promise<IndexerClock> => ({ timestamp: (await indexer.head()).head.timestamp, readAt: Date.now() }),
  });
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const data = clock.data;
  return { now: data ? data.timestamp + Math.max(0, Math.floor((tick - data.readAt) / 1000)) : null, error: clock.error };
}

/** The first day the quests have: the day the first quest was defined (the day picker goes no earlier); null with none. */
export function firstQuestDay(definitions: Definitions): number | null {
  const times = definitions.quests.map((q) => Math.max(q.definedAt, q.startTime));
  return times.length === 0 ? null : Math.floor(Math.min(...times) / DAY_S);
}
