import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { CobbleAccount, DecodedEvent, GameViews, WriteResult } from "@paved/chain";
import { cobbleKeys } from "./cobbles";
import type { DailyMilestoneViews, DailyMilestoneWrites, DailyMilestonesView } from "./daily-milestones";
import { addressKey } from "./keys";
import { useDataSources, type DataSources } from "./sources";

// The day's milestones on the Missions page (#869): the read and the claim, served by the mock ledger until the contracts have
// them (#738). Their own module, the Missions page's alone: the header's balances load `cobbles.ts` with the first page.

/** The day's milestones claimed, under the ledger's reads (`cobbleKeys.all`), so a claim's receipt invalidates them too. */
export const milestoneKey = (playerId: string, day: number) => [...cobbleKeys.all, "milestones", addressKey(playerId), day] as const;

/** The sources' milestones read (#869), or null: the chain before #738, or a views double without it. */
export function dailyMilestoneViews(views: GameViews): DailyMilestoneViews | null {
  const v = views as GameViews & Partial<DailyMilestoneViews>;
  return typeof v.dailyMilestones === "function" ? (v as DailyMilestoneViews) : null;
}

/** The signer's milestone claim, or null: no signer, or one without it. */
export function dailyMilestoneSigner(sources: Pick<DataSources, "signer">): DailyMilestoneWrites | null {
  const s = sources.signer as (Partial<DailyMilestoneWrites> & { address: string }) | null | undefined;
  return s && typeof s.claimDailyMilestone === "function" ? (s as DailyMilestoneWrites) : null;
}

/** The milestones of `day` claimed (#869): null where they are not served (the chain before #738), disabled without a player or a day. */
export function useDailyMilestones(playerId: string | null, day: number | null): { data: DailyMilestonesView | null | undefined; isPending: boolean; error: Error | null } {
  const { views } = useDataSources();
  const read = dailyMilestoneViews(views);
  const query = useQuery({
    queryKey: milestoneKey(playerId ?? "0x0", day ?? 0),
    queryFn: () => read!.dailyMilestones(playerId!, day!),
    enabled: read !== null && playerId !== null && day !== null,
  });
  if (read === null || playerId === null || day === null) return { data: null, isPending: false, error: null };
  return { data: query.data, isPending: query.isPending && !query.error, error: query.error };
}

/** A milestone's receipt into the cache: each `DailyMilestoneClaimed` sets the balance and the day's claimed bit. */
export function applyMilestoneEvents(client: QueryClient, playerId: string, events: readonly DecodedEvent[]): void {
  for (const { name, fields } of events) {
    if (name !== "DailyMilestoneClaimed") continue;
    const day = Number(fields.day);
    client.setQueryData<CobbleAccount | null>(cobbleKeys.account(playerId), (a) => (a ? { ...a, cobbles: Number(fields.balance) } : a));
    client.setQueryData<DailyMilestonesView>(milestoneKey(playerId, day), (m) => (m ? { ...m, claimed: m.claimed | (1 << Number(fields.step)) } : m));
  }
}

/**
 * The milestone claims of the connected account (#869): `claim(day, step)` sends `claimDailyMilestone`, puts the receipt's
 * events into the cache, then invalidates the ledger's reads. `claiming` is the step on its way; `claimer` null: read only.
 */
export function useMilestoneClaims(playerId: string | null) {
  const claimer = dailyMilestoneSigner(useDataSources());
  const client = useQueryClient();
  const mutation = useMutation<WriteResult, Error, { day: number; step: number }>({
    mutationFn: ({ day, step }) => (claimer ? claimer.claimDailyMilestone(day, step) : Promise.reject(new Error("Connect to claim"))),
    onSuccess: ({ events }) => {
      if (playerId) applyMilestoneEvents(client, playerId, events);
    },
    onSettled: () => client.invalidateQueries({ queryKey: cobbleKeys.all }),
  });
  return {
    claimer,
    claiming: mutation.isPending ? mutation.variables.step : null,
    claim: (day: number, step: number) => mutation.mutateAsync({ day, step }),
  };
}
