import { useMemo } from "react";
import type { Tab } from "../../routes/pages";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Skeleton } from "../ui/skeleton";
import { endOfUtcDay, questPeriod, windowEnd, type ScheduledQuest, type ScheduledQuests } from "../../lib/quest-window";
import type { Trackable } from "../../lib/quest-toasts";
import { DayPicker } from "../elements/day-picker";
import { Cobbles } from "../elements/cobbles";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { Notice } from "../elements/notice";
import { useCompletionToasts, type CompletionMemory } from "../containers/completion-toasts";
import { FreeGames } from "../containers/free-games";
import { isClaimed, type PeriodClaims, type QuestCobbles } from "../containers/cobble-types";
import { ProgressCard, type ProgressReward } from "../containers/progress-card";
import { questText } from "../containers/quest-text";
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
  /** Where the completion toasts remember what they announced, above the scene (`CompletionMemory`). */
  toasts?: CompletionMemory;
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

/**
 * The quests (`/missions/:day?`, Missions, Limited): the day's live quests with the player's progress, counted by the indexer from the
 * chain's reports, and the day picker; Lifetime is the tab beside. Daily is the day's rotating set and counts down to
 * 00:00 UTC; Weekly is the week's, and counts down to the end of the week the definitions give (quests-v2.md 1.2, 2.1).
 * A quest that completes while the page is open raises a toast.
 */
export function QuestsScene(props: QuestsSceneProps) {
  const { day, today, quests, connected, error, now, rewards, canClaim = true } = props;
  const open = day === today;
  const entries = quests?.quests ?? [];
  const done = entries.filter((q) => q.completed).length;
  const daily = entries.filter((q) => questPeriod(q) === "daily");
  const weekly = entries.filter((q) => questPeriod(q) === "weekly");
  // One list, each mission with the end of its own window (a daily's falls back to the UTC day's end); the open ones first, soonest end first.
  const endOf = (q: ScheduledQuest): number | null => windowEnd([q], now) ?? (questPeriod(q) === "daily" ? endOfUtcDay(now) : null);
  const missions = [...entries].sort((x, y) => Number(x.completed) - Number(y.completed) || (open ? (endOf(x) ?? Infinity) - (endOf(y) ?? Infinity) : 0));

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

  const tracked = useMemo<Trackable[] | null>(() => quests?.quests.map((q) => ({ id: q.questId, intervalId: q.intervalId, completed: q.completed })) ?? null, [quests]);
  useCompletionToasts("quest", tracked, ({ id }) => {
    const { title, icon } = questText(id);
    return { title, icon };
  }, { scope: day, live: open, memory: props.toasts });

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
            <Skeleton key={i} className="h-32 rounded-xl" />
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
          {missions.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">No limited mission live today.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2">
              {missions.map((q) => {
                const at = open ? (endOf(q) ?? null) : null;
                return (
                  <ProgressCard
                    key={q.questId}
                    kind="quest"
                    {...questText(q.questId)}
                    tasks={q.tasks}
                    completed={q.completed}
                    completedAt={q.completedAt}
                    retired={q.retired}
                    reward={rewardOf(q)}
                    ends={at === null ? undefined : { at, now, label: `${questPeriod(q) === "daily" ? "Daily" : "Weekly"} mission ends in` }}
                    onClaim={() => props.onClaim?.(q.questId)}
                  />
                );
              })}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {rewards
              ? "Counted by the indexer from the games the chain reports; only paid games count. A completed mission's Cobbles are claimed any time: past days stay claimable. A daily starts over at 00:00 UTC."
              : props.rewardsUnavailable
                ? "Counted by the indexer from the games the chain reports. Rewards are not shown here. A daily starts over at 00:00 UTC."
                : "Counted by the indexer from the games the chain reports. No reward in this version: a mission is for the record. A daily starts over at 00:00 UTC."}
          </p>
        </>
      )}
    </TabPage>
  );
}
