import { useQuery } from "@tanstack/react-query";
import { cobbleKeys } from "./cobbles";
import type { DailyMilestoneViews, DailyMilestonesView } from "./daily-milestones";
import { addressKey } from "./keys";
import { useDataSources } from "./sources";
import type { WeeklyMilestoneViews, WeeklyMilestonesView } from "./weekly-milestones";

// The reads of the day's milestones (#869) and the week's (#976), served by the mock ledger until the contracts have them
// (#738). Apart from their claims (`milestones.ts`, the Missions page's), and kept small: the home's Missions count (#976's PR 2)
// is to read them with the first page, under the first load's budget.

/** The day's milestones claimed, under the ledger's reads (`cobbleKeys.all`), so a claim's receipt invalidates them too. */
export const milestoneKey = (playerId: string, day: number) => [...cobbleKeys.all, "milestones", addressKey(playerId), day] as const;

/** The week's milestones claimed (#976), under the ledger's reads too. */
export const weeklyMilestoneKey = (playerId: string, week: number) => [...cobbleKeys.all, "weekly-milestones", addressKey(playerId), week] as const;

type MilestonesRead<T> = { data: T | null | undefined; isPending: boolean; error: Error | null };
type Reads = Partial<DailyMilestoneViews & WeeklyMilestoneViews>;

/**
 * A period's milestones claimed through the views' `name` read: null where the views do not serve it (the chain before #738,
 * or a views double without it), disabled without a player or a period.
 */
function useMilestones<T>(name: keyof Reads, key: readonly unknown[], playerId: string | null, period: number | null): MilestonesRead<T> {
  const views = useDataSources().views as Reads;
  const served = typeof views[name] === "function";
  const enabled = served && playerId !== null && period !== null;
  const query = useQuery({ queryKey: key, queryFn: () => views[name]!(playerId!, period!) as Promise<T>, enabled });
  return enabled ? { data: query.data, isPending: query.isPending && !query.error, error: query.error } : { data: null, isPending: false, error: null };
}

/** The milestones of `day` claimed (#869): null where they are not served (the chain before #738), disabled without a player or a day. */
export const useDailyMilestones = (playerId: string | null, day: number | null) =>
  useMilestones<DailyMilestonesView>("dailyMilestones", milestoneKey(playerId ?? "0x0", day ?? 0), playerId, day);

/** The milestones of `week` claimed (#976): null where they are not served (the chain before #738), disabled without a player or a week. */
export const useWeeklyMilestones = (playerId: string | null, week: number | null) =>
  useMilestones<WeeklyMilestonesView>("weeklyMilestones", weeklyMilestoneKey(playerId ?? "0x0", week ?? 0), playerId, week);
