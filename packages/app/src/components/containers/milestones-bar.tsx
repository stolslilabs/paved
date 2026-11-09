import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type CSSProperties, type MouseEvent, type PointerEvent, type ReactElement } from "react";
import { useReducedMotionConfig } from "motion/react";
import * as m from "motion/react-m";
import { DAILY_MILESTONES, DAILY_QUESTS, WEEKLY_MILESTONES, WEEKLY_QUESTS, dailyMilestoneStates, weeklyMilestoneStates, type DailyMilestoneState } from "@paved/game-core";
import { haptic } from "../../lib/haptics";
import { cn } from "../../lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { Cobbles, formatCobbles } from "../elements/cobbles";
import { TokenIcon } from "../elements/token-icon";
import { CheckBadge } from "../elements/check-badge";
import { CobblesBurst } from "../elements/cobbles-burst";
import { GIFT_LIGHT_S, GiftArt, type GiftArtState } from "../elements/gift-art";
import { missionPartImage, missionRail } from "../elements/medallion-art";
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
  /** For the stories: the tooltip of this milestone's gift (its step) held open. */
  tip?: number | null;
  className?: string;
}

/** How long a gift's reveal stays (s): the lid's flight, the light, then its Cobbles held a moment before the gift settles open. */
export const GIFT_REVEAL_S = 1.8;

/**
 * Each period's bar: its quests and milestones (game-core's), its words, and its gifts' look. Both periods' gift nodes are the same
 * size (2rem, 32 px; the owner's decision of 2026-11-01, changing #976's point 4), never told apart by their size. MISSIONS-PAGE (the
 * Paved UX Book's Missions): both the book's one gift, the week's read as the bigger rewards (50 and 100 Cobbles against 10 and 15)
 * by their row and their tooltip; the `week` variant stays on the node.
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
    gift: "day",
  },
  weekly: {
    quests: WEEKLY_QUESTS,
    milestones: WEEKLY_MILESTONES,
    states: weeklyMilestoneStates,
    one: "weekly",
    many: "weeklies",
    progress: "Weeklies done this week",
    list: "Weekly milestones",
    gift: "week",
  },
} as const;

type PeriodBar = (typeof PERIOD)[MilestonesPeriod];

/** A gift node's size (rem), the same for both periods. */
const NODE = 2;

/**
 * MISSIONS-PAGE (the Paved UX Book's milestones, the owner's asks of 2026-11-04: on target with the mockup, its painted look): the
 * book's painted rail (`missionRail`: its ends round, its painting never stretched), its steel the whole line and its gold from
 * the start to the last quest done; a node reached the book's gold orb, glowing, one ahead its dark bead. Inline, in the page's chunk.
 */
const LIT_NODE: CSSProperties = {
  background: `${missionPartImage("orb")} center / 100% 100% no-repeat`,
  boxShadow: "0 0 9px 1px color-mix(in oklab, var(--primary) 70%, transparent)",
};
const DARK_NODE: CSSProperties = { background: `${missionPartImage("bead")} center / 100% 100% no-repeat` };

const plural = (bar: PeriodBar, n: number) => (n === 1 ? bar.one : bar.many);

/** The node `at` (quests done) on the line: the gift nodes' half width in from each end, the nodes evenly between. */
const left = (bar: PeriodBar, at: number) => `calc(${NODE / 2}rem + (100% - ${NODE}rem) * ${at / bar.quests})`;

/**
 * A period's milestones as a graph, the day's (#869, the owner's rework of 2026-10-29) or the week's (#976, the owner's decisions of
 * 2026-11-01): the period's quests plus one nodes on a line, one edge per quest between two, lit once that quest is done. A node that
 * carries a reward (the day: 3 done +10 Cobbles, 5 done +15, `DAILY_MILESTONES`; the week: 3 done +50, 5 done +100,
 * `WEEKLY_MILESTONES`) is a gift (`GiftArt`, the book's red box, silvered out of reach), no figure on it, the week's the same size as
 * the day's; the others are beads, gold once reached (MISSIONS-PAGE: the line carved in the drawer's face, each edge done lit in gold).
 * A gift reached glows and shakes now and then,
 * as a ready chest does; a tap claims it, and it shakes fast while the claim is on its way. Once the claim lands the gift opens, as a
 * chest does (the box jumps, light bursts out), its Cobbles rise out of it and burst into the balance's plate
 * (`CobblesBurst`), with the chest's `burst` sound and a buzz; then the gift stays open, a check on it. Under reduced motion nothing
 * shakes or flies: the gift shows open at once and its Cobbles show above it, still, for the same time, the sound kept. The edges are the progress bar (`role="progressbar"`), the nodes a
 * list beside it.
 */
