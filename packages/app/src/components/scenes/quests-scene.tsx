import type { Tab } from "../../routes/pages";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Skeleton } from "../ui/skeleton";
import { milestoneTracks, type MilestoneTrack } from "../../lib/milestones";
import { endOfUtcDay, questPeriod, windowEnd, type QuestPeriod, type ScheduledQuest, type ScheduledQuests } from "../../lib/quest-window";
import { DayPicker } from "../elements/day-picker";
import { Cobbles } from "../elements/cobbles";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { Notice } from "../elements/notice";
import { Countdown } from "../elements/countdown";
import { FreeGames } from "../containers/free-games";
import { isClaimed, type PeriodClaims, type QuestCobbles } from "../containers/cobble-types";
import { MissionTrackCard, type TrackStep } from "../containers/mission-track-card";
import type { ProgressReward } from "../containers/progress-card";
import { questText, trackText } from "../containers/quest-text";
import { QuestsTabs, type QuestsTab } from "../containers/quests-tabs";
import { TabPage } from "../containers/tab-page";

/** What a claim is on its way for: one quest, all of them, or a period's free game. */
export type QuestClaim = number | "all" | "daily" | "weekly";

/**
 * The quests' Cobbles and free games (P-61, cobbles-v1.md 3.1, 3.3, 3.4), as `useQuestRewards` reads them: each quest's
 * Cobbles from its definition, the claims of the day shown and of its week (`day_progress`, `week_progress`), the account.
 */
export interface QuestRewardsData {
  /** The quests with Cobbles, from the definitions. */
  cobbles: readonly QuestCobbles[];
  day: PeriodClaims;
  /** The week of the day shown; nothing claimed for a day before week 0. */
  week: PeriodClaims;
  /** `CobbleAccount.cobbles`. */
  balance: number;
  /** `CobbleAccount.credits`. */
  credits: number;
}

export interface QuestRewards extends QuestRewardsData {
  claiming?: QuestClaim | null;
}

export interface QuestsSceneProps {
  /** The day shown (`/missions/:day?`). */
  day: number;
  today: number;
  /** The first day there is: the picker goes no earlier. */
  firstDay: number;
  /** `/v1/players/:id/quests?day=` with each quest's schedule (v2a); null while it loads. */
  quests: ScheduledQuests | null;
  /** False: a guest, asked to connect. */
  connected: boolean;
  error?: string | null;
  /** Why the Cobbles ledger cannot be read (e.g. "Not available on this network yet."); the quests still show. */
  rewardsUnavailable?: string | null;
  /** That failure's detail for support (`InlineError`). */
  errorDetail?: ErrorDetail;
  now: number;
  /** The Cobbles and free games; omitted before Cobbles. */
  rewards?: QuestRewards | null;
  /** False: the player is known but cannot sign (no wallet yet, P6): the rewards show, each claim says "Connect to claim". */
  canClaim?: boolean;
  onDayChange?: (day: number) => void;
  /** `claim_quest(quest_id, period)` of the day shown (or its week). */
  onClaim?: (questId: number) => void;
  /** Every claimable quest of the page, in one multicall. */
  onClaimAll?: () => void;
  /** `claim_daily_credit(day)` or `claim_weekly_credit(week)`. */
  onClaimCredit?: (kind: "daily" | "weekly") => void;
  onPlayFree?: () => void;
  onTab?: (tab: QuestsTab) => void;
  onConnect?: () => void;
  onRetry?: () => void;
  onNavigate?: (tab: Tab) => void;
}

const SECTION = {
  daily: { title: "Daily", icon: "sun", ends: "Daily missions end in", one: "Daily mission ends in" },
  weekly: { title: "Weekly", icon: "calendar-week", ends: "Weekly missions end in", one: "Weekly mission ends in" },
} as const;

/** A track's steps share one schedule: the tiers of a task live in the same window (#595). */
const windowKey = (q: ScheduledQuest) => `${questPeriod(q)}:${q.start}:${q.interval}:${q.duration}`;

