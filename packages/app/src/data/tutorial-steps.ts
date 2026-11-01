import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { CobbleAccount, DecodedEvent, WriteResult } from "@paved/chain";
import { cobbleKeys } from "./cobbles";
import { addressKey } from "./keys";
import { useDataSources, type DataSources } from "./sources";
import type { TutorialView, TutorialViews, TutorialWrites } from "./tutorial";

// The Tutorial's steps (#977) on the Missions page: the read and the claims, served by the mock ledger until the contracts have
// them (#738). Their own module, the page's alone; the rules are game-core's (`tutorialStates`, `tutorialStepRefusal`).

/**
 * The Tutorial's counts and claims, under the ledger's reads (`cobbleKeys.all`), so a claim's receipt invalidates them too. The
 * counts move with the other writes (a layout saved, a game finished, an attack, a chest, a purchase, a gift claimed): the read
 * is never fresh, so the page reads it again each time it opens.
 */
export const tutorialKey = (playerId: string) => [...cobbleKeys.all, "tutorial", addressKey(playerId)] as const;

/** The Tutorial of `playerId`: null where the views do not serve it (the chain before #738, or a views double without it), disabled without a player. */
export function useTutorialSteps(playerId: string | null): { data: TutorialView | null | undefined; isPending: boolean; error: Error | null } {
  const views = useDataSources().views as Partial<TutorialViews>;
  const served = typeof views.tutorialSteps === "function";
  const enabled = served && playerId !== null;
  const query = useQuery({ queryKey: tutorialKey(playerId ?? "0x0"), queryFn: () => views.tutorialSteps!(playerId!), enabled, staleTime: 0 });
  return enabled ? { data: query.data, isPending: query.isPending && !query.error, error: query.error } : { data: null, isPending: false, error: null };
}

/** The signer's claim of a step, or null: no signer, or one without it. */
export function tutorialSigner(sources: Pick<DataSources, "signer">): TutorialWrites | null {
  const s = sources.signer as (Partial<TutorialWrites> & { address: string }) | null | undefined;
  return s && typeof s.claimTutorialStep === "function" ? (s as TutorialWrites) : null;
}

/** A step's receipt into the cache: each `TutorialStepClaimed` sets the balance and the step's claimed bit. */
export function applyTutorialEvents(client: QueryClient, playerId: string, events: readonly DecodedEvent[]): void {
  for (const { name, fields } of events) {
    if (name !== "TutorialStepClaimed") continue;
    const bit = 1 << (Number(fields.step) - 1);
    client.setQueryData<CobbleAccount | null>(cobbleKeys.account(playerId), (a) => (a ? { ...a, cobbles: Number(fields.balance) } : a));
    client.setQueryData<TutorialView>(tutorialKey(playerId), (t) => (t ? { ...t, claimed: t.claimed | bit } : t));
  }
}

/**
 * The step claims of the connected account (#977): `claim(id)` sends `claimTutorialStep`, puts the receipt's events into the
 * cache, then invalidates the ledger's reads. `claiming` is the step on its way; `claimer` null: read only.
 */
export function useTutorialClaims(playerId: string | null) {
  const client = useQueryClient();
  const claimer = tutorialSigner(useDataSources());
  const mutation = useMutation<WriteResult, Error, number>({
    mutationFn: (id) => (claimer ? claimer.claimTutorialStep(id) : Promise.reject(new Error("Connect to claim"))),
    onSuccess: ({ events }) => {
      if (playerId) applyTutorialEvents(client, playerId, events);
    },
    onSettled: () => client.invalidateQueries({ queryKey: cobbleKeys.all }),
  });
  return {
    claimer,
    claiming: mutation.isPending ? mutation.variables : null,
    claim: (id: number) => mutation.mutateAsync(id),
  };
}
