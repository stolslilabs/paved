import { useMutation, useQueries, useQuery, useQueryClient, type QueryClient, type UseQueryResult } from "@tanstack/react-query";
import type { CobbleAccount, CobbleClaim, CobbleViews, DecodedEvent, Definitions, GameViews, PavedWriter, PeriodProgress, WriteResult } from "@paved/chain";
import type { AchievementCobbles, PeriodClaims, QuestCobbles } from "../components/containers/cobble-types";
import type { AchievementRewardsData, MissionKey, QuestRewardsData } from "../components/scenes/missions-scene";
import { questPeriod, weekOfDay } from "../lib/quest-window";
import { addressKey, queryKeys } from "./keys";
import { useDataSources, type DataSources } from "./sources";

// The Cobbles of `Setup` (P9; cobbles v1, part 1): the balance, the credits and the claims, read from the chain's views
// (`CobbleViews`), each quest's and achievement's Cobbles from the indexer's definitions, and the claims sent through the
// signer. After a claim's receipt its events go into the cache (`setQueryData`), then one `invalidateQueries` on the keys it
// touched reconciles them. Nothing polls.

/**
 * The keys of the Cobbles reads, `[domain, read, ...args]` as `keys.ts`'s (which P6 is changing: they move there after it).
 * The ledger is read from the chain, not the indexer: right after a claim's receipt the chain has it, the indexer may not.
 */
export const cobbleKeys = {
  /** `Setup.account(player_id)`. */
  account: (playerId: string) => ["chain", "cobbles", "account", addressKey(playerId)] as const,
  /** `Setup.day_progress(player_id, day)`. */
  day: (playerId: string, day: number) => ["chain", "cobbles", "day", addressKey(playerId), day] as const,
  /** `Setup.week_progress(player_id, week)`. */
  week: (playerId: string, week: number) => ["chain", "cobbles", "week", addressKey(playerId), week] as const,
  /** Every read of the ledger: what a claim's receipt invalidates. */
  all: ["chain", "cobbles"] as const,
};

/**
 * The claims of the connected account: `PavedWriter`'s. The sources' `signer` is typed for the board's writes only
 * (`GameSigner`); the writer P6 gives there has these too, so they are read from it when present.
 */
export type ClaimSigner = Pick<PavedWriter, "address" | "claim" | "claimQuest" | "claimAchievement" | "claimDailyCredit" | "claimWeeklyCredit">;

/** The signer's claims, or null: no signer, or one without them (read only, "Connect to claim"). */
export function claimSigner(sources: Pick<DataSources, "signer">): ClaimSigner | null {
  const signer = sources.signer as (Partial<ClaimSigner> & { address: string }) | null | undefined;
  return signer && typeof signer.claim === "function" ? (signer as ClaimSigner) : null;
}

/**
 * The sources' Cobbles views, or null. `RpcGameViews` and `FakeGameViews` have them; `GameViews` does not require them (a
 * double of the board's views may not), so they are read when present. Probed by a read of the method, which the app's lazy
 * chain proxy (`routes/sources.ts`) answers too.
 */
export function cobbleViews(views: GameViews): CobbleViews | null {
  const v = views as GameViews & Partial<CobbleViews>;
  return typeof v.account === "function" && typeof v.dayProgress === "function" && typeof v.weekProgress === "function" ? (v as CobbleViews) : null;
}

/**
 * The quests with Cobbles, from the definitions. A quest's claim period is its `cobbles_kind` (the contract's copy of the
 * schedule); the scene places it as a daily or a weekly by its `duration` (`questPeriod`). The two must agree: a quest on
 * which they differ is left out, so no Claim is offered for a period the scene does not show.
 */
export function questCobbles(definitions: Definitions): QuestCobbles[] {
  return definitions.quests.flatMap((d) =>
    d.cobbles > 0 && d.cobblesKind !== null && questPeriod({ start: d.startTime, interval: d.interval, duration: d.duration }) === d.cobblesKind ? [{ questId: d.questId, cobbles: d.cobbles, kind: d.cobblesKind }] : [],
  );
}

/** The achievements with Cobbles, from the definitions. */
export const achievementCobbles = (definitions: Definitions): AchievementCobbles[] =>
  definitions.achievements.flatMap((d) => (d.cobbles > 0 ? [{ achievementId: d.achievementId, cobbles: d.cobbles }] : []));