/**
 * The quests (`/missions/:day?`, Missions, Limited) as milestone tracks (#595): a Daily and a Weekly section, each with its
 * window's countdown, and in each one card per track: the tiers of one task are one bar with several steps (each with its
 * Cobbles, claimed from the card), a mission with one target a bar of one step. The progress is the indexer's, counted
 * from the chain's reports; the day picker shows a past day (closed: no countdown, its Cobbles still claimable). Daily
 * counts down to 00:00 UTC, Weekly to the end of the week the definitions give (quests-v2.md 1.2, 2.1). The completion
 * toasts are the app's (`routes/completion-host.tsx`), raised on any page, the board included.
 */
export function QuestsScene(props: QuestsSceneProps) {
  const { day, today, quests, connected, error, now, rewards, canClaim = true } = props;
  const open = day === today;
  const entries = quests?.quests ?? [];
  const done = entries.filter((q) => q.completed).length;
  const daily = entries.filter((q) => questPeriod(q) === "daily");
  const weekly = entries.filter((q) => questPeriod(q) === "weekly");
  // Each mission's window end (a daily's falls back to the UTC day's end).
  const endOf = (q: ScheduledQuest): number | null => windowEnd([q], now) ?? (questPeriod(q) === "daily" ? endOfUtcDay(now) : null);

  // A quest's Cobbles, claimed or not: a claim word per kind (the day's for a daily, the week's for a weekly).
  const claiming = rewards?.claiming ?? null;
  const rewardOf = (q: ScheduledQuest): ProgressReward | undefined => {
    const entry = rewards?.cobbles.find((g) => g.questId === q.questId);
    if (!rewards || !entry || entry.cobbles === 0) return undefined;
    const claimed = isClaimed(entry.kind === "weekly" ? rewards.week.claimed : rewards.day.claimed, q.questId);
    const mine = claiming === q.questId || (claiming === "all" && q.completed && !claimed);
    return { cobbles: entry.cobbles, claimed, claiming: mine, disabled: !canClaim || (claiming !== null && !mine) };
  };
  // A free game needs every quest of its kind with Cobbles live in the period done (`claim_daily_credit`): those count.
  const credited = (list: ScheduledQuest[]) => list.filter((q) => rewardOf(q) !== undefined);
  const freeGame = (list: ScheduledQuest[], claimed: boolean, kind: "daily" | "weekly") => {
    const counted = credited(list);
    return counted.length > 0 ? { done: counted.filter((q) => q.completed).length, total: counted.length, claimed, claiming: claiming === kind } : null;
  };
  const claimable = entries.map((q) => ({ q, r: rewardOf(q) })).filter(({ q, r }) => q.completed && r && !r.claimed);
  const claimableCobbles = claimable.reduce((sum, { r }) => sum + r!.cobbles, 0);

  const section = (period: QuestPeriod, list: ScheduledQuest[]) => {
    if (list.length === 0) return null;
    const ends = open ? Math.min(...list.map((q) => endOf(q) ?? Infinity)) : Infinity;
    const trackEnd = (t: MilestoneTrack<ScheduledQuest>) => endOf(t.steps[0].entry) ?? Infinity;
    // The open tracks first, soonest end first; the complete ones last.
    const tracks = milestoneTracks(list, windowKey).sort((x, y) => {
      const doneX = Number(x.steps.every((s) => s.reached));
      const doneY = Number(y.steps.every((s) => s.reached));
      return doneX - doneY || (open ? trackEnd(x) - trackEnd(y) : 0);
    });
    const labels = SECTION[period];
    const doneHere = list.filter((q) => q.completed).length;
    return (
      <section aria-labelledby={`missions-${period}`} className="flex flex-col gap-3">
        <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <h2 id={`missions-${period}`} className="flex items-center gap-2 font-display text-lg font-semibold">
            <Icon name={labels.icon} size="sm" className="text-primary" />
            {labels.title}
            <span className="numeric text-xs font-normal text-muted-foreground">
              {doneHere}/{list.length}
            </span>
          </h2>
          {Number.isFinite(ends) && <Countdown expiresAt={ends} now={now} label={labels.ends} />}
        </header>
        <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 wide:grid-cols-3">
          {tracks.map((t) => {
            const single = t.steps.length === 1;
            const first = t.steps[0].entry;
            const text = single ? questText(first.questId) : { ...trackText(t.taskId), description: undefined };
            const at = open ? endOf(first) : null;
            const steps: TrackStep[] = t.steps.map(({ entry, target, reached }) => ({
              id: entry.questId,
              title: questText(entry.questId).title,
              target,
              reached,
              completedAt: entry.completedAt,
              reward: rewardOf(entry),
            }));
            return (
              <MissionTrackCard
                key={t.key}
                title={text.title}
                description={text.description}
                icon={text.icon}
                taskId={t.taskId}
                count={t.count}
                steps={steps}
                retired={t.steps.every((s) => s.entry.retired)}
                ends={at !== null && at !== ends ? { at, now, label: labels.one } : undefined}
                onClaim={props.onClaim}
              />
            );
          })}
        </div>
      </section>
    );
  };

  return (
    <TabPage tab="quests" title="Missions" onNavigate={props.onNavigate}>
      <div className="flex flex-col gap-3 tablet:flex-row tablet:items-center tablet:justify-between">
        <QuestsTabs active="quests" onSelect={props.onTab} />
        <DayPicker day={day} today={today} first={props.firstDay} onChange={props.onDayChange} />
      </div>

      {!connected ? (
        <Notice
          title="Connect to see your missions"
          action={
            <Button size="sm" onClick={props.onConnect}>
              Connect
            </Button>
          }
        >
          Missions count your Challenge games: they need an account.
        </Notice>
      ) : error ? (
        <InlineError
          title="Could not load the missions"
          message={error}
          detail={props.errorDetail}
          action={<Button size="sm" variant="outline" onClick={props.onRetry}>Retry</Button>}
        />
      ) : quests === null ? (
        <div role="status" aria-label="Loading the missions" className="grid grid-cols-1 gap-3 tablet:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : quests.quests.length === 0 ? (
        <div data-slot="card" className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card px-4 py-10 text-center">
          <Icon name="scroll" size="xl" className="text-muted-foreground" />
          <p className="text-sm font-semibold">No mission this day</p>
          <p className="text-xs text-muted-foreground">The missions had not started yet.</p>
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
            <span className="flex flex-wrap items-center gap-2">
              {!open && <span className="text-xs text-muted-foreground">Closed day</span>}
              {claimable.length > 0 && canClaim && (
                <Button size="sm" onClick={props.onClaimAll} loading={claiming === "all"} disabled={claiming !== null && claiming !== "all"}>
                  {claiming === "all" ? "Claiming…" : (
                    <>
                      Claim all <Cobbles value={claimableCobbles} sign="+" size="sm" className="text-primary-foreground" iconClassName="text-primary-foreground" />
                    </>
                  )}
                </Button>
              )}
            </span>
          </div>
          {rewards && !canClaim && (
            <Notice
              title="Connect to claim"
              action={
                <Button size="sm" onClick={props.onConnect}>
                  Connect
                </Button>
              }
            >
              Your progress shows; claiming Cobbles and free games needs your wallet to sign.
            </Notice>
          )}
          {rewards && (
            <FreeGames
              credits={rewards.credits}
              daily={freeGame(daily, rewards.day.credit, "daily")}
              weekly={freeGame(weekly, rewards.week.credit, "weekly")}
              busy={!canClaim || claiming !== null}
              onClaim={props.onClaimCredit}
              onPlayFree={props.onPlayFree}
            />
          )}
          {props.rewardsUnavailable && (
            <Notice title="Rewards unavailable">{props.rewardsUnavailable}</Notice>
          )}
          {section("daily", daily)}
          {section("weekly", weekly)}
          <p className="text-xs text-muted-foreground">
            {rewards
              ? "Counted by the indexer from the games the chain reports; only paid games count. A reached step's Cobbles are claimed any time: past days stay claimable. A daily starts over at 00:00 UTC."
              : props.rewardsUnavailable
                ? "Counted by the indexer from the games the chain reports. Rewards are not shown here. A daily starts over at 00:00 UTC."
                : "Counted by the indexer from the games the chain reports. No reward in this version: a mission is for the record. A daily starts over at 00:00 UTC."}
          </p>
        </>
      )}
    </TabPage>
  );
}
