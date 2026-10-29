import { useState } from "react";
import type { PlayerAchievements } from "@paved/chain";
import { QUEST_BONUS_COBBLES } from "@paved/game-core";
import type { Tab } from "../../routes/pages";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Skeleton } from "../ui/skeleton";
import { endOfUtcDay, questPeriod, windowEnd, type QuestPeriod, type ScheduledQuest, type ScheduledQuests } from "../../lib/quest-window";
import { Countdown } from "../elements/countdown";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { Notice } from "../elements/notice";
import { isClaimed, type AchievementCobbles, type PeriodClaims, type QuestCobbles } from "../containers/cobble-types";
import { MissionCard, type Mission, type ProgressReward } from "../containers/mission-card";
import { MissionTile, type MissionTileState } from "../containers/mission-tile";
import { achievementText, questText, taskUnit } from "../containers/quest-text";
import { TabPage } from "../containers/tab-page";
import { DailyMilestonesBar } from "../containers/daily-milestones-bar";

/** A mission of the page, by what it is: a quest of the day or the week, an achievement, or a period's bonus (only the week's since #869). */
export type MissionKey = `quest:${number}` | `achievement:${number}` | `bonus:${QuestPeriod}`;

/**
 * The quests' Cobbles (P-61, cobbles-v1.md 3.1, 3.3, 3.4), as `useQuestRewards` reads them: each quest's Cobbles from its
 * definition, the claims of today and of its week (`day_progress`, `week_progress`), the account.
 */
export interface QuestRewardsData {
  /** The quests with Cobbles, from the definitions. */
  cobbles: readonly QuestCobbles[];
  day: PeriodClaims;
  /** Today's week; nothing claimed for a day before week 0. */
  week: PeriodClaims;
  /** `CobbleAccount.cobbles`. */
  balance: number;
  /** `CobbleAccount.credits`: the free games of v1, gone from the page since #832. */
  credits: number;
}

/** The achievements' Cobbles (P-61, cobbles-v1.md 3.1, 3.3), as `useAchievementRewards` reads them. */
export interface AchievementRewardsData {
  /** The achievements with Cobbles, from the definitions: their points; On the Podium (9) has none in v1, so it is absent. */
  cobbles: readonly AchievementCobbles[];
  /** `CobbleAccount.achievementsClaimed`. */
  claimed: bigint;
  /** `CobbleAccount.cobbles`. */
  balance: number;
}

export interface MissionsSceneProps {
  /** `/v1/players/:id/quests?day=` for today, with each quest's schedule (v2a); null while it loads. */
  quests: ScheduledQuests | null;
  /** `/v1/players/:id/achievements`; null while it loads. */
  achievements: PlayerAchievements | null;
  /** False: a guest, asked to connect. */
  connected: boolean;
  error?: string | null;
  /** That failure's detail for support (`InlineError`). */
  errorDetail?: ErrorDetail;
  /** Why the Cobbles ledger cannot be read (e.g. "Not available on this network yet."); the missions still show. */
  rewardsUnavailable?: string | null;
  now: number;
  /** The quests' Cobbles; omitted before Cobbles. */
  questRewards?: QuestRewardsData | null;
  /** The achievements' Cobbles; omitted before Cobbles. */
  achievementRewards?: AchievementRewardsData | null;
  /**
   * Today's milestones claimed (#869: bit `step` per `DAILY_MILESTONES[step]`); null or omitted: not served here (the chain
   * before #738), the bar shows without a claim.
   */
  milestones?: { claimed: number } | null;
  /** The milestone (its step) whose claim is on its way. */
  claimingMilestone?: number | null;
  /** The claim on its way, if any. */
  claiming?: MissionKey | null;
  /** False: the player is known but cannot sign (no wallet yet, P6): the rewards show, each claim says "Connect to claim". */
  canClaim?: boolean;
  /** The mission the card shows on arrival; omitted, the first one not done (Daily, then Weekly, then Lifetime). */
  initialSelected?: MissionKey;
  /** `claim_quest(quest_id, period)` of today (or its week). */
  onClaimQuest?: (questId: number) => void;
  /** `claimDailyMilestone(day, step)` of today (#869). */
  onClaimMilestone?: (step: number) => void;
  /** `claim_achievement(achievement_id)`. */
  onClaimAchievement?: (achievementId: number) => void;
  /** `claim_weekly_credit(week)`: the week's bonus Cobbles since #738 (the day's left with #869, so `daily` is not sent). */
  onClaimBonus?: (kind: QuestPeriod) => void;
  onConnect?: () => void;
  onRetry?: () => void;
  /** Back, up to the village (BACK-RULE #783); omitted, the bar's Home. */
  onBack?: () => void;
  onNavigate?: (tab: Tab) => void;
}

