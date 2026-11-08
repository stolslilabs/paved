import { useRef, useState, type CSSProperties, type FocusEvent, type ReactNode } from "react";
import type { PlayerAchievements } from "@paved/chain";
import { TUTORIAL_STEPS, tutorialFinished, tutorialStates, type TutorialCounts, type TutorialStepState } from "@paved/game-core";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { endOfUtcDay, questPeriod, windowEnd, type ScheduledQuest, type ScheduledQuests } from "../../lib/quest-window";
import { Countdown } from "../elements/countdown";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { Notice } from "../elements/notice";
import { SectionTitle } from "../elements/section-title";
import { BalancesSlot } from "../containers/balances-context";
import { isClaimed, type AchievementCobbles, type PeriodClaims, type QuestCobbles } from "../containers/cobble-types";
import { HudDrawer } from "../containers/hud-drawer";
import { MissionCard, missionFraction, type Mission, type ProgressReward } from "../containers/mission-card";
import { MissionTile, type MissionTileState } from "../containers/mission-tile";
import { TUTORIAL_TEXT, achievementText, questText, taskUnit } from "../containers/quest-text";
import { MilestonesBar } from "../containers/milestones-bar";
import type { MissionKey } from "../containers/mission-key";

/** A mission of the page, by what it is (no period's bonus since #976): its key, as the home's tracker links to it (#978). */
export type { MissionKey };

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

/** The Tutorial as the page reads it (#977, `useTutorialSteps`): each task's count, and bit `id - 1` of `claimed` per step claimed. */
export interface TutorialData {
  counts: TutorialCounts;
  claimed: number;
}

export interface MissionsSceneProps {
  /** `/v1/players/:id/quests?day=` for today, with each quest's schedule (v2a); null while it loads. */
  quests: ScheduledQuests | null;
  /** `/v1/players/:id/achievements`; null while it loads. */
  achievements: PlayerAchievements | null;
  /** False: the account still on its way (NO-GUEST: no guest, no Connect), shown as the missions' loading. */
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
  /**
   * The Tutorial's steps (#977); null or omitted: not served here (the chain before #738), or every step claimed, and the section
   * does not show.
   */
  tutorial?: TutorialData | null;
  /** `claimTutorialStep(id)` (#977): a step's Cobbles. */
  onClaimTutorial?: (id: number) => void;
  /** The claim on its way, if any. */
  claiming?: MissionKey | null;
  /** False: the player is known but cannot sign (no wallet yet, P6): the rewards show, each Claim disabled, a notice asks to connect. */
  canClaim?: boolean;
  /**
   * The mission the card shows on arrival (a story's, or the home's tracker's link, `/missions?mission=`, #978); omitted or not on
   * the page, the open Tutorial step, else the first one not done (Daily, then Weekly, then the Achievements).
   */
  initialSelected?: MissionKey;
  /** `claim_quest(quest_id, period)` of today (or its week). */
  onClaimQuest?: (questId: number) => void;
  /** `claimDailyMilestone(day, step)` of today (#869). */
  onClaimMilestone?: (step: number) => void;
  /** `claimWeeklyMilestone(week, step)` of today's week (#976, in place of the week's bonus, `claim_weekly_credit`). */
  onClaimWeeklyMilestone?: (step: number) => void;
  /** `claim_achievement(achievement_id)`. */
  onClaimAchievement?: (achievementId: number) => void;
  onRetry?: () => void;
  /**
   * Whether the drawer is shown (MISSIONS-PAGE): its route is the current one; false while it slides out. Omitted, shown (a story's,
   * a test's).
   */
  open?: boolean;
  /** Back on a phone, the close from `tablet`, Escape, a tap on the village: up to the village (BACK-RULE #783). */
  onBack?: () => void;
  /** Where the focus goes back as the drawer closes (the control that opened it); omitted, Radix's own. */
  returnFocus?: () => HTMLElement | null;
}