/** A period with nothing in it (`@paved/chain`'s `NO_PROGRESS`; a value import of the chain would bring starknet.js). */
const NO_PROGRESS: PeriodProgress = { games: 0, structures: 0, forests: 0, points: 0, claimed: 0n, credit: false };

const claims = (p: PeriodProgress): PeriodClaims => ({ claimed: p.claimed, credit: p.credit });

/** `Setup.account(player_id)`: the balance and the free-game credits (home's and play's Play free, a follow-up of P6). Null without the Cobbles views. */
export function useCobbleAccount(playerId: string | null): UseQueryResult<CobbleAccount | null> {
  const { views } = useDataSources();
  const ledger = cobbleViews(views);
  return useQuery({
    queryKey: cobbleKeys.account(playerId ?? "0x0"),
    queryFn: () => (ledger ? ledger.account(playerId as string) : null),
    enabled: playerId !== null,
  });
}

/** The free Challenge games left (`CobbleAccount.credits`): what Play free spends. Null without the Cobbles views. */
export function useFreeCredits(playerId: string | null): { data: number | null | undefined; isPending: boolean; error: Error | null } {
  const account = useCobbleAccount(playerId);
  return { data: account.data === undefined ? undefined : (account.data?.credits ?? null), isPending: account.isPending, error: account.error };
}

/**
 * The quests scene's `rewards` for the day shown: each quest's Cobbles (the definitions), the claims of the day and of its
 * week (`day_progress`, `week_progress`), the balance and the credits (`account`). Null without the Cobbles views. A day
 * before week 0 has no week: nothing claimed in it.
 */
export function useQuestRewards(playerId: string | null, day: number | null): { data: QuestRewardsData | null | undefined; isPending: boolean; error: Error | null } {
  const { views, indexer } = useDataSources();
  const ledger = cobbleViews(views);
  const id = playerId ?? "0x0";
  const week = day === null ? null : weekOfDay(day);
  const enabled = playerId !== null && day !== null && ledger !== null;
  return useQueries({
    queries: [
      { queryKey: queryKeys.indexer.definitions(), queryFn: async () => (await indexer.definitions()).data, enabled },
      { queryKey: cobbleKeys.account(id), queryFn: () => (ledger ? ledger.account(id) : null), enabled },
      { queryKey: cobbleKeys.day(id, day ?? 0), queryFn: () => ledger!.dayProgress(id, day as number), enabled },
      { queryKey: cobbleKeys.week(id, week ?? 0), queryFn: () => ledger!.weekProgress(id, week as number), enabled: enabled && week !== null },
    ],
    combine: ([definitions, account, dayProgress, weekProgress]) => {
      if (playerId !== null && day !== null && ledger === null) return { data: null, isPending: false, error: null };
      const weekRead = week === null ? NO_PROGRESS : weekProgress.data;
      const ready = definitions.data !== undefined && account.data !== undefined && dayProgress.data !== undefined && weekRead !== undefined;
      const error = definitions.error ?? account.error ?? dayProgress.error ?? weekProgress.error ?? null;
      return {
        data:
          ready && account.data
            ? {
                cobbles: questCobbles(definitions.data!),
                day: claims(dayProgress.data!),
                week: claims(weekRead!),
                balance: account.data.cobbles,
                credits: account.data.credits,
              }
            : undefined,
        // A failed read ends the wait: pending only while nothing failed.
        isPending: !ready && !error,
        error,
      };
    },
  });
}

/** The achievements scene's `rewards`: each achievement's Cobbles (the definitions), the claimed ones and the balance (`account`). Null without the Cobbles views. */
export function useAchievementRewards(playerId: string | null): { data: AchievementRewardsData | null | undefined; isPending: boolean; error: Error | null } {
  const { views, indexer } = useDataSources();
  const ledger = cobbleViews(views);
  const id = playerId ?? "0x0";
  const enabled = playerId !== null && ledger !== null;
  return useQueries({
    queries: [
      { queryKey: queryKeys.indexer.definitions(), queryFn: async () => (await indexer.definitions()).data, enabled },
      { queryKey: cobbleKeys.account(id), queryFn: () => (ledger ? ledger.account(id) : null), enabled },
    ],
    combine: ([definitions, account]) => {
      if (playerId !== null && ledger === null) return { data: null, isPending: false, error: null };
      const ready = definitions.data !== undefined && account.data !== undefined;
      const error = definitions.error ?? account.error ?? null;
      return {
        data:
          ready && account.data
            ? { cobbles: achievementCobbles(definitions.data!), claimed: account.data.achievementsClaimed, balance: account.data.cobbles }
            : undefined,
        isPending: !ready && !error,
        error,
      };
    },
  });
}