export function MilestonesBar({ period = "daily", done, claimed, claiming = null, canClaim = true, onClaim, rewards = true, revealing = null, tip = null, className }: MilestonesBarProps) {
  const reduced = useReducedMotionConfig() ?? false;
  const play = useSfx();
  const bar = PERIOD[period];
  const { quests, milestones } = bar;
  const states = bar.states(done, claimed ?? 0);
  const count = Math.min(Math.max(done, 0), quests);
  // The graph's height and the line's middle (rem): a gift node's, or the plain nodes' alone.
  const height = rewards ? NODE : 1.5;
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
      {/* The painted rail: its steel the whole line, its gold to the last quest done. */}
      <span aria-hidden data-slot="milestones-track" className="absolute -translate-y-1/2" style={{ ...missionRail("rail-track", 8), left: `${NODE / 2}rem`, right: `${NODE / 2}rem`, top: `${height / 2}rem` }} />
      {count > 0 && (
        <span
          aria-hidden
          data-slot="milestones-fill"
          className="absolute -translate-y-1/2"
          style={{ ...missionRail("rail-fill", 8), left: `${NODE / 2}rem`, top: `${height / 2}rem`, width: `calc((100% - ${NODE}rem) * ${count / quests})` }}
        />
      )}
      <div
        role="progressbar"
        aria-label={bar.progress}
        aria-valuemin={0}
        aria-valuemax={quests}
        aria-valuenow={count}
        aria-valuetext={`${count} of ${quests} ${plural(bar, quests)} done`}
        className="absolute grid h-2 -translate-y-1/2"
        style={{ left: `${NODE / 2}rem`, right: `${NODE / 2}rem`, top: `${height / 2}rem`, gridTemplateColumns: `repeat(${quests}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: quests }, (_, i) => (
          <span key={i} data-step={i + 1} data-done={i < count || undefined} />
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
              style={{ left: left(bar, at), height: `${height}rem`, width: milestone ? `${NODE}rem` : undefined }}
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
                  count={count}
                  served={claimed !== null}
                  tip={tip === step}
                  disabled={claimed === null || !canClaim || (claiming !== null && claiming !== step)}
                  onClaim={() => onClaim?.(step)}
                />
              ) : (
                <span data-node={at} data-reached={at <= count || undefined} className="flex items-center">
                  <span className={cn("shrink-0 rounded-full", at <= count ? "size-4" : "size-3.5")} style={at <= count ? LIT_NODE : DARK_NODE} />
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

/**
 * The gift whose tooltip is open, on every bar at once (#989): opening one closes any other, the day's and the week's alike. A
 * module store, not a context: the Daily's and the Weekly's bars are two components that share no parent of their own.
 */
let openTip: string | null = null;
const tipListeners = new Set<() => void>();
const subscribeTip = (listener: () => void) => {
  tipListeners.add(listener);
  return () => tipListeners.delete(listener);
};
const readTip = () => openTip;
const setTip = (id: string, open: boolean) => {
  const next = open ? id : openTip === id ? null : openTip;
  if (next === openTip) return;
  openTip = next;
  for (const listener of tipListeners) listener();
};

/** Where a gift stands, in its tooltip: what is left to reach it, or whether it waits or is claimed (#989). */
export function giftStanding(state: DailyMilestoneState, left: number, served: boolean): string {
  if (state === "claimed") return "Claimed";
  if (state === "claimable") return served ? "Ready to claim" : "Reached";
  return `${left} more to go`;
}

interface GiftNodeProps {
  bar: PeriodBar;
  cobbles: number;
  /** The period's quests done that reach it. */
  at: number;
  /** The period's quests done now. */
  count: number;
  state: DailyMilestoneState;
  /** The milestones are served here: a reached gift can be claimed (false before #738). */
  served: boolean;
  claiming: boolean;
  /** Its claim just landed: the gift opens, its Cobbles shown above it. */
  opening: boolean;
  /** The opening's last frame at once (the stories). */
  held: boolean;
  /** Its tooltip held open (the stories). */
  tip: boolean;
  disabled: boolean;
  onClaim: () => void;
}

/** What a gift's tooltip trigger spreads on its element: its ref, its press and its click (the claim, or the tooltip's toggle). */
export interface GiftTipTrigger {
  ref: (el: HTMLElement | null) => void;
  onPointerDown: (event: PointerEvent) => void;
  onClick: (event: MouseEvent) => void;
}

export interface GiftTipProps {
  /** The Cobbles it holds: its tooltip's "+N". */
  cobbles: number;
  /** The tooltip's sentence for screen readers (its hidden copy, the gift's description). */
  sentence: string;
  /** A tap claims it (reached, a claim open now): its tooltip opens on hover and focus only, never on that tap. */
  claims: boolean;
  /** Its claim on its way or landing: the tooltip stays shut. */
  busy: boolean;
  /** Held open (the stories). */
  tip?: boolean;
  /** The tooltip's own hook (`data-gift-tip`). */
  tag?: string | number;
  /** The gift's standing, on the tooltip's line (`data-standing`). */
  standing?: string;
  onClaim: () => void;
  /** The trigger, its element spreading `GiftTipTrigger`. */
  children: (trigger: GiftTipTrigger) => ReactElement;
}

/**
 * A gift's tooltip (#989), the milestones' and the Missions card's (MISSIONS-PAGE): it shows what the gift holds, "+50" and the Cobble
 * (the owner's ask of 2026-11-04), and says its sentence to screen readers. It is Radix's Tooltip, controlled: the Tooltip gives the
 * hover's delay (300 ms) for a mouse, the focus and Escape for the keyboard, `role="tooltip"` and `aria-describedby`, and it stays a
 * description, where a Popover would be a dialog that takes the focus and names the gift a menu button. It does not open on a tap, so
 * a tap on a gift that does not claim (out of reach, claimed, or reached with no claim open now) toggles it here, and a tap outside
 * closes it (the Tooltip's own dismissal). A tap or a click on a gift that claims claims at once, the tooltip closed: the Cobbles
 * rising out of it show what it held. One open at a time on the page, closed while a claim is on its way or lands.
 */
export function GiftTip({ cobbles, sentence, claims, busy, tip = false, tag, standing, onClaim, children }: GiftTipProps) {
  const reduced = useReducedMotionConfig() ?? false;
  const id = useId();
  const current = useSyncExternalStore(subscribeTip, readTip, readTip);
  useEffect(() => () => setTip(id, false), [id]);
  const press = useRef<{ touch: boolean; wasOpen: boolean }>({ touch: false, wasOpen: false });
  const node = useRef<HTMLElement | null>(null);
  const open = tip || (current === id && !busy);
  // A tap (touch) on a gift that does not claim toggles its tooltip; a mouse press leaves it as the hover left it. The Tooltip closes
  // on a press and on a click: both are kept from it here, the touch's toggle read from before the press.
  const onPointerDown = (event: PointerEvent) => {
    press.current = { touch: event.pointerType === "touch", wasOpen: open };
    if (!claims && !press.current.touch) event.preventDefault();
  };
  const onClick = (event: MouseEvent) => {
    if (claims) {
      onClaim();
      return;
    }
    event.preventDefault();
    if (press.current.touch) setTip(id, !press.current.wasOpen);
    press.current = { touch: false, wasOpen: false };
  };
  const ref = (el: HTMLElement | null) => {
    node.current = el;
  };
  return (
    <Tooltip open={open} onOpenChange={(next) => setTip(id, next)}>
      <TooltipTrigger asChild>{children({ ref, onPointerDown, onClick })}</TooltipTrigger>
      <TooltipContent
        side="top"
        collisionPadding={16}
        data-gift-tip={tag}
        // A press on the gift itself is not outside: the gift's own handlers above decide.
        onPointerDownOutside={(event) => {
          if (event.target instanceof Node && node.current?.contains(event.target)) event.preventDefault();
        }}
        // The description the gift's name is read with: the Tooltip's hidden copy says it in one sentence.
        aria-label={sentence}
        // The app's tooltips fade in; under reduced motion (the app's setting or the system's) it shows at once.
        className={cn("w-max px-2.5 py-1.5", reduced && "animate-none data-[state=closed]:animate-none")}
      >
        {/* What it holds and nothing more (the owner's ask of 2026-11-04: "+50" and the Cobble); when and where it stands are said to
            screen readers alone, in the label above. */}
        <span data-standing={standing} aria-hidden className="flex items-center gap-1 text-sm font-bold">
          <span className="numeric">+{formatCobbles(cobbles)}</span>
          <TokenIcon kind="cobbles" size="em" />
        </span>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * A reward's node: its gift, no figure on it, the week's the day's size. Reached, it is lit and shakes, a button; claimed, it shows
 * the gift open and a check. Its tooltip (`GiftTip`) says what reaches it and where it stands to screen readers.
 */
function GiftNode({ bar, cobbles, at, count, state, served, claiming, opening, held, tip, disabled, onClaim }: GiftNodeProps) {
  const reach = `${at} ${plural(bar, at)} done`;
  // A claim not open now (another on its way, no wallet) dims the gift, never its disc: the edges stay hidden.
  const dim = state === "claimable" && disabled && !claiming;
  // The gift a tap claims: its tooltip opens on hover and focus only, never on that tap.
  const claims = state === "claimable" && !disabled && !claiming;
  const gift: GiftArtState = state === "locked" ? "locked" : state === "claimed" ? (opening ? "opening" : "open") : claiming ? "shaking" : disabled ? "lit" : "ready";
  const standing = giftStanding(state, at - count, served);
  const disc = (
    <span
      aria-hidden
      className="relative grid shrink-0 place-items-center"
      style={{ width: `${NODE}rem`, height: `${NODE}rem` }}
    >
      <GiftArt state={gift} held={held} variant={bar.gift} className={cn("text-[1.875rem]", dim && "opacity-60")} />
      {state === "claimed" && !opening && (
        <CheckBadge px={16} className="absolute -top-1 -right-1 size-4" />
      )}
    </span>
  );
  return (
    <GiftTip
      cobbles={cobbles}
      sentence={`+${cobbles} Cobbles, at ${reach}: ${standing}.`}
      claims={claims}
      busy={claiming || opening}
      tip={tip}
      tag={at}
      standing={state}
      onClaim={onClaim}
    >
      {(trigger) =>
        state === "claimable" ? (
          <button
            {...trigger}
            type="button"
            data-milestone={at}
            data-state={state}
            aria-disabled={!claims || undefined}
            aria-busy={claiming || undefined}
            aria-label={`Claim ${cobbles} Cobbles: ${reach}`}
            // 44 px to tap: the disc (32 px, both periods) and a ring around it, over the node's box. It keeps the focus
            // while no claim is open (aria-disabled, not disabled), so its tooltip still opens.
            className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full outline-none aria-disabled:cursor-default"
            style={{ margin: `${(NODE - 2.75) / 2}rem` }}
          >
            {disc}
          </button>
        ) : (
          <span
            {...trigger}
            role="img"
            tabIndex={0}
            data-milestone={at}
            data-state={state}
            data-opening={opening || undefined}
            aria-label={state === "claimed" ? `${cobbles} Cobbles claimed: ${reach}` : `${cobbles} Cobbles at ${reach}`}
            className="flex rounded-full outline-none"
          >
            {disc}
          </span>
        )
      }
    </GiftTip>
  );
}