/**
 * The card's sticky box (#988; MISSIONS-PAGE: in the drawer's body, under its header band): at the top of the body once the viewport
 * is 560 px tall or more; below that (a phone held sideways) it would leave the list almost no room, so it scrolls with the page. The
 * body's 16 px top padding is the box's own (`-mt-4 pt-4`, across the column with `-mx-4 px-4`), painted with the drawer's face, and
 * it sticks that padding higher (`-top-4`: a sticky box keeps clear of its scroller's padding), at the header's foot, so no medallion
 * shows above the card; under it the engraved rule of the drawer's titles, and a 16 px fade that lets the medallions
 * pass under it. Above the list (`z-20`).
 */
const STICKY_CARD = [
  "relative z-20 -mx-4 -mt-4 bg-secondary px-4 pt-4 pb-3",
  "[@media(min-height:35rem)]:sticky [@media(min-height:35rem)]:-top-4",
  "after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-4 after:bg-linear-to-b after:from-secondary after:to-transparent",
].join(" ");

/** The card's engraved rule, the drawer's titles' (`SectionTitle`): a light line over a dark one, across the column. */
const CARD_RULE: CSSProperties = { height: 2, background: "linear-gradient(var(--hud-outline) 50%, var(--drawer-bevel) 50%)", opacity: 0.8 };

/** A press outside the drawer that is no tap on the village: on a dialog drawn over the drawer. */
function keepForDialogs(event: Event) {
  if (event.target instanceof Element && event.target.closest('[role="dialog"]')) event.preventDefault();
}

/** The tasks the book paints otherwise than their mission's icon (`missionArt`'s keys): the points' coins, the leagues' banner. */
const TASK_ART: Readonly<Record<number, string>> = { 3: "points", 23: "league" };

/** The scrolling region the page is in: the drawer's body. */
const SCROLLER = "[data-hud-drawer-body]";

/** The room kept between the sticky card's bottom edge and a part of the list brought out from under it (the fade's height). */
const BELOW_CARD = 16;

const ROW = {
  daily: { title: "Daily", ends: "Daily missions reset in" },
  weekly: { title: "Weekly", ends: "Weekly missions reset in" },
} as const;

/**
 * A section of the list: its title (the drawer's, a fixed word: TILE-COUNTS, the owner's rule of 2026-11-07, no count beside it, the
 * medallions and the milestones' bar say what is done), then its content.
 */
function MissionSection({ id, title, children, ...list }: {
  id: string;
  title: string;
  children: ReactNode;
  onFocus?: (event: FocusEvent<HTMLElement>) => void;
  onPointerDown?: () => void;
}) {
  return (
    <section aria-labelledby={id} {...list} className="flex flex-col gap-2.5">
      <SectionTitle id={id}>{title}</SectionTitle>
      {children}
    </section>
  );
}

/** A Tutorial step's tile state (#977): locked, open (to do, or in progress while its level climbs), done with Cobbles waiting, claimed. */
function stepTileState(state: TutorialStepState, count: number): MissionTileState {
  if (state === "claimed") return "done";
  if (state === "done") return "claimable";
  if (state === "locked") return "locked";
  return count > 0 ? "progress" : "none";
}

/**
 * A mission's tile state from its progress and its Cobbles. An achievement with nothing counted is to do, never locked (the owner's
 * ask of 2026-11-04): only a Tutorial step waits for the one before it.
 */
function tileState(entry: { completed: boolean; tasks: { count: number }[] }, reward: ProgressReward | undefined): MissionTileState {
  if (entry.completed) return reward && !reward.claimed ? "claimable" : "done";
  if (entry.tasks.some((t) => t.count > 0)) return "progress";
  return "none";
}

