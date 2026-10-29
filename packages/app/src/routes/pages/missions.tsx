import { useQueryClient } from "@tanstack/react-query";
import { toastError } from "../../components/containers/error-toast";
import { ViewError, type CobbleClaim } from "@paved/chain";
import { errorDetail } from "../error-detail";
import { MissionsScene } from "../../components/scenes/missions-scene";
import { useDataSources } from "../../data/sources";
import { usePlayerAchievements, usePlayerQuests } from "../../data/indexer";
import { cobbleKeys, useAchievementRewards, useClaims, useQuestRewards, type ClaimTarget } from "../../data/cobbles";
import { useDailyMilestones, useMilestoneClaims } from "../../data/milestones";
import { queryKeys } from "../../data/keys";
import { useIndexerNow } from "../../data/quests";
import { DAY_S, weekOfDay } from "../../lib/quest-window";
import { useAccount } from "../../wallet/wallet";
import { useBack, useAppNavigate, useTabNavigate } from "../ref";

/**
 * `/missions` (P9, #832): one page, today only, on the indexer's clock (`useIndexerNow`). Today's quests (`usePlayerQuests`, with
 * each quest's schedule) and the player's achievements from the indexer, their Cobbles from `Setup`'s ledger (`useQuestRewards`,
 * `useAchievementRewards`) and today's milestones (`useDailyMilestones`, #869). A quest's, an achievement's, the week's bonus or a
 * milestone's claim goes through the signer; after a receipt the cache follows its events (`useClaims`, `useMilestoneClaims`). The player is the signer's address: without a signer the page is a guest's; with one
 * that cannot claim, it is read only ("Connect to claim"). A wallet approved earlier is looked for here too (`useAccount`), so a
 * returning player can claim at once. The completion toasts are the app's (`routes/completion-host.tsx`).
 */
export default function Page() {
  const go = useAppNavigate();
  const onNavigate = useTabNavigate();
  const onBack = useBack();
  useAccount();
  const sources = useDataSources();
  const playerId = sources.signer?.address ?? null;
  const clock = useIndexerNow();
  const day = clock.now === null ? null : Math.floor(clock.now / DAY_S);
  const quests = usePlayerQuests(playerId, day);
  const achievements = usePlayerAchievements(playerId);
  const questRewards = useQuestRewards(playerId, day);
  const achievementRewards = useAchievementRewards(playerId);
  const claims = useClaims(playerId);
  const milestones = useDailyMilestones(playerId, day);
  const milestoneClaims = useMilestoneClaims(playerId);
  const client = useQueryClient();
  const retry = () => {
    void client.invalidateQueries({ queryKey: queryKeys.indexer.all });
    void client.invalidateQueries({ queryKey: cobbleKeys.all });
  };

  // The ledger's failure (a deployment without Setup, a dropped RPC) leaves the missions shown, without their Cobbles.
  const error = clock.error ?? quests.error ?? achievements.error;
  const unavailable = [questRewards.error, achievementRewards.error].find((e) => e instanceof ViewError && e.kind === "not-available");

  const send = (target: ClaimTarget, claim: CobbleClaim) => {
    claims.claim(target, [claim]).catch((e: unknown) => toastError({ title: "The claim did not go through", message: e instanceof Error ? e.message : String(e), detail: errorDetail(e) }));
  };
  const claimQuest = (questId: number) => {
    const kind = questRewards.data?.cobbles.find((c) => c.questId === questId)?.kind;
    const period = kind === undefined || day === null ? null : kind === "weekly" ? weekOfDay(day) : day;
    if (period !== null) send(`quest:${questId}`, { kind: "quest", questId, period });
  };
  const claimMilestone = (step: number) => {
    if (day === null) return;
    milestoneClaims.claim(day, step).catch((e: unknown) => toastError({ title: "The claim did not go through", message: e instanceof Error ? e.message : String(e), detail: errorDetail(e) }));
  };
  const claimBonus = (kind: "daily" | "weekly") => {
    const period = day === null ? null : kind === "daily" ? day : weekOfDay(day);
    if (period !== null) send(`bonus:${kind}`, { kind: "credit", credit: kind, period });
  };

  return (
    <MissionsScene
      quests={day === null ? null : (quests.data ?? null)}
      achievements={achievements.data ?? null}
      connected={playerId !== null}
      error={error?.message ?? null}
      errorDetail={error ? errorDetail(error) : undefined}
      rewardsUnavailable={unavailable?.message ?? null}
      now={clock.now ?? 0}
      questRewards={questRewards.data ?? null}
      achievementRewards={achievementRewards.data ?? null}
      milestones={milestones.data ?? null}
      claiming={claims.claiming}
      claimingMilestone={milestoneClaims.claiming}
      canClaim={claims.claimer !== null}
      onClaimQuest={claimQuest}
      onClaimAchievement={(achievementId) => send(`achievement:${achievementId}`, { kind: "achievement", achievementId })}
      onClaimBonus={claimBonus}
      onClaimMilestone={claimMilestone}
      onConnect={() => go("/welcome")}
      onRetry={retry}
      onBack={onBack}
      onNavigate={onNavigate}
    />
  );
}
