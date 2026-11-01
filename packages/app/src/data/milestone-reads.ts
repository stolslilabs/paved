import { useQuery } from "@tanstack/react-query";
import type { GameViews } from "@paved/chain";
import { cobbleKeys } from "./cobbles";
import type { DailyMilestoneViews, DailyMilestonesView } from "./daily-milestones";
import { addressKey } from "./keys";
import { useDataSources } from "./sources";
import type { WeeklyMilestoneViews, WeeklyMilestonesView } from "./weekly-milestones";

// The reads of the day's milestones (#869) and the week's (#976), served by the mock ledger until the contracts have them
// (#738). Apart from their claims (`milestones.ts`, the Missions page's): the home's Missions count reads them with the first
// page, and the first load carries no more than this.

/** The day's milestones claimed, under the ledger's reads (`cobbleKeys.all`), so a claim's receipt invalidates them too. */
export const milestoneKey = (playerId: string, day: number) => [...cobbleKeys.all, "milestones", addressKey(playerId), day] as const;

/** The week's milestones claimed (#976), under the ledger's reads too. */
export const weeklyMilestoneKey = (playerId: string, week: number) => [...cobbleKeys.all, "weekly-milestones", addressKey(playerId), week] as const;

/** The sources' milestones read (#869), or null: the chain before #738, or a views double without it. */
export function dailyMilestoneViews(views: GameViews): DailyMilestoneViews | null {
  return typeof (views as Partial<DailyMilestoneViews>).dailyMilestones === "function" ? (views as GameViews & DailyMilestoneViews) : null;
}

/** The sources' read of the week's milestones (#976), or null: the chain before #738, or a views double without it. */
export function weeklyMilestoneViews(views: GameViews): WeeklyMilestoneViews | null {
  return typeof (views as Partial<WeeklyMilestoneViews>).weeklyMilestones === "function" ? (views as GameViews & WeeklyMilestoneViews) : null;
}

type MilestonesRead<T> = { data: T | null | undefined; isPending: boolean; error: Error | null };

/** A period's milestones claimed: null where `read` is not served, disabled without a player or a period. */
function useMilestones<T>(key: readonly unknown[], read: (() => Promise<T>) | null, enabled: boolean): MilestonesRead<T> {
  const query = useQuery({ queryKey: key, queryFn: () => read!(), enabled: read !== null && enabled });
  if (read === null || !enabled) return { data: null, isPending: false, error: null };
  return { data: query.data, isPending: query.isPending && !query.error, error: query.error };
}

/** The milestones of `day` claimed (#869): null where they are not served (the chain before #738), disabled without a player or a day. */
export function useDailyMilestones(playerId: string | null, day: number | null): MilestonesRead<DailyMilestonesView> {
  const views = dailyMilestoneViews(useDataSources().views);
  return useMilestones(milestoneKey(playerId ?? "0x0", day ?? 0), views && (() => views.dailyMilestones(playerId!, day!)), playerId !== null && day !== null);
}

/** The milestones of `week` claimed (#976): null where they are not served (the chain before #738), disabled without a player or a week. */
export function useWeeklyMilestones(playerId: string | null, week: number | null): MilestonesRead<WeeklyMilestonesView> {
  const views = weeklyMilestoneViews(useDataSources().views);
  return useMilestones(weeklyMilestoneKey(playerId ?? "0x0", week ?? 0), views && (() => views.weeklyMilestones(playerId!, week!)), playerId !== null && week !== null);
}