const ROW = {
  daily: { title: "Daily", icon: "sun", ends: "Daily missions reset in" },
  weekly: { title: "Weekly", icon: "crown", ends: "Weekly missions reset in" },
} as const;

const BONUS = { title: "Weekly bonus", description: "Finish every weekly mission of the week for bonus Cobbles.", unit: "weekly missions done" } as const;

/** A mission's tile state from its progress and its Cobbles. */
function tileState(kind: "quest" | "achievement", entry: { completed: boolean; tasks: { count: number }[] }, reward: ProgressReward | undefined): MissionTileState {
  if (entry.completed) return reward && !reward.claimed ? "claimable" : "done";
  if (entry.tasks.some((t) => t.count > 0)) return "progress";
  return kind === "achievement" ? "locked" : "none";
}

/** How far a mission is, 0 to 1: its tasks' mean. */
const fraction = (progress: Mission["progress"]): number =>
  progress.length === 0 ? 0 : progress.reduce((sum, p) => sum + (p.total > 0 ? Math.min(1, p.count / p.total) : 0), 0) / progress.length;

/**
 * Missions (`/missions`, #832, the owner's decisions of 2026-10-27): one page, today only. At the top a card with the selected
 * mission (`MissionCard`); under it the missions as icons (`MissionTile`): the Limited ones, a Daily and a Weekly row each with its
 * reset's countdown, then the Lifetime ones. The Daily row has the day's progress bar above its icons (`DailyMilestonesBar`,
 * #869): a step per daily done and the two milestones' Cobbles, claimed from the bar; the Weekly row ends on the week's bonus
 * as a small last tile. On arrival the first mission not done is
 * selected (Daily, then Weekly, then Lifetime; with everything done, the first one); a tap on an icon selects it, the card
 * updates in place and the page does not scroll. Cobbles are the only reward: no free game, no day picker. Claims go from the
 * card. The completion toasts are the app's (`routes/completion-host.tsx`).
 */
