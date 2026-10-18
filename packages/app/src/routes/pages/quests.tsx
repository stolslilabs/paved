import { useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toastError } from "../../components/containers/error-toast";
import { ViewError, type CobbleClaim } from "@paved/chain";
import { errorDetail } from "../error-detail";
import { QuestsScene } from "../../components/scenes/quests-scene";
import { isClaimed } from "../../components/containers/cobble-types";
import { useDataSources } from "../../data/sources";
import { usePlayerQuests, useDefinitions } from "../../data/indexer";
import { cobbleKeys, useClaims, useQuestRewards, type ClaimTarget } from "../../data/cobbles";
import { queryKeys } from "../../data/keys";
import { useCompletionMemory } from "../../data/completion-memory";
import { firstQuestDay, useIndexerNow } from "../../data/quests";
import { DAY_S, weekOfDay } from "../../lib/quest-window";
import { useAccount } from "../../wallet/wallet";
import { useAppNavigate, useTabNavigate } from "../ref";

/** `/quests/:day?` with a day number; anything else is today. */
const dayParam = (raw: string | undefined): number | null => (raw !== undefined && /^\d{1,12}$/.test(raw) ? Number(raw) : null);

/**
 * `/quests/:day?` (P9): the day's quests from the indexer (`usePlayerQuests`, with each quest's schedule), their Cobbles and
 * free games from `Setup`'s ledger (`useQuestRewards`), on the indexer's clock (`useIndexerNow`): today is its day. Claim,
 * Claim all (one multicall) and the day's and the week's free game go through the signer; after a receipt the cache follows
 * its events (`useClaims`). A past day's Cobbles stay claimable. The player is the signer's address: without a signer the
 * page is a guest's; with one that cannot claim, it is read only ("Connect to claim"). The toasts remember, per player,
 * what they announced (`useCompletionMemory`). * A wallet approved earlier is looked for here too (`useAccount`), so a returning player can claim at once.
 */
export default function Page() {
  const params = useParams();
  const go = useAppNavigate();
  const onNavigate = useTabNavigate();
  useAccount();
  const sources = useDataSources();
  const playerId = sources.signer?.address ?? null;
  const clock = useIndexerNow();
  const today = clock.now === null ? null : Math.floor(clock.now / DAY_S);
  const asked = dayParam(params.day);
  const day = asked !== null && today !== null && asked <= today ? asked : today;
  const quests = usePlayerQuests(playerId, day);
  const definitions = useDefinitions();
  const rewards = useQuestRewards(playerId, day);
  const claims = useClaims(playerId);
  const toasts = useCompletionMemory(playerId, "quest");
  const client = useQueryClient();
  const retry = () => {
    void client.invalidateQueries({ queryKey: queryKeys.indexer.all });
    void client.invalidateQueries({ queryKey: cobbleKeys.all });
  };

  // The ledger's failure (a deployment without Setup, a dropped RPC) leaves the quests shown, without their Cobbles.
  const error = clock.error ?? quests.error ?? definitions.error;
  const rewardsUnavailable = rewards.error instanceof ViewError && rewards.error.kind === "not-available" ? rewards.error.message : null;
  const firstDay = definitions.data ? (firstQuestDay(definitions.data) ?? today) : today;

  const send = (target: ClaimTarget, batch: CobbleClaim[]) => {
    claims.claim(target, batch).catch((e: unknown) => toastError({ title: "The claim did not go through", message: e instanceof Error ? e.message : String(e), detail: errorDetail(e) }));
  };
  const period = (questId: number): number | null => {
    const kind = rewards.data?.cobbles.find((c) => c.questId === questId)?.kind;
    if (kind === undefined || day === null) return null;
    return kind === "weekly" ? weekOfDay(day) : day;
  };
  const claimQuest = (questId: number) => {
    const p = period(questId);
    if (p !== null) send(questId, [{ kind: "quest", questId, period: p }]);
  };
  const claimAll = () => {
    const r = rewards.data;
    if (!r || !quests.data) return;
    const batch = quests.data.quests.flatMap((q): CobbleClaim[] => {
      const entry = r.cobbles.find((c) => c.questId === q.questId);
      const p = period(q.questId);
      if (!q.completed || !entry || p === null) return [];
      return isClaimed(entry.kind === "weekly" ? r.week.claimed : r.day.claimed, q.questId) ? [] : [{ kind: "quest", questId: q.questId, period: p }];
    });
    if (batch.length > 0) send("all", batch);
  };
  const claimCredit = (kind: "daily" | "weekly") => {
    const p = day === null ? null : kind === "daily" ? day : weekOfDay(day);
    if (p !== null) send(kind, [{ kind: "credit", credit: kind, period: p }]);
  };

  if (today === null || day === null) {
    // The clock first: without it there is no day to show. Its failure is the page's error.
    return <QuestsScene day={0} today={0} firstDay={0} quests={null} connected={playerId !== null} now={0} error={clock.error?.message ?? null} errorDetail={clock.error ? errorDetail(clock.error) : undefined} onNavigate={onNavigate} onRetry={retry} />;
  }

  return (
    <QuestsScene
      day={day}
      today={today}
      firstDay={Math.min(firstDay ?? today, day)}
      quests={quests.data ?? null}
      connected={playerId !== null}
      error={error?.message ?? null}
      rewardsUnavailable={rewardsUnavailable}
      errorDetail={error ? errorDetail(error) : undefined}
      now={clock.now!}
      rewards={rewards.data ? { ...rewards.data, claiming: claims.claiming } : null}
      canClaim={claims.claimer !== null}
      toasts={toasts}
      onDayChange={(d) => go(d === today ? "/quests" : `/quests/${d}`)}
      onClaim={claimQuest}
      onClaimAll={claimAll}
      onClaimCredit={claimCredit}
      onTab={(tab) => go(tab === "achievements" ? "/achievements" : "/quests")}
      onConnect={() => go("/welcome")}
      onRetry={retry}
      onNavigate={onNavigate}
    />
  );
}
