import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotionConfig } from "motion/react";
import * as m from "motion/react-m";
import { DAILY_MILESTONES, DAILY_QUESTS, WEEKLY_MILESTONES, WEEKLY_QUESTS, dailyMilestoneStates, weeklyMilestoneStates, type DailyMilestoneState } from "@paved/game-core";
import { haptic } from "../../lib/haptics";
import { cn } from "../../lib/utils";
import { Icon } from "../ui/icon";
import { Cobbles } from "../elements/cobbles";
import { CobblesBurst } from "../elements/cobbles-burst";
import { GIFT_LIGHT_S, GiftArt, type GiftArtState } from "../elements/gift-art";
import { useSfx } from "./audio-provider";

/** The period whose milestones the bar shows: the day's (#869) or the week's (#976). */
export type MilestonesPeriod = "daily" | "weekly";

export interface MilestonesBarProps {
  /** The day's (the default) or the week's milestones. */
  period?: MilestonesPeriod;
  /** The period's quests done, 0 to its quests (`DAILY_QUESTS`, `WEEKLY_QUESTS`). */
  done: number;
  /**
   * Bit `step` per milestone claimed in the period (`DailyMilestonesView.claimed`, `WeeklyMilestonesView.claimed`); null: the
   * milestones are not served here (the chain before #738), so none can be claimed.
   */
  claimed: number | null;
  /** The milestone (its step) whose claim is on its way. */
  claiming?: number | null;
  /** False: no claim now (no wallet to sign, or another claim on its way). */
  canClaim?: boolean;
  onClaim?: (step: number) => void;
  /** False: the Cobbles are not read here (the ledger unreadable, or before Cobbles): the plain nodes alone, no reward. */
  rewards?: boolean;
  /** For the stories: the gift of this milestone (its step, claimed) held open at its reveal, its Cobbles shown. */
  revealing?: number | null;
  className?: string;
}

/** How long a gift's reveal stays (s): the lid's flight, the light, then its Cobbles held a moment before the gift settles open. */
export const GIFT_REVEAL_S = 1.8;

/**
 * Each period's bar: its quests and milestones (game-core's), its words, and its gift node's size (rem). The week's gifts are drawn
 * larger than the day's (40 px against 32), so they read as the bigger rewards (#976: 50 and 100 Cobbles against 10 and 15).
 */
const PERIOD = {
  daily: {
    quests: DAILY_QUESTS,
    milestones: DAILY_MILESTONES,
    states: dailyMilestoneStates,
    one: "daily",
    many: "dailies",
    progress: "Dailies done today",
    list: "Daily milestones",
    node: 2,
    art: "text-[1.125rem]",
  },
  weekly: {
    quests: WEEKLY_QUESTS,
    milestones: WEEKLY_MILESTONES,
    states: weeklyMilestoneStates,
    one: "weekly",
    many: "weeklies",
    progress: "Weeklies done this week",
    list: "Weekly milestones",
    node: 2.5,
    art: "text-[1.5rem]",
  },
} as const;

type PeriodBar = (typeof PERIOD)[MilestonesPeriod];

const plural = (bar: PeriodBar, n: number) => (n === 1 ? bar.one : bar.many);

/** The node `at` (quests done) on the line: the gift nodes' half width in from each end, the nodes evenly between. */
const left = (bar: PeriodBar, at: number) => `calc(${bar.node / 2}rem + (100% - ${bar.node}rem) * ${at / bar.quests})`;

/**
 * A period's milestones as a graph, the day's (#869, the owner's rework of 2026-10-29) or the week's (#976, the owner's decisions of
 * 2026-11-01): the period's quests plus one nodes on a line, one edge per quest between two, lit once that quest is done. A node that
 * carries a reward (the day: 3 done +10 Cobbles, 5 done +15, `DAILY_MILESTONES`; the week: 3 done +50, 5 done +100,
 * `WEEKLY_MILESTONES`) is a gift (`GiftArt`), no figure on it, the week's larger than the day's; the others are plain and smaller,
 * filled once reached. A gift reached shakes now and then,
 * as a ready chest does; a tap claims it, and it shakes fast while the claim is on its way. Once the claim lands the gift opens, as a
 * chest does (the box jumps, its lid pops off, light bursts out), its Cobbles rise out of it and burst into the balance's plate
 * (`CobblesBurst`), with the chest's `burst` sound and a buzz; then the gift stays open, a check on it. Under reduced motion nothing
 * shakes or flies: the gift shows open at once and its Cobbles show above it, still, for the same time, the sound kept. The edges are the progress bar (`role="progressbar"`), the nodes a
 * list beside it.
 */