/**
 * Missions (`/missions`, #832, the owner's decisions of 2026-10-27): one page, today only. MISSIONS-PAGE (the Paved UX Book's
 * Missions, the owner's approved mockups of 2026-11-02): the HUD's drawer, as the profile (`HudDrawer`): a full page with Back on a
 * phone, a side panel docked at the right from `tablet` (the right column's Missions opens it), its close the red cross on its inner
 * edge, the Cobbles at its header's end, the dock over its foot. At the top a card with the selected mission (`MissionCard`); under
 * it the missions as medallions, five a row (`MissionTile`), in sections titled as the profile's (`SectionTitle`): the Tutorial,
 * the Daily and the Weekly, each with its reset's countdown in a carved chip on its first line (a title holds no timer: TILE-COUNTS), then the Achievements (the lifetime missions, named so on
 * the owner's ask of 2026-11-04). The Daily and the Weekly have
 * their period's milestones graph above their medallions (`MilestonesBar`, the day's #869, the week's #976): an edge per quest done
 * and a gift per milestone's Cobbles, opened (claimed) with a tap on it; no weekly pays on its own any more, nor a week's bonus. On
 * arrival the first mission not done is selected (Daily, then Weekly, then the Achievements; with everything done, the first one); a tap on a
 * medallion selects it, the card updates in place and the page does not scroll. The card sticks at the top of the drawer's body
 * while the list scrolls (#988, from a viewport 560 px tall), so the tapped mission always shows; no medallion shows Cobbles, the
 * card does. Cobbles are the only reward: no free game, no day picker. A mission's Cobbles are claimed from the card's medallion's
 * badge, its gift (the owner's asks of 2026-11-04). Above the Daily, while a step waits to be claimed, the Tutorial (#977): eight
 * steps in order, each opened by the one before's completion, its title a fixed word (the steps done read on the medallions); the open step is
 * selected on arrival, and the section goes once every step is claimed. The completion toasts are the app's
 * (`routes/completion-host.tsx`).
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
    if (overlap > 0) card.closest<HTMLElement>(SCROLLER)?.scrollBy({ top: -overlap });
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

  // The book paints a mission by its icon (`missionArt`), save two tasks it paints otherwise: the points (task 3) its coins, the
  // leagues reached (task 23) its banner.
  const artOf = (icon: string, tasks: readonly { taskId: number }[]) => TASK_ART[tasks[0]?.taskId ?? -1] ?? icon;

  const questMission = (q: ScheduledQuest): Mission => {
    const key: MissionKey = `quest:${q.questId}`;
    const entry = questRewards?.cobbles.find((g) => g.questId === q.questId);
    const reward =
      questRewards && entry && entry.cobbles > 0 ? claim(key, entry.cobbles, isClaimed(entry.kind === "weekly" ? questRewards.week.claimed : questRewards.day.claimed, q.questId)) : undefined;
    return {
      key,
      kind: questPeriod(q),
      ...questText(q.questId),
      icon: artOf(questText(q.questId).icon, q.tasks),
      state: tileState(q, reward),
      progress: q.tasks.map((t) => ({ unit: taskUnit(t.taskId), count: t.count, total: t.total })),
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
      icon: artOf(achievementText(a.achievementId).icon, a.tasks),
      state: tileState(a, reward),
      progress: a.tasks.map((t) => ({ unit: taskUnit(t.taskId), count: t.count, total: t.total })),
      reward,
    };
  });

  // The Tutorial (#977): its steps in order, gone once every one is claimed (open point 5). A step's count is capped at its target
  // on the card (an early action counts once it opens, open point 4); the level shows as it is, up to its target.
  const tutorialData = props.tutorial && !tutorialFinished(props.tutorial.claimed) ? props.tutorial : null;
  const tutorial: Mission[] = tutorialData
    ? tutorialStates(tutorialData.counts, tutorialData.claimed).map((state, i) => {
        const step = TUTORIAL_STEPS[i]!;
        const text = TUTORIAL_TEXT[step.task];
        const key: MissionKey = `tutorial:${step.id}`;
        const count = Math.min(step.target, tutorialData.counts[step.task] ?? 0);
        return {
          key,
          kind: "tutorial",
          title: text.title,
          description: text.description,
          icon: text.icon,
          state: stepTileState(state, state === "open" ? count : 0),
          progress: [{ unit: text.unit, count, total: step.target }],
          reward: questRewards || achievementRewards ? claim(key, step.cobbles, state === "claimed") : undefined,
          tutorial: { step: step.id },
        };
      })
    : [];

  const all = [...tutorial, ...rows.flatMap((r) => r.missions), ...lifetime];
  // On arrival (#977): the open Tutorial step first, then the first mission not done, Daily, Weekly, then the Achievements.
  const fallback =
    tutorial.find((m) => m.state === "none" || m.state === "progress") ?? all.find((m) => m.kind !== "tutorial" && (m.state === "none" || m.state === "progress" || m.state === "locked")) ?? all[0];
  const selected = all.find((m) => m.key === picked) ?? fallback;

  const onClaim = (m: Mission) => {
    const [kind, id] = m.key.split(":") as [string, string];
    if (kind === "tutorial") props.onClaimTutorial?.(Number(id));
    else if (kind === "quest") props.onClaimQuest?.(Number(id));
    else props.onClaimAchievement?.(Number(id));
  };

  const tile = (m: Mission) => (
    <MissionTile
      key={m.key}
      title={m.title}
      icon={m.icon}
      state={m.state}
      progress={missionFraction(m.progress)}
      selected={selected?.key === m.key}
      step={m.tutorial?.step}
      onSelect={() => setPicked(m.key as MissionKey)}
    />
  );
  // Five a row, the book's, at every width: the drawer keeps the phone's column.
  const grid = "grid grid-cols-5 gap-x-2 gap-y-1.5";

  return (
    <HudDrawer
      open={props.open ?? true}
      onOpenChange={(next) => {
        if (!next) props.onBack?.();
      }}
      title="Missions"
      side="right"
      slot="missions"
      returnFocus={props.returnFocus}
      // The Cobbles the missions pay, the HUD's balance the right panel covers (#855's set: the page's).
      end={<BalancesSlot layout="pill" />}
      // A press on a dialog over it (the Cobbles' packs, even as it slides away) is no tap on the village.
      onInteractOutside={keepForDialogs}
    >
      {error ? (
        <InlineError
          title="Could not load the missions"
          message={error}
          detail={props.errorDetail}
          action={<Button size="sm" variant="outline" onClick={props.onRetry}>Retry</Button>}
        />
      ) : !connected || quests === null || achievements === null ? (
        // The account still being read counts as the missions' loading (NO-GUEST: every player has one, none is asked to connect).
        <div role="status" aria-label="Loading the missions" className="flex flex-col gap-4">
          <Skeleton className="h-36 rounded-xl" />
          <div className={grid}>
            {Array.from({ length: 10 }, (_, i) => (
              <Skeleton key={i} className="aspect-square w-full max-w-16 rounded-full" />
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* The card is read again on each tap: a polite live region says the new mission. The notices under it scroll with the list. */}
          <section ref={cardRef} aria-label="Selected mission" aria-live="polite" data-slot="mission-card-sticky" className={STICKY_CARD}>
            {selected && <MissionCard mission={selected} canClaim={canClaim} onClaim={() => onClaim(selected)} />}
            <span aria-hidden className="mt-3 block" style={CARD_RULE} />
          </section>
          {props.rewardsUnavailable && <Notice title="Rewards unavailable">{props.rewardsUnavailable}</Notice>}

          {tutorial.length > 0 && (
            <MissionSection id="missions-tutorial" title="Tutorial" {...list}>
              <div className={grid}>{tutorial.map(tile)}</div>
            </MissionSection>
          )}

          {rows.every((r) => r.missions.length === 0) ? (
            <p className="drawer-carved rounded-xl px-4 py-6 text-center text-xs font-semibold text-muted-foreground">No limited mission live today.</p>
          ) : (
            rows.map(({ period, missions, done, ends }) =>
              missions.length === 0 ? null : (
                <MissionSection
                  key={period}
                  id={`missions-${period}`}
                  title={ROW[period].title}
                  {...list}
                >
                  {/* The time left before the period resets, out of the title (TILE-COUNTS: a title holds no timer): its carved chip on
                      the section's first line. */}
                  {Number.isFinite(ends) && (
                    <div data-slot="missions-reset" className="flex">
                      <Countdown expiresAt={ends} now={now} label={ROW[period].ends} short className="drawer-carved h-7 shrink-0 rounded-full px-2.5 text-foreground" />
                    </div>
                  )}
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
                </MissionSection>
              ),
            )
          )}

          <MissionSection id="missions-achievements" title="Achievements" {...list}>
            {lifetime.length === 0 ? (
              <p className="drawer-carved rounded-xl px-4 py-6 text-center text-xs font-semibold text-muted-foreground">No achievement yet.</p>
            ) : (
              <div className={grid}>{lifetime.map(tile)}</div>
            )}
          </MissionSection>
        </>
      )}
    </HudDrawer>
  );
}
