import type { PlayerAchievements } from "@paved/chain";
import type { Tab } from "../../routes/pages";
import { Button } from "../ui/button";
import { Progress } from "../ui/progress";
import { Skeleton } from "../ui/skeleton";
import { Notice } from "../elements/notice";
import { ProgressCard, progressState } from "../containers/progress-card";
import { achievementText } from "../containers/quest-text";
import { QuestsTabs, type QuestsTab } from "../containers/quests-tabs";
import { TabPage } from "../containers/tab-page";

export interface AchievementsSceneProps {
  /** `/v1/players/:id/achievements`; null while it loads. */
  achievements: PlayerAchievements | null;
  connected: boolean;
  error?: string | null;
  onTab?: (tab: QuestsTab) => void;
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
  const { achievements, connected, error } = props;
  const list = achievements ? [...achievements.achievements].sort((a, b) => ORDER[progressState(a)] - ORDER[progressState(b)]) : [];
  const earned = list.filter((a) => a.completed).length;
  const possible = list.reduce((sum, a) => sum + a.points, 0);
  return (
    <TabPage tab="quests" title="Achievements" onNavigate={props.onNavigate}>
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
        <div role="status" aria-label="Loading the achievements" className="grid gap-3 tablet:grid-cols-2 desktop:grid-cols-3">
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
          </section>
          <div className="grid gap-3 tablet:grid-cols-2 desktop:grid-cols-3">
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
              />
            ))}
          </div>
        </>
      )}
    </TabPage>
  );
}