export function MissionsScene(props: MissionsSceneProps) {
  const { quests, achievements, connected, error, now, questRewards, achievementRewards, claiming = null, claimingMilestone = null, canClaim = true } = props;
  const [picked, setPicked] = useState<MissionKey | null>(props.initialSelected ?? null);

  const entries = quests?.quests ?? [];
  // Each quest's window's end (a daily's falls back to the UTC day's end).
  const endOf = (q: ScheduledQuest): number | null => windowEnd([q], now) ?? (questPeriod(q) === "daily" ? endOfUtcDay(now) : null);

  const claim = (key: MissionKey, cobbles: number, claimed: boolean): ProgressReward => ({
    cobbles,
    claimed,
    claiming: claiming === key,
    disabled: !canClaim || claimingMilestone !== null || (claiming !== null && claiming !== key),
  });

  const questMission = (q: ScheduledQuest): Mission => {
    const key: MissionKey = `quest:${q.questId}`;
    const entry = questRewards?.cobbles.find((g) => g.questId === q.questId);
    const reward =
      questRewards && entry && entry.cobbles > 0 ? claim(key, entry.cobbles, isClaimed(entry.kind === "weekly" ? questRewards.week.claimed : questRewards.day.claimed, q.questId)) : undefined;
    return {
      key,
      kind: questPeriod(q),
      ...questText(q.questId),
      state: tileState("quest", q, reward),
      progress: q.tasks.map((t) => ({ unit: taskUnit(t.taskId), count: t.count, total: t.total })),
      completedAt: q.completedAt,
      retired: q.retired,
      reward,
    };
  };

  // The week's bonus (#738, the mock's rule since #741): every weekly quest that pays Cobbles done, then its Cobbles. The day has
  // none since #869: its dailies pay nothing, and its milestones pay instead.
  const bonusMission = (period: QuestPeriod, list: Mission[]): Mission | null => {
    if (!questRewards || period !== "weekly") return null;
    const counted = list.filter((m) => m.reward !== undefined);
    if (counted.length === 0) return null;
    const done = counted.filter((m) => m.state === "claimable" || m.state === "done").length;
    const key: MissionKey = "bonus:weekly";
    const reward = claim(key, QUEST_BONUS_COBBLES.weekly, questRewards.week.credit);
    const complete = done === counted.length;
    return {
      key,
      kind: period,
      bonus: true,
      title: BONUS.title,
      description: BONUS.description,
      icon: "gift",
      state: complete ? (reward.claimed ? "done" : "claimable") : done > 0 ? "progress" : "none",
      progress: [{ unit: BONUS.unit, count: done, total: counted.length }],
      completedAt: null,
      reward,
    };
  };

  const rows = (["daily", "weekly"] as const).map((period) => {
    const list = entries.filter((q) => questPeriod(q) === period);
    const missions = list.map(questMission);
    const ends = Math.min(...list.map((q) => endOf(q) ?? Infinity));
    return { period, missions, bonus: bonusMission(period, missions), ends };
  });

  const lifetime: Mission[] = (achievements?.achievements ?? []).map((a) => {
    const key: MissionKey = `achievement:${a.achievementId}`;
    const entry = achievementRewards?.cobbles.find((g) => g.achievementId === a.achievementId);
    const reward = achievementRewards && entry && entry.cobbles > 0 ? claim(key, entry.cobbles, isClaimed(achievementRewards.claimed, a.achievementId)) : undefined;
    return {
      key,
      kind: "lifetime",
      ...achievementText(a.achievementId),
      state: tileState("achievement", a, reward),
      progress: a.tasks.map((t) => ({ unit: taskUnit(t.taskId), count: t.count, total: t.total })),
      completedAt: a.completedAt,
      retired: a.retired,
      reward,
    };
  });

  const all = [...rows.flatMap((r) => (r.bonus ? [...r.missions, r.bonus] : r.missions)), ...lifetime];
  const fallback = all.find((m) => m.state === "none" || m.state === "progress" || m.state === "locked") ?? all[0];
  const selected = all.find((m) => m.key === picked) ?? fallback;

  const onClaim = (m: Mission) => {
    const [kind, id] = m.key.split(":") as [string, string];
    if (kind === "quest") props.onClaimQuest?.(Number(id));
    else if (kind === "achievement") props.onClaimAchievement?.(Number(id));
    else props.onClaimBonus?.(id as QuestPeriod);
  };

  const tile = (m: Mission) => (
    <MissionTile
      key={m.key}
      title={m.title}
      icon={m.icon}
      state={m.state}
      cobbles={m.reward?.cobbles}
      progress={fraction(m.progress)}
      selected={selected?.key === m.key}
      bonus={m.bonus}
      onSelect={() => setPicked(m.key as MissionKey)}
    />
  );
  const grid = "grid grid-cols-5 gap-2 tablet:grid-cols-6";
  const earned = lifetime.filter((m) => m.state === "claimable" || m.state === "done").length;

  return (
    <TabPage tab="quests" title="Missions" onBack={props.onBack} onNavigate={props.onNavigate}>
      {!connected ? (
        <Notice title="Connect to see your missions" action={<Button size="sm" onClick={props.onConnect}>Connect</Button>}>
          Missions count your games: they need an account.
        </Notice>
      ) : error ? (
        <InlineError
          title="Could not load the missions"
          message={error}
          detail={props.errorDetail}
          action={<Button size="sm" variant="outline" onClick={props.onRetry}>Retry</Button>}
        />
      ) : quests === null || achievements === null ? (
        <div role="status" aria-label="Loading the missions" className="flex flex-col gap-4">
          <Skeleton className="h-44 rounded-xl" />
          <div className={grid}>
            {Array.from({ length: 10 }, (_, i) => (
              <Skeleton key={i} className="aspect-square rounded-xl" />
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* The card is read again on each tap: a polite live region says the new mission. */}
          <section aria-label="Selected mission" aria-live="polite">
            {selected && <MissionCard mission={selected} canClaim={canClaim} onClaim={() => onClaim(selected)} />}
          </section>
          {questRewards && !canClaim && (
            <Notice title="Connect to claim" action={<Button size="sm" onClick={props.onConnect}>Connect</Button>}>
              Your missions show; claiming their Cobbles needs your wallet to sign.
            </Notice>
          )}
          {props.rewardsUnavailable && <Notice title="Rewards unavailable">{props.rewardsUnavailable}</Notice>}

          <section aria-labelledby="missions-limited" className="flex flex-col gap-3">
            <h2 id="missions-limited" className="font-display text-lg font-semibold">Limited</h2>
            {rows.every((r) => r.missions.length === 0) ? (
              <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">No limited mission live today.</p>
            ) : (
              rows.map(({ period, missions, bonus, ends }) =>
                missions.length === 0 ? null : (
                  <section key={period} aria-labelledby={`missions-${period}`} className="flex flex-col gap-2">
                    <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <h3 id={`missions-${period}`} className="flex items-center gap-2 text-sm font-semibold">
                        <Icon name={ROW[period].icon} size="sm" className="text-primary" />
                        {ROW[period].title}
                        <span className="numeric text-xs font-normal text-muted-foreground">
                          {missions.filter((m) => m.state === "claimable" || m.state === "done").length}/{missions.length}
                        </span>
                      </h3>
                      {Number.isFinite(ends) && <Countdown expiresAt={ends} now={now} label={ROW[period].ends} />}
                    </header>
                    {period === "daily" && (
                      <DailyMilestonesBar
                        done={missions.filter((m) => m.state === "claimable" || m.state === "done").length}
                        claimed={props.milestones?.claimed ?? null}
                        claiming={claimingMilestone}
                        canClaim={canClaim && claiming === null}
                        onClaim={props.onClaimMilestone}
                        rewards={questRewards != null}
                      />
                    )}
                    <div className={grid}>
                      {missions.map(tile)}
                      {bonus && tile(bonus)}
                    </div>
                  </section>
                ),
              )
            )}
          </section>

          <section aria-labelledby="missions-lifetime" className="flex flex-col gap-3">
            <h2 id="missions-lifetime" className="flex items-baseline gap-2 font-display text-lg font-semibold">
              Lifetime
              <span className="numeric font-sans text-xs font-normal text-muted-foreground">
                {earned}/{lifetime.length}
              </span>
            </h2>
            {lifetime.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">No lifetime mission yet.</p>
            ) : (
              <div className={grid}>{lifetime.map(tile)}</div>
            )}
          </section>
          <p className="text-xs text-muted-foreground">
            Counted by the indexer from the games the chain reports. Cobbles are the only reward; a mission's Cobbles are claimed from its card.
          </p>
        </>
      )}
    </TabPage>
  );
}
