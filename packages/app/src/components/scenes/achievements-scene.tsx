import type { PlayerAchievements } from "@paved/chain";
import type { Tab } from "../../routes/pages";
import { Button } from "../ui/button";
import { Progress } from "../ui/progress";
import { Skeleton } from "../ui/skeleton";
import { Cobbles } from "../elements/cobbles";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { Notice } from "../elements/notice";
import { isClaimed, type AchievementCobbles } from "../containers/cobble-types";
import { ProgressCard, progressState, type ProgressReward } from "../containers/progress-card";
import { achievementText } from "../containers/quest-text";
import { QuestsTabs, type QuestsTab } from "../containers/quests-tabs";
import { TabPage } from "../containers/tab-page";

/** The achievements' Cobbles (P-61, cobbles-v1.md 3.1, 3.3), as `useAchievementRewards` reads them. */
export interface AchievementRewardsData {
  /** The achievements with Cobbles, from the definitions: their points; On the Podium (9) has none in v1, so it is absent. */
  cobbles: readonly AchievementCobbles[];
  /** `CobbleAccount.achievementsClaimed`. */
  claimed: bigint;
  /** `CobbleAccount.cobbles`. */
  balance: number;
}

export interface AchievementRewards extends AchievementRewardsData {
  /** An achievement's claim, or all of them, on its way. */
  claiming?: number | "all" | null;
}

export interface AchievementsSceneProps {
  /** `/v1/players/:id/achievements`; null while it loads. */
  achievements: PlayerAchievements | null;
  connected: boolean;
  error?: string | null;
  /** That failure's detail for support (`InlineError`). */
  errorDetail?: ErrorDetail;
  /** The Cobbles; omitted before Cobbles. */
  rewards?: AchievementRewards | null;
  /** False: the player is known but cannot sign (P6): the rewards show, each claim says "Connect to claim". */
  canClaim?: boolean;
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
 * The achievements (`/missions/lifetime`, the Lifetime tab of Missions): earned, in progress and locked, earned first; the points of the
 * earned ones, display only.
 */
export function AchievementsScene(props: AchievementsSceneProps) {
  const { achievements, connected, error, rewards, canClaim = true } = props;
  const list = achievements ? [...achievements.achievements].sort((a, b) => ORDER[progressState(a)] - ORDER[progressState(b)]) : [];
  const earned = list.filter((a) => a.completed).length;
  const possible = list.reduce((sum, a) => sum + a.points, 0);
  const claiming = rewards?.claiming ?? null;
  const rewardOf = (a: { achievementId: number; completed: boolean }): ProgressReward | undefined => {
    const entry = rewards?.cobbles.find((g) => g.achievementId === a.achievementId);
    if (!rewards || !entry || entry.cobbles === 0) return undefined;
    const claimed = isClaimed(rewards.claimed, a.achievementId);
    const mine = claiming === a.achievementId || (claiming === "all" && a.completed && !claimed);
    return { cobbles: entry.cobbles, claimed, claiming: mine, disabled: !canClaim || (claiming !== null && !mine) };
  };
  const claimable = list.map((a) => ({ a, r: rewardOf(a) })).filter(({ a, r }) => a.completed && r && !r.claimed);
  const claimableCobbles = claimable.reduce((sum, { r }) => sum + r!.cobbles, 0);
  return (
    <TabPage tab="quests" title="Missions" onNavigate={props.onNavigate}>
      <QuestsTabs active="achievements" onSelect={props.onTab} />

      {!connected ? (
        <Notice title="Connect to see your missions" action={<Button size="sm" onClick={props.onConnect}>Connect</Button>}>
          Lifetime missions count your games over time: they need an account.
        </Notice>
      ) : error ? (
        <InlineError
          title="Could not load the lifetime missions"
          message={error}
          detail={props.errorDetail}
          action={<Button size="sm" variant="outline" onClick={props.onRetry}>Retry</Button>}
        />
      ) : achievements === null ? (
        <div role="status" aria-label="Loading the lifetime missions" className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          <section aria-label="Summary" data-slot="card" className="flex flex-col gap-2 rounded-xl border border-primary/30 bg-card p-4">
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
            {claimable.length > 0 && canClaim && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                <span className="text-xs text-muted-foreground">
                  <span className="numeric">{claimable.length}</span> to claim
                </span>
                <Button size="sm" onClick={props.onClaimAll} loading={claiming === "all"} disabled={claiming !== null && claiming !== "all"}>
                  {claiming === "all" ? "Claiming…" : (
                    <>
                      Claim all <Cobbles value={claimableCobbles} sign="+" size="sm" className="text-primary-foreground" iconClassName="text-primary-foreground" />
                    </>
                  )}
                </Button>
              </div>
            )}
          </section>
          {rewards && !canClaim && (
            <Notice title="Connect to claim" action={<Button size="sm" onClick={props.onConnect}>Connect</Button>}>
              Your missions show; claiming their Cobbles needs your wallet to sign.
            </Notice>
          )}
          {rewards && <p className="text-xs text-muted-foreground">A lifetime mission gives as many Cobbles as its points, claimed once. On the Podium gives none in this version.</p>}
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