/**
 * A claim's receipt into the cache: each `CobblesClaimed` sets the balance and the claimed bit (a quest's in its day or
 * week, by the definitions' `cobbles_kind`), each `CreditClaimed` the credits, the period's credit and, when it pays bonus
 * Cobbles (PvP v2), the balance. The reads not in the cache are left to the reconciling read.
 */
export function applyClaimEvents(client: QueryClient, playerId: string, events: readonly DecodedEvent[]): void {
  const definitions = client.getQueryData<Definitions>(queryKeys.indexer.definitions());
  const kindOf = (questId: number) => definitions?.quests.find((d) => d.questId === questId)?.cobblesKind ?? null;
  const progress = (weekly: boolean, period: number, change: (p: PeriodProgress) => PeriodProgress) =>
    client.setQueryData<PeriodProgress>(weekly ? cobbleKeys.week(playerId, period) : cobbleKeys.day(playerId, period), (p) => (p ? change(p) : p));
  const account = (change: (a: CobbleAccount) => CobbleAccount) =>
    client.setQueryData<CobbleAccount | null>(cobbleKeys.account(playerId), (a) => (a ? change(a) : a));
  for (const { name, fields } of events) {
    const bit = 1n << BigInt(Number(fields.id ?? 0));
    const period = Number(fields.period);
    if (name === "CobblesClaimed") {
      account((a) => ({ ...a, cobbles: Number(fields.balance), achievementsClaimed: Number(fields.kind) === 2 ? a.achievementsClaimed | bit : a.achievementsClaimed }));
      const kind = Number(fields.kind) === 1 ? kindOf(Number(fields.id)) : null;
      if (kind !== null) progress(kind === "weekly", period, (p) => ({ ...p, claimed: p.claimed | bit }));
    } else if (name === "CreditClaimed") {
      // PvP v2 (#741, #738): a credit that pays bonus Cobbles names the new balance
      account((a) => ({ ...a, credits: Number(fields.credits), cobbles: fields.balance === undefined ? a.cobbles : Number(fields.balance) }));
      progress(Number(fields.kind) === 2, period, (p) => ({ ...p, credit: true }));
    }
  }
}

/** What a claim is for, as the Missions page shows it on its way (#832): a quest or an achievement. */
export type ClaimTarget = MissionKey;

/**
 * The claims of the connected account: `claim(target, claims)` sends them in one transaction (a multicall when several),
 * then puts the receipt's events into the cache and invalidates the ledger's reads. A refusal (`ClaimRefusedError`) is
 * `error`; the reads are invalidated then too (an earlier claim may have landed). `claiming` is the target on its way.
 * `claimer` is null without a signer that claims: read only.
 */
export function useClaims(playerId: string | null) {
  const sources = useDataSources();
  const claimer = claimSigner(sources);
  const client = useQueryClient();
  const mutation = useMutation<WriteResult, Error, { target: ClaimTarget; claims: CobbleClaim[] }>({
    mutationFn: ({ claims: batch }) => {
      if (!claimer) return Promise.reject(new Error("Connect to claim"));
      return batch.length === 1 ? one(claimer, batch[0]!) : claimer.claim(batch);
    },
    onSuccess: ({ events }) => {
      if (playerId) applyClaimEvents(client, playerId, events);
    },
    onSettled: () => client.invalidateQueries({ queryKey: cobbleKeys.all }),
  });
  return {
    claimer,
    claiming: mutation.isPending ? mutation.variables.target : null,
    error: mutation.error,
    reset: mutation.reset,
    claim: (target: ClaimTarget, batch: CobbleClaim[]) => mutation.mutateAsync({ target, claims: batch }),
  };
}

/** A single claim through its own entry point (the writer's per-claim methods). */
function one(claimer: ClaimSigner, c: CobbleClaim): Promise<WriteResult> {
  if (c.kind === "quest") return claimer.claimQuest(c.questId, c.period);
  if (c.kind === "achievement") return claimer.claimAchievement(c.achievementId);
  return c.credit === "daily" ? claimer.claimDailyCredit(c.period) : claimer.claimWeeklyCredit(c.period);
}
