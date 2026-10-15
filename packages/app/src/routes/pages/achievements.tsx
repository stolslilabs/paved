import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { CobbleClaim } from "@paved/chain";
import { AchievementsScene } from "../../components/scenes/achievements-scene";
import { isClaimed } from "../../components/containers/cobble-types";
import { useDataSources } from "../../data/sources";
import { usePlayerAchievements } from "../../data/indexer";
import { cobbleKeys, useAchievementRewards, useClaims, type ClaimTarget } from "../../data/cobbles";
import { useCompletionMemory } from "../../data/completion-memory";
import { queryKeys } from "../../data/keys";
import { useAppNavigate, useTabNavigate } from "../ref";

/**
 * `/achievements` (P9): the player's achievements from the indexer, their Cobbles and the claimed ones from `Setup`'s ledger
 * (`useAchievementRewards`); Claim and Claim all (one multicall) through the signer, the cache following the receipt's
 * events. Guest and read only as on `/quests`.
 */
export default function Page() {
  const go = useAppNavigate();
  const onNavigate = useTabNavigate();
  const sources = useDataSources();
  const playerId = sources.signer?.address ?? null;
  const achievements = usePlayerAchievements(playerId);
  const rewards = useAchievementRewards(playerId);
  const claims = useClaims(playerId);
  const toasts = useCompletionMemory(playerId, "achievement");
  const client = useQueryClient();

  const send = (target: ClaimTarget, batch: CobbleClaim[]) => {
    claims.claim(target, batch).catch((e: unknown) => toast.error("The claim did not go through", { description: e instanceof Error ? e.message : String(e) }));
  };
  const claimAll = () => {
    const r = rewards.data;
    if (!r || !achievements.data) return;
    const batch = achievements.data.achievements.flatMap((a): CobbleClaim[] =>
      a.completed && r.cobbles.some((c) => c.achievementId === a.achievementId) && !isClaimed(r.claimed, a.achievementId)
        ? [{ kind: "achievement", achievementId: a.achievementId }]
        : [],
    );
    if (batch.length > 0) send("all", batch);
  };

  return (
    <AchievementsScene
      achievements={achievements.data ?? null}
      connected={playerId !== null}
      // The ledger's failure leaves the achievements shown, without their Cobbles.
      error={achievements.error?.message ?? null}
      rewards={rewards.data ? { ...rewards.data, claiming: claims.claiming === "daily" || claims.claiming === "weekly" ? null : claims.claiming } : null}
      canClaim={claims.claimer !== null}
      toasts={toasts}
      onClaim={(achievementId) => send(achievementId, [{ kind: "achievement", achievementId }])}
      onClaimAll={claimAll}
      onTab={(tab) => go(tab === "quests" ? "/quests" : "/achievements")}
      onConnect={() => go("/welcome")}
      onRetry={() => {
        void client.invalidateQueries({ queryKey: queryKeys.indexer.all });
        void client.invalidateQueries({ queryKey: cobbleKeys.all });
      }}
      onNavigate={onNavigate}
    />
  );
}
