import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { CobbleAccount, DecodedEvent, WriteResult } from "@paved/chain";
import { cobbleKeys } from "./cobbles";
import type { DailyMilestoneWrites, DailyMilestonesView } from "./daily-milestones";
import { milestoneKey, weeklyMilestoneKey } from "./milestone-reads";
import { useDataSources, type DataSources } from "./sources";
import type { WeeklyMilestoneWrites, WeeklyMilestonesView } from "./weekly-milestones";

// The day's milestones (#869) and the week's (#976) on the Missions page: the claims, served by the mock ledger until the
// contracts have them (#738), beside the reads (`milestone-reads.ts`, kept apart so a first-page reader, such as the home's
// Missions count of #976's PR 2, need not load the claims). Their own module, the Missions page's alone.

export { milestoneKey, useDailyMilestones, useWeeklyMilestones, weeklyMilestoneKey } from "./milestone-reads";

/** The signer's milestone claim, or null: no signer, or one without it. */
export function dailyMilestoneSigner(sources: Pick<DataSources, "signer">): DailyMilestoneWrites | null {
  const s = sources.signer as (Partial<DailyMilestoneWrites> & { address: string }) | null | undefined;
  return s && typeof s.claimDailyMilestone === "function" ? (s as DailyMilestoneWrites) : null;
}

/** The signer's claim of a week's milestone (#976), or null: no signer, or one without it. */
export function weeklyMilestoneSigner(sources: Pick<DataSources, "signer">): WeeklyMilestoneWrites | null {
  const s = sources.signer as (Partial<WeeklyMilestoneWrites> & { address: string }) | null | undefined;
  return s && typeof s.claimWeeklyMilestone === "function" ? (s as WeeklyMilestoneWrites) : null;
}

/**
 * A milestone's receipt into the cache: each `DailyMilestoneClaimed` sets the balance and the day's claimed bit, each
 * `WeeklyMilestoneClaimed` (#976) the balance and the week's.
 */
export function applyMilestoneEvents(client: QueryClient, playerId: string, events: readonly DecodedEvent[]): void {
  for (const { name, fields } of events) {
    if (name !== "DailyMilestoneClaimed" && name !== "WeeklyMilestoneClaimed") continue;
    const bit = 1 << Number(fields.step);
    client.setQueryData<CobbleAccount | null>(cobbleKeys.account(playerId), (a) => (a ? { ...a, cobbles: Number(fields.balance) } : a));
    if (name === "DailyMilestoneClaimed") client.setQueryData<DailyMilestonesView>(milestoneKey(playerId, Number(fields.day)), (m) => (m ? { ...m, claimed: m.claimed | bit } : m));
    else client.setQueryData<WeeklyMilestonesView>(weeklyMilestoneKey(playerId, Number(fields.week)), (m) => (m ? { ...m, claimed: m.claimed | bit } : m));
  }
}

/** A period's milestone claims through `send` (null: read only): the receipt's events into the cache, then the ledger's reads invalidated. */
function useClaims<C>(playerId: string | null, claimer: C | null, send: (claimer: C, period: number, step: number) => Promise<WriteResult>) {
  const client = useQueryClient();
  const mutation = useMutation<WriteResult, Error, { period: number; step: number }>({
    mutationFn: ({ period, step }) => (claimer ? send(claimer, period, step) : Promise.reject(new Error("Connect to claim"))),
    onSuccess: ({ events }) => {
      if (playerId) applyMilestoneEvents(client, playerId, events);
    },
    onSettled: () => client.invalidateQueries({ queryKey: cobbleKeys.all }),
  });
  return {
    claimer,
    claiming: mutation.isPending ? mutation.variables.step : null,
    claim: (period: number, step: number) => mutation.mutateAsync({ period, step }),
  };
}

/**
 * The milestone claims of the connected account (#869): `claim(day, step)` sends `claimDailyMilestone`, puts the receipt's
 * events into the cache, then invalidates the ledger's reads. `claiming` is the step on its way; `claimer` null: read only.
 */
export function useMilestoneClaims(playerId: string | null) {
  return useClaims(playerId, dailyMilestoneSigner(useDataSources()), (c, day, step) => c.claimDailyMilestone(day, step));
}

/**
 * The week's milestone claims of the connected account (#976): `claim(week, step)` sends `claimWeeklyMilestone`, puts the
 * receipt's events into the cache, then invalidates the ledger's reads. `claiming` is the step on its way; `claimer` null: read only.
 */
export function useWeeklyMilestoneClaims(playerId: string | null) {
  return useClaims(playerId, weeklyMilestoneSigner(useDataSources()), (c, week, step) => c.claimWeeklyMilestone(week, step));
}
