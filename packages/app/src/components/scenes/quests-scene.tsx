import type { PlayerQuests } from "@paved/chain";
import type { Tab } from "../../routes/pages";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Skeleton } from "../ui/skeleton";
import { Countdown } from "../elements/countdown";
import { DayPicker } from "../elements/day-picker";
import { Notice } from "../elements/notice";
import { ProgressCard } from "../containers/progress-card";
import { questText } from "../containers/quest-text";
import { QuestsTabs, type QuestsTab } from "../containers/quests-tabs";
import { TabPage } from "../containers/tab-page";

export interface QuestsSceneProps {
  /** The day shown (`/quests/:day?`). */
  day: number;
  today: number;
  /** The first day there is: the picker goes no earlier. */
  firstDay: number;
  /** `/v1/players/:id/quests?day=`; null while it loads. */
  quests: PlayerQuests | null;
  /** False: a guest, asked to connect. */
  connected: boolean;
  error?: string | null;
  now: number;
  onDayChange?: (day: number) => void;
  onTab?: (tab: QuestsTab) => void;
  onConnect?: () => void;
  onRetry?: () => void;
  onNavigate?: (tab: Tab) => void;
}

/**
 * The quests (`/quests/:day?`, Quests): the day's four dailies with the player's progress, counted by the indexer from
 * the chain's reports, and the day picker; Achievements is the tab beside. A daily starts over at 00:00 UTC.
 */
export function QuestsScene(props: QuestsSceneProps) {
  const { day, today, quests, connected, error, now } = props;
  const open = day === today;
  const done = quests?.quests.filter((q) => q.completed).length ?? 0;
  return (
    <TabPage tab="quests" title="Quests" onNavigate={props.onNavigate}>
      <div className="flex flex-col gap-3 tablet:flex-row tablet:items-center tablet:justify-between">
        <QuestsTabs active="quests" onSelect={props.onTab} />
        <DayPicker day={day} today={today} first={props.firstDay} onChange={props.onDayChange} />
      </div>

      {!connected ? (
        <Notice
          title="Connect to see your quests"
          action={
            <Button size="sm" onClick={props.onConnect}>
              Connect
            </Button>
          }
        >
          Quests count your Challenge games: they need an account.
        </Notice>
      ) : error ? (
        <Notice tone="danger" title="Could not load the quests" action={<Button size="sm" variant="outline" onClick={props.onRetry}>Retry</Button>}>
          {error}
        </Notice>
      ) : quests === null ? (
        <div role="status" aria-label="Loading the quests" className="grid gap-3 tablet:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : quests.quests.length === 0 ? (
        <div data-slot="card" className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card px-4 py-10 text-center">
          <Icon name="scroll" size="xl" className="text-muted-foreground" />
          <p className="text-sm font-semibold">No quest this day</p>
          <p className="text-xs text-muted-foreground">The dailies had not started yet.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>
              <span className="numeric font-semibold text-primary">{done}</span>
              <span className="text-muted-foreground"> of </span>
              <span className="numeric font-semibold">{quests.quests.length}</span>
              <span className="text-muted-foreground"> complete</span>
            </span>
            {open ? <Countdown expiresAt={quests.endTime} now={now} label="New quests in" /> : <span className="text-xs text-muted-foreground">Closed day</span>}
          </div>
          <div className="grid gap-3 tablet:grid-cols-2">
            {quests.quests.map((q) => (
              <ProgressCard key={q.questId} kind="quest" {...questText(q.questId)} tasks={q.tasks} completed={q.completed} completedAt={q.completedAt} retired={q.retired} />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Counted by the indexer from the games the chain reports. No reward in this version: a quest is for the record.</p>
        </>
      )}
    </TabPage>
  );
}
