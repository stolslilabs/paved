import { useId, useMemo } from "react";
import type { Tab } from "../../routes/pages";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Skeleton } from "../ui/skeleton";
import { endOfUtcDay, questPeriod, windowEnd, type ScheduledQuest, type ScheduledQuests } from "../../lib/quest-window";
import type { Trackable } from "../../lib/quest-toasts";
import { Countdown } from "../elements/countdown";
import { DayPicker } from "../elements/day-picker";
import { Notice } from "../elements/notice";
import { useCompletionToasts } from "../containers/completion-toasts";
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
  /** `/v1/players/:id/quests?day=` with each quest's schedule (v2a); null while it loads. */
  quests: ScheduledQuests | null;
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
 * The quests (`/quests/:day?`, Quests): the day's live quests with the player's progress, counted by the indexer from the
 * chain's reports, and the day picker; Achievements is the tab beside. Daily is the day's rotating set and counts down to
 * 00:00 UTC; Weekly is the week's, and counts down to the end of the week the definitions give (quests-v2.md 1.2, 2.1).
 * A quest that completes while the page is open raises a toast.
 */
export function QuestsScene(props: QuestsSceneProps) {
  const { day, today, quests, connected, error, now } = props;
  const open = day === today;
  const entries = quests?.quests ?? [];
  const done = entries.filter((q) => q.completed).length;
  const daily = entries.filter((q) => questPeriod(q) === "daily");
  const weekly = entries.filter((q) => questPeriod(q) === "weekly");
  // The UTC day's end, also when the rotation leaves no daily live.
  const dailyEnd = open ? (windowEnd(daily, now) ?? endOfUtcDay(now)) : null;
  const weeklyEnd = open ? windowEnd(weekly, now) : null;

  const tracked = useMemo<Trackable[] | null>(() => quests?.quests.map((q) => ({ id: q.questId, intervalId: q.intervalId, completed: q.completed })) ?? null, [quests]);
  useCompletionToasts("quest", tracked, ({ id }) => {
    const { title, icon } = questText(id);
    return { title, icon };
  });

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
          <p className="text-xs text-muted-foreground">The quests had not started yet.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>
              <span className="numeric font-semibold text-primary">{done}</span>
              <span className="text-muted-foreground"> of </span>
              <span className="numeric font-semibold">{entries.length}</span>
              <span className="text-muted-foreground"> complete</span>
            </span>
            {!open && <span className="text-xs text-muted-foreground">Closed day</span>}
          </div>
          <QuestSection title="Daily" quests={daily} endsAt={dailyEnd} now={now} countdownLabel="Daily ends in" empty="No daily quest live today." />
          {(weekly.length > 0) && <QuestSection title="Weekly" quests={weekly} endsAt={weeklyEnd} now={now} countdownLabel="Weekly ends in" empty="" />}
          <p className="text-xs text-muted-foreground">Counted by the indexer from the games the chain reports. No reward in this version: a quest is for the record. A daily starts over at 00:00 UTC.</p>
        </>
      )}
    </TabPage>
  );
}

interface QuestSectionProps {
  title: string;
  quests: ScheduledQuest[];
  /** When the section's window closes; null on a closed day. */
  endsAt: number | null;
  now: number;
  countdownLabel: string;
  empty: string;
}

/** A heading with its countdown beside it (the label is the timer's accessible name only), and the quests under it. */
function QuestSection({ title, quests, endsAt, now, countdownLabel, empty }: QuestSectionProps) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id={id} className="font-display text-base font-semibold">
          {title}
        </h2>
        {endsAt !== null && <Countdown expiresAt={endsAt} now={now} label={countdownLabel} hideLabel />}
      </div>
      {quests.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">{empty}</p>
      ) : (
        <div className="grid gap-3 tablet:grid-cols-2">
          {quests.map((q) => (
            <ProgressCard key={q.questId} kind="quest" {...questText(q.questId)} tasks={q.tasks} completed={q.completed} completedAt={q.completedAt} retired={q.retired} />
          ))}
        </div>
      )}
    </section>
  );
}