export function MilestonesBar({ period = "daily", done, claimed, claiming = null, canClaim = true, onClaim, rewards = true, revealing = null, className }: MilestonesBarProps) {
  const reduced = useReducedMotionConfig() ?? false;
  const play = useSfx();
  const bar = PERIOD[period];
  const { quests, milestones } = bar;
  const states = bar.states(done, claimed ?? 0);
  const count = Math.min(Math.max(done, 0), quests);
  // The graph's height and the line's middle (rem): a gift node's, or the plain nodes' alone.
  const height = rewards ? bar.node : 1.5;
  const nodes = useRef<(HTMLElement | null)[]>([]);
  // A claim seen landing here (its bit set while this graph is shown) opens its gift and bursts once; a period read already claimed does not.
  const [seen, setSeen] = useState(claimed);
  const [burst, setBurst] = useState<number | null>(null);
  const [opening, setOpening] = useState<number | null>(null);
  if (claimed !== seen) {
    setSeen(claimed);
    const landed = milestones.findIndex((_, step) => states[step] === "claimed" && ((seen ?? 0) & (1 << step)) === 0);
    if (seen !== null && landed >= 0) {
      setBurst(landed);
      setOpening(landed);
    }
  }
  useEffect(() => {
    if (burst === null) return;
    play("burst");
    haptic("firm");
  }, [burst, play]);
  useEffect(() => {
    if (opening === null) return;
    const timer = setTimeout(() => setOpening(null), GIFT_REVEAL_S * 1000);
    return () => clearTimeout(timer);
  }, [opening]);
  const ended = useCallback(() => setBurst(null), []);
  const from = useCallback(() => (burst === null ? null : (nodes.current[burst] ?? null)), [burst]);

  return (
    <div data-graph={`${period}-milestones`} className={cn("relative", className)} style={{ height: `${height}rem` }}>
      <div
        role="progressbar"
        aria-label={bar.progress}
        aria-valuemin={0}
        aria-valuemax={quests}
        aria-valuenow={count}
        aria-valuetext={`${count} of ${quests} ${plural(bar, quests)} done`}
        className="absolute grid -translate-y-1/2"
        style={{ left: `${bar.node / 2}rem`, right: `${bar.node / 2}rem`, top: `${height / 2}rem`, gridTemplateColumns: `repeat(${quests}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: quests }, (_, i) => (
          <span key={i} data-step={i + 1} data-done={i < count || undefined} className={cn("h-1", i < count ? "bg-primary" : "bg-input")} />
        ))}
      </div>
      <ol aria-label={bar.list}>
        {Array.from({ length: quests + 1 }, (_, at) => {
          const step = rewards ? milestones.findIndex((milestone) => milestone.done === at) : -1;
          const milestone = milestones[step];
          return (
            <li
              key={at}
              ref={(el) => {
                if (step >= 0) nodes.current[step] = el;
              }}
              aria-hidden={milestone ? undefined : true}
              className={cn("absolute top-0 flex -translate-x-1/2 justify-center", !milestone && "w-3")}
              style={{ left: left(bar, at), height: `${height}rem`, width: milestone ? `${bar.node}rem` : undefined }}
            >
              {milestone ? (
                <GiftNode
                  bar={bar}
                  cobbles={milestone.cobbles}
                  at={at}
                  state={states[step]!}
                  claiming={claiming === step}
                  opening={states[step] === "claimed" && (opening === step || revealing === step)}
                  held={revealing === step}
                  disabled={claimed === null || !canClaim || (claiming !== null && claiming !== step)}
                  onClaim={() => onClaim?.(step)}
                />
              ) : (
                <span data-node={at} data-reached={at <= count || undefined} className="flex items-center">
                  <span className={cn("size-3 rounded-full border-2", at <= count ? "border-primary bg-primary" : "border-input bg-background")} />
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {milestones.map(({ done: at, cobbles }, step) =>
        states[step] === "claimed" && rewards && (opening === step || revealing === step) ? (
          // The Cobbles out of the opening gift: they rise above it with the light, then the gift settles open. The last node's keep to
          // the graph's right edge, so they stay inside it.
          <m.span
            key={step}
            aria-hidden
            data-reveal={at}
            className={cn("absolute bottom-full mb-2 rounded-full border border-primary/60 bg-card px-2 py-0.5 shadow-lg", at === quests ? "right-0" : "-translate-x-1/2")}
            style={at === quests ? undefined : { left: left(bar, at) }}
            // Under reduced motion the amount shows in place at once: nothing rises or grows.
            initial={revealing === step || reduced ? false : { y: 12, scale: 0.4, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            transition={{ delay: GIFT_LIGHT_S, type: "spring", stiffness: 420, damping: 18 }}
          >
            <Cobbles value={cobbles} sign="+" size="sm" />
          </m.span>
        ) : null,
      )}
      {burst !== null && <CobblesBurst key={burst} from={from} onDone={ended} />}
    </div>
  );
}

interface GiftNodeProps {
  bar: PeriodBar;
  cobbles: number;
  /** The period's quests done that reach it. */
  at: number;
  state: DailyMilestoneState;
  claiming: boolean;
  /** Its claim just landed: the gift opens, its Cobbles shown above it. */
  opening: boolean;
  /** The opening's last frame at once (the stories). */
  held: boolean;
  disabled: boolean;
  onClaim: () => void;
}

/**
 * A reward's node: a disc with its gift, no figure on it (the reward is in its name, and shows once opened), the week's larger than
 * the day's. Reached, it is lit and shakes, a button; claimed, it shows the gift open and a check.
 */
function GiftNode({ bar, cobbles, at, state, claiming, opening, held, disabled, onClaim }: GiftNodeProps) {
  const reach = `${at} ${plural(bar, at)} done`;
  // A claim not open now (another on its way, no wallet) dims the gift, never its disc: the edges stay hidden.
  const dim = state === "claimable" && disabled && !claiming;
  const gift: GiftArtState = state === "locked" ? "locked" : state === "claimed" ? (opening ? "opening" : "open") : claiming ? "shaking" : disabled ? "lit" : "ready";
  const disc = (
    <span
      aria-hidden
      className={cn(
        "relative grid shrink-0 place-items-center rounded-full border-2 bg-card",
        state === "claimable" ? "border-primary shadow-lg" : state === "claimed" ? "border-primary" : "border-input",
      )}
      style={{ width: `${bar.node}rem`, height: `${bar.node}rem` }}
    >
      {state === "claimable" && <span className="absolute inset-0 rounded-full bg-primary/15" />}
      <GiftArt state={gift} held={held} className={cn(bar.art, dim && "opacity-60")} />
      {state === "claimed" && !opening && (
        <span className="absolute -top-1 -right-1 grid size-4 place-items-center rounded-full bg-success text-background">
          <Icon name="check" size="xs" />
        </span>
      )}
    </span>
  );
  if (state === "claimable") {
    return (
      <button
        type="button"
        data-milestone={at}
        data-state={state}
        disabled={disabled || claiming}
        aria-busy={claiming || undefined}
        aria-label={`Claim ${cobbles} Cobbles: ${reach}`}
        onClick={onClaim}
        // 44 px to tap: the disc (32 px for the day, 40 for the week) and a ring around it, over the node's box.
        className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
        style={{ margin: `${(bar.node - 2.75) / 2}rem` }}
      >
        {disc}
      </button>
    );
  }
  const claimed = state === "claimed";
  return (
    <span
      role="img"
      data-milestone={at}
      data-state={state}
      data-opening={opening || undefined}
      aria-label={claimed ? `${cobbles} Cobbles claimed: ${reach}` : `${cobbles} Cobbles at ${reach}`}
      className="flex"
    >
      {disc}
    </span>
  );
}
