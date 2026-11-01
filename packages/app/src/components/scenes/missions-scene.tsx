import { useRef, useState, type FocusEvent } from "react";
import type { PlayerAchievements } from "@paved/chain";
import type { Tab } from "../../routes/pages";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Skeleton } from "../ui/skeleton";
import { endOfUtcDay, questPeriod, windowEnd, type ScheduledQuest, type ScheduledQuests } from "../../lib/quest-window";
import { Countdown } from "../elements/countdown";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { Notice } from "../elements/notice";
import { isClaimed, type AchievementCobbles, type PeriodClaims, type QuestCobbles } from "../containers/cobble-types";
import { MissionCard, type Mission, type ProgressReward } from "../containers/mission-card";
import { MissionTile, type MissionTileState } from "../containers/mission-tile";
import { achievementText, questText, taskUnit } from "../containers/quest-text";
import { TabPage } from "../containers/tab-page";
import { MilestonesBar } from "../containers/milestones-bar";

/** A mission of the page, by what it is: a quest of the day or the week, or an achievement. No period's bonus since #976. */
export type MissionKey = `quest:${number}` | `achievement:${number}`;

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
  /** For the stories: the milestone (its step, claimed) whose gift is held open at its reveal. */
  revealingMilestone?: number | null;
  /**
   * The week's milestones claimed (#976: bit `step` per `WEEKLY_MILESTONES[step]`); null or omitted: not served here (the chain
   * before #738), the week's bar shows without a claim.
   */
  weeklyMilestones?: { claimed: number } | null;
  /** The week's milestone (its step) whose claim is on its way. */
  claimingWeeklyMilestone?: number | null;
  /** For the stories: the week's milestone (its step, claimed) whose gift is held open at its reveal. */
  revealingWeeklyMilestone?: number | null;
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
  /** `claimWeeklyMilestone(week, step)` of today's week (#976, in place of the week's bonus, `claim_weekly_credit`). */
  onClaimWeeklyMilestone?: (step: number) => void;
  /** `claim_achievement(achievement_id)`. */
  onClaimAchievement?: (achievementId: number) => void;
  onConnect?: () => void;
  onRetry?: () => void;
  /** Back, up to the village (BACK-RULE #783); omitted, the bar's Home. */
  onBack?: () => void;
  onNavigate?: (tab: Tab) => void;
}

/**
 * The card's sticky box (#988): under the page's header (`--header-h` and the notch) once the viewport is 560 px tall or more; below
 * that (a phone held sideways) it would leave the list almost no room, so it scrolls with the page. It sticks 16 px under the header,
 * where the content starts on every page (HEADER-HEIGHT, #676), and the page's 16 px gap above it is painted with the page's
 * background (`before:`, across the column with `-mx-4 px-4`), so no tile shows between the header and the card; a 16 px fade under
 * its bottom edge lets the tiles pass under it. Above the list, under the header (`z-30`).
 */
const STICKY_CARD = [
  "relative z-20 -mx-4 bg-background px-4",
  "before:pointer-events-none before:absolute before:inset-x-0 before:bottom-full before:h-4 before:bg-background",
  "[@media(min-height:35rem)]:sticky [@media(min-height:35rem)]:top-[calc(var(--header-h)+env(safe-area-inset-top)+1rem)]",
  "after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-4 after:bg-linear-to-b after:from-background after:to-transparent",
].join(" ");

/** The room kept between the sticky card's bottom edge and a part of the list brought out from under it (the fade's height). */
const BELOW_CARD = 16;

const ROW = {
  daily: { title: "Daily", icon: "sun", ends: "Daily missions reset in" },
  weekly: { title: "Weekly", icon: "crown", ends: "Weekly missions reset in" },
} as const;

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
 * reset's countdown, then the Lifetime ones. Each row has its period's milestones graph above its icons (`MilestonesBar`, the
 * day's #869, the week's #976): an edge per quest done and a gift node per milestone's Cobbles, opened (claimed) with a tap on it;
 * the week's gifts are larger, and no weekly pays on its own any more, nor a week's bonus. On arrival the first mission not done is
 * selected (Daily, then Weekly, then Lifetime; with everything done, the first one); a tap on an icon selects it, the card
 * updates in place and the page does not scroll. The card sticks under the page's header while the list scrolls (#988, from a
 * viewport 560 px tall), so the tapped mission always shows; no tile shows Cobbles, the card does. Cobbles are the only reward: no free game, no day picker. Claims go from the
 * card. The completion toasts are the app's (`routes/completion-host.tsx`).
 */
