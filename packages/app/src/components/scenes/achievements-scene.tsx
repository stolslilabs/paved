import { useMemo } from "react";
import type { PlayerAchievements } from "@paved/chain";
import type { Tab } from "../../routes/pages";
import { Button } from "../ui/button";
import { Progress } from "../ui/progress";
import { Skeleton } from "../ui/skeleton";
import { Gems } from "../elements/gems";
import { Notice } from "../elements/notice";
import { isClaimed, type AchievementGems } from "../containers/gem-types";
import { useCompletionToasts } from "../containers/completion-toasts";
import { ProgressCard, progressState, type ProgressReward } from "../containers/progress-card";
import { achievementText } from "../containers/quest-text";
import { QuestsTabs, type QuestsTab } from "../containers/quests-tabs";
import { TabPage } from "../containers/tab-page";

/** The achievements' gems (P-61, gems-v1.md 3.1, 3.3): provisional until CORE's gems PR 1. */
export interface AchievementRewards {
  /** `achievement_gems`: the points; On the Podium (9) has none in v1, so it is absent. */
  gems: readonly AchievementGems[];
  /** `AccountView.achievements_claimed`. */
  claimed: bigint;
  /** `AccountView.gems`. */
  balance: number;
  /** An achievement's claim, or all of them, on its way. */
  claiming?: number | "all" | null;
}

export interface AchievementsSceneProps {
  /** `/v1/players/:id/achievements`; null while it loads. */
  achievements: PlayerAchievements | null;
  connected: boolean;
  error?: string | null;
  /** The gems; omitted before gems. */
  rewards?: AchievementRewards | null;
  onTab?: (tab: QuestsTab) => void;
  /** `claim_achievement(achievement_id)`. */
  onClaim?: (achievementId: number) => void;
  /** Every claimable achievement, in one multicall. */
  onClaimAll?: () => void;
  onConnect?: () => void;
  onRetry?: () => void;
  onNavigate?: (tab: Tab) => void;
}

const ORDER = { complete: 0, progress: 1, none: 2 } as const;

/**
 * The achievements (`/achievements`, a tab beside Quests): earned, in progress and locked, earned first; the points of the
 * earned ones, display only.
 */
export function AchievementsScene(props: AchievementsSceneProps) {
  const { achievements, connected, error, rewards } = props;
  const list = achievements ? [...achievements.achievements].sort((a, b) => ORDER[progressState(a)] - ORDER[progressState(b)]) : [];
  const tracked = useMemo(() => achievements?.achievements.map((a) => ({ id: a.achievementId, completed: a.completed, points: a.points })) ?? null, [achievements]);
  useCompletionToasts("achievement", tracked, ({ id, points }) => {
    const { title, icon } = achievementText(id);
    return { title, icon, description: `+${points} pts` };
  });
  const earned = list.filter((a) => a.completed).length;
  const possible = list.reduce((sum, a) => sum + a.points, 0);
  const claiming = rewards?.claiming ?? null;
  const rewardOf = (a: { achievementId: number; completed: boolean }): ProgressReward | undefined => {
    const entry = rewards?.gems.find((g) => g.achievementId === a.achievementId);
    if (!rewards || !entry || entry.gems === 0) return undefined;
    const claimed = isClaimed(rewards.claimed, a.achievementId);
    const mine = claiming === a.achievementId || (claiming === "all" && a.completed && !claimed);
    return { gems: entry.gems, claimed, claiming: mine, disabled: claiming !== null && !mine };
  };
  const claimable = list.map((a) => ({ a, r: rewardOf(a) })).filter(({ a, r }) => a.completed && r && !r.claimed);
  const claimableGems = claimable.reduce((sum, { r }) => sum + r!.gems, 0);
  return (
    <TabPage tab="quests" title="Achievements" onNavigate={props.onNavigate} end={rewards && connected ? <Gems value={rewards.balance} /> : undefined}>
      <QuestsTabs active="achievements" onSelect={props.onTab} />

      {!connected ? (
        <Notice title="Connect to see your achievements" action={<Button size="sm" onClick={props.onConnect}>Connect</Button>}>
          Achievements count your games over time: they need an account.
        </Notice>
      ) : error ? (
        <Notice tone="danger" title="Could not load the achievements" action={<Button size="sm" variant="outline" onClick={props.onRetry}>Retry</Button>}>
          {error}
        </Notice>
      ) : achievements === null ? (
        <div role="status" aria-label="Loading the achievements" className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          <section aria-label="Summary" data-slot="card" className="flex flex-col gap-2 rounded-xl border border-gold-900 bg-gold-950/40 p-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm">
                <span className="numeric font-semibold text-primary">{earned}</span>
                <span className="text-muted-foreground"> of </span>
                <span className="numeric font-semibold">{list.length}</span>
                <span className="text-muted-foreground"> earned</span>
              </span>
              <span className="text-sm">
                <span className="numeric font-semibold text-primary">{achievements.points}</span>
                <span className="text-muted-foreground"> / </span>
                <span className="numeric">{possible}</span>
                <span className="text-muted-foreground"> pts</span>
              </span>
            </div>
            <Progress value={possible > 0 ? (achievements.points / possible) * 100 : 0} aria-label={`${achievements.points} of ${possible} points`} />
            {claimable.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gold-900 pt-3">
                <span className="text-xs text-muted-foreground">
                  <span className="numeric">{claimable.length}</span> to claim
                </span>
                <Button size="sm" onClick={props.onClaimAll} loading={claiming === "all"} disabled={claiming !== null && claiming !== "all"}>
                  {claiming === "all" ? "Claiming…" : (
                    <>
                      Claim all <Gems value={claimableGems} sign="+" size="sm" className="text-primary-foreground" iconClassName="text-primary-foreground" />
                    </>
                  )}
                </Button>
              </div>
            )}
          </section>
          {rewards && <p className="text-xs text-muted-foreground">An achievement gives as many gems as its points, claimed once. On the Podium gives none in this version.</p>}
          <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-3">
            {list.map((a) => (
              <ProgressCard
                key={a.achievementId}
                kind="achievement"
                {...achievementText(a.achievementId)}
                tasks={a.tasks}
                completed={a.completed}
                completedAt={a.completedAt}
                points={a.points}
                retired={a.retired}
                reward={rewardOf(a)}
                onClaim={() => props.onClaim?.(a.achievementId)}
              />
            ))}
          </div>
        </>
      )}
    </TabPage>
  );
}
