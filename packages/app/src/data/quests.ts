import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Definitions } from "@paved/chain";
import { DAILY_MILESTONES, WEEKLY_MILESTONES, milestonesToClaim } from "@paved/game-core";
import { isClaimed } from "../components/containers/cobble-types";
import { DAY_S, questPeriod, weekOfDay } from "../lib/quest-window";
import { useQuestRewards } from "./cobbles";
import { usePlayerQuests } from "./indexer";
import { useDailyMilestones, useWeeklyMilestones } from "./milestone-reads";
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

/**
 * How many of today's missions wait to be claimed (#753, the home's Missions badge): completed, paying Cobbles, not claimed in
 * their period, as the Missions page's Claim all counts them; and the gifts reached and not claimed of the day's milestones
 * (#869) and of the week's (#976), whose dailies and weeklies pay none of their own. A period's gifts count once its milestones'
 * read is in (none where it is not served). 0 until the reads are in, without a player, or on a read's failure.
 */
export function useMissionsReady(playerId: string | null): number {
  const clock = useIndexerNow();
  const day = clock.now === null ? null : Math.floor(clock.now / DAY_S);
  const week = day === null ? null : weekOfDay(day);
  const quests = usePlayerQuests(playerId, day);
  const rewards = useQuestRewards(playerId, day);
  const dayGifts = useDailyMilestones(playerId, day);
  const weekGifts = useWeeklyMilestones(playerId, week);
  const r = rewards.data;
  if (playerId === null || !quests.data || !r) return 0;
  const live = quests.data.quests;
  const missions = live.filter((q) => {
    const entry = r.cobbles.find((c) => c.questId === q.questId);
    return q.completed && entry !== undefined && !isClaimed(entry.kind === "weekly" ? r.week.claimed : r.day.claimed, q.questId);
  }).length;
  const done = (period: "daily" | "weekly") => live.filter((q) => q.completed && questPeriod(q) === period).length;
  const dayToClaim = dayGifts.data ? milestonesToClaim(DAILY_MILESTONES, done("daily"), dayGifts.data.claimed) : 0;
  const weekToClaim = weekGifts.data ? milestonesToClaim(WEEKLY_MILESTONES, done("weekly"), weekGifts.data.claimed) : 0;
  return missions + dayToClaim + weekToClaim;
}