export function MissionsScene(props: MissionsSceneProps) {
  const { quests, achievements, connected, error, now, questRewards, achievementRewards, claiming = null, claimingMilestone = null, claimingWeeklyMilestone = null, canClaim = true } = props;
  const [picked, setPicked] = useState<MissionKey | null>(props.initialSelected ?? null);
  const cardRef = useRef<HTMLElement>(null);
  // A press on the list, from its pointer down to its up: the focus it gives is a tap's, not the keyboard's.
  const pressing = useRef(false);

  // A part of the list reached with the keyboard (#988) never stays under the sticky card: the region scrolls it out, below the
  // card's fade. A tap does not scroll (the card is in view). The browser's own scroll into view comes after the focus event.
  const keepBelowCard = (event: FocusEvent<HTMLElement>) => {
    const card = cardRef.current;
    if (!card || pressing.current || getComputedStyle(card).position !== "sticky") return;
    const overlap = card.getBoundingClientRect().bottom + BELOW_CARD - event.target.getBoundingClientRect().top;
    if (overlap > 0) card.closest<HTMLElement>('[data-slot="page-scroll"]')?.scrollBy({ top: -overlap });
  };
  // The press ends wherever the pointer is released (dragged off the list, onto the header): the window hears it, once.
  const press = () => {
    pressing.current = true;
    const release = () => {
      pressing.current = false;
      window.removeEventListener("pointerup", release, true);
      window.removeEventListener("pointercancel", release, true);
    };
    window.addEventListener("pointerup", release, true);
    window.addEventListener("pointercancel", release, true);
  };
  const list = { onFocus: keepBelowCard, onPointerDown: press };

  const entries = quests?.quests ?? [];
  // Each quest's window's end (a daily's falls back to the UTC day's end).
  const endOf = (q: ScheduledQuest): number | null => windowEnd([q], now) ?? (questPeriod(q) === "daily" ? endOfUtcDay(now) : null);

  const claim = (key: MissionKey, cobbles: number, claimed: boolean): ProgressReward => ({
    cobbles,
    claimed,
    claiming: claiming === key,
    disabled: !canClaim || claimingMilestone !== null || claimingWeeklyMilestone !== null || (claiming !== null && claiming !== key),
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

  const rows = (["daily", "weekly"] as const).map((period) => {
    const list = entries.filter((q) => questPeriod(q) === period);
    const missions = list.map(questMission);
    const ends = Math.min(...list.map((q) => endOf(q) ?? Infinity));
    const done = missions.filter((m) => m.state === "claimable" || m.state === "done").length;
    return { period, missions, done, ends };
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

  const all = [...rows.flatMap((r) => r.missions), ...lifetime];
  const fallback = all.find((m) => m.state === "none" || m.state === "progress" || m.state === "locked") ?? all[0];
  const selected = all.find((m) => m.key === picked) ?? fallback;

  const onClaim = (m: Mission) => {
    const [kind, id] = m.key.split(":") as [string, string];
    if (kind === "quest") props.onClaimQuest?.(Number(id));
    else props.onClaimAchievement?.(Number(id));
  };

  const tile = (m: Mission) => (
    <MissionTile
      key={m.key}
      title={m.title}
      icon={m.icon}
      state={m.state}
      progress={fraction(m.progress)}
      selected={selected?.key === m.key}
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
          {/* The card is read again on each tap: a polite live region says the new mission. The notices under it scroll with the list. */}
          <section ref={cardRef} aria-label="Selected mission" aria-live="polite" data-slot="mission-card-sticky" className={STICKY_CARD}>
            {selected && <MissionCard mission={selected} canClaim={canClaim} onClaim={() => onClaim(selected)} />}
          </section>
          {questRewards && !canClaim && (
            <Notice title="Connect to claim" action={<Button size="sm" onClick={props.onConnect}>Connect</Button>}>
              Your missions show; claiming their Cobbles needs your wallet to sign.
            </Notice>
          )}
          {props.rewardsUnavailable && <Notice title="Rewards unavailable">{props.rewardsUnavailable}</Notice>}

          <section aria-labelledby="missions-limited" {...list} className="flex flex-col gap-3">
            <h2 id="missions-limited" className="font-display text-lg font-semibold">Limited</h2>
            {rows.every((r) => r.missions.length === 0) ? (
              <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">No limited mission live today.</p>
            ) : (
              rows.map(({ period, missions, done, ends }) =>
                missions.length === 0 ? null : (
                  <section key={period} aria-labelledby={`missions-${period}`} className="flex flex-col gap-2">
                    <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <h3 id={`missions-${period}`} className="flex items-center gap-2 text-sm font-semibold">
                        <Icon name={ROW[period].icon} size="sm" className="text-primary" />
                        {ROW[period].title}
                        <span className="numeric text-xs font-normal text-muted-foreground">
                          {done}/{missions.length}
                        </span>
                      </h3>
                      {Number.isFinite(ends) && <Countdown expiresAt={ends} now={now} label={ROW[period].ends} />}
                    </header>
                    {period === "daily" ? (
                      <MilestonesBar
                        done={done}
                        claimed={props.milestones?.claimed ?? null}
                        claiming={claimingMilestone}
                        canClaim={canClaim && claiming === null && claimingWeeklyMilestone === null}
                        onClaim={props.onClaimMilestone}
                        rewards={questRewards != null}
                        revealing={props.revealingMilestone}
                      />
                    ) : (
                      <MilestonesBar
                        period="weekly"
                        done={done}
                        claimed={props.weeklyMilestones?.claimed ?? null}
                        claiming={claimingWeeklyMilestone}
                        canClaim={canClaim && claiming === null && claimingMilestone === null}
                        onClaim={props.onClaimWeeklyMilestone}
                        rewards={questRewards != null}
                        revealing={props.revealingWeeklyMilestone}
                      />
                    )}
                    <div className={grid}>{missions.map(tile)}</div>
                  </section>
                ),
              )
            )}
          </section>

          <section aria-labelledby="missions-lifetime" {...list} className="flex flex-col gap-3">
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
            Counted by the indexer from the games and attacks the chain reports. Cobbles are the only reward: the Daily and the Weekly pay at
            their gifts, a lifetime mission from its card.
          </p>
        </>
      )}
    </TabPage>
  );
}
