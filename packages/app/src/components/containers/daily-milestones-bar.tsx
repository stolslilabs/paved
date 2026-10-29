import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotionConfig } from "motion/react";
import * as m from "motion/react-m";
import { DAILY_MILESTONES, DAILY_QUESTS, dailyMilestoneStates, type DailyMilestoneState } from "@paved/game-core";
import { haptic } from "../../lib/haptics";
import { cn } from "../../lib/utils";
import { Icon } from "../ui/icon";
import { Cobbles } from "../elements/cobbles";
import { CobblesBurst } from "../elements/cobbles-burst";
import { GIFT_LIGHT_S, GiftArt, type GiftArtState } from "../elements/gift-art";
import { useSfx } from "./audio-provider";

export interface DailyMilestonesBarProps {
  /** Today's dailies done, 0 to `DAILY_QUESTS`. */
  done: number;
  /**
   * Bit `step` per milestone claimed today (`DailyMilestonesView.claimed`); null: the milestones are not served here (the chain
   * before #738), so none can be claimed.
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

const plural = (n: number) => (n === 1 ? "daily" : "dailies");

/** The node `at` (dailies done) on the line: the gift nodes' half width in from each end, the nodes evenly between. */
const left = (at: number) => `calc(1rem + (100% - 2rem) * ${at / DAILY_QUESTS})`;

/**
 * The day's milestones as a graph (#869, the owner's rework of 2026-10-29): `DAILY_QUESTS + 1` nodes on a line, one edge per daily
 * between two, lit once that daily is done. A node that carries a reward (3 done: +10 Cobbles, 5 done: +15, `DAILY_MILESTONES`) is a
 * small gift (`GiftArt`), no figure on it; the others are plain and smaller, filled once reached. A gift reached shakes now and then,
 * as a ready chest does; a tap claims it, and it shakes fast while the claim is on its way. Once the claim lands the gift opens, as a
 * chest does (the box jumps, its lid pops off, light bursts out), its Cobbles rise out of it and burst into the balance's plate
 * (`CobblesBurst`), with the chest's `burst` sound and a buzz; then the gift stays open, a check on it. Under reduced motion nothing
 * shakes or flies: the gift shows open at once, the sound kept. The edges are the progress bar (`role="progressbar"`), the nodes a
 * list beside it.
 */
export function DailyMilestonesBar({ done, claimed, claiming = null, canClaim = true, onClaim, rewards = true, revealing = null, className }: DailyMilestonesBarProps) {
  const reduced = useReducedMotionConfig() ?? false;
  const play = useSfx();
  const states = dailyMilestoneStates(done, claimed ?? 0);
  const count = Math.min(Math.max(done, 0), DAILY_QUESTS);
  const nodes = useRef<(HTMLElement | null)[]>([]);
  // A claim seen landing here (its bit set while this graph is shown) opens its gift and bursts once; a day read already claimed does not.
  const [seen, setSeen] = useState(claimed);
  const [burst, setBurst] = useState<number | null>(null);
  const [opening, setOpening] = useState<number | null>(null);
  if (claimed !== seen) {
    setSeen(claimed);
    const landed = DAILY_MILESTONES.findIndex((_, step) => states[step] === "claimed" && ((seen ?? 0) & (1 << step)) === 0);
    if (seen !== null && landed >= 0) {
      setBurst(landed);
      if (!reduced) setOpening(landed);
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
    <div data-graph="daily-milestones" className={cn("relative", className)} style={{ height: rewards ? "2rem" : "1.5rem" }}>
      <div
        role="progressbar"
        aria-label="Dailies done today"
        aria-valuemin={0}
        aria-valuemax={DAILY_QUESTS}
        aria-valuenow={count}
        aria-valuetext={`${count} of ${DAILY_QUESTS} ${plural(DAILY_QUESTS)} done`}
        className="absolute grid -translate-y-1/2"
        style={{ left: "1rem", right: "1rem", top: rewards ? "1rem" : "0.75rem", gridTemplateColumns: `repeat(${DAILY_QUESTS}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: DAILY_QUESTS }, (_, i) => (
          <span key={i} data-step={i + 1} data-done={i < count || undefined} className={cn("h-1", i < count ? "bg-primary" : "bg-input")} />
        ))}
      </div>
      <ol aria-label="Daily milestones">
        {Array.from({ length: DAILY_QUESTS + 1 }, (_, at) => {
          const step = rewards ? DAILY_MILESTONES.findIndex((milestone) => milestone.done === at) : -1;
          const milestone = DAILY_MILESTONES[step];
          return (
            <li
              key={at}
              ref={(el) => {
                if (step >= 0) nodes.current[step] = el;
              }}
              aria-hidden={milestone ? undefined : true}
              className={cn("absolute top-0 flex -translate-x-1/2 justify-center", milestone ? "w-8" : "w-3", rewards ? "h-8" : "h-6")}
              style={{ left: left(at) }}
            >
              {milestone ? (
                <GiftNode
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
      {DAILY_MILESTONES.map(({ done: at, cobbles }, step) =>
        states[step] === "claimed" && rewards && (opening === step || revealing === step) ? (
          // The Cobbles out of the opening gift: they rise above it with the light, then the gift settles open. The last node's keep to
          // the graph's right edge, so they stay inside it.
          <m.span
            key={step}
            aria-hidden
            data-reveal={at}
            className={cn("absolute bottom-full mb-2 rounded-full border border-primary/60 bg-card px-2 py-0.5 shadow-lg", at === DAILY_QUESTS ? "right-0" : "-translate-x-1/2")}
            style={at === DAILY_QUESTS ? undefined : { left: left(at) }}
            initial={revealing === step ? false : { y: 12, scale: 0.4, opacity: 0 }}
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
  cobbles: number;
  /** The dailies done that reach it. */
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
 * A reward's node: a small disc with its gift, no figure on it (the reward is in its name, and shows once opened). Reached, it is lit
 * and shakes, a button; claimed, it shows the gift open and a check.
 */
function GiftNode({ cobbles, at, state, claiming, opening, held, disabled, onClaim }: GiftNodeProps) {
  const reach = `${at} ${plural(at)} done`;
  // A claim not open now (another on its way, no wallet) dims the gift, never its disc: the edges stay hidden.
  const dim = state === "claimable" && disabled && !claiming;
  const gift: GiftArtState = state === "locked" ? "locked" : state === "claimed" ? (opening ? "opening" : "open") : claiming ? "shaking" : disabled ? "lit" : "ready";
  const disc = (
    <span
      aria-hidden
      className={cn(
        "relative grid size-8 shrink-0 place-items-center rounded-full border-2 bg-card",
        state === "claimable" ? "border-primary shadow-lg" : state === "claimed" ? "border-primary" : "border-input",
      )}
    >
      {state === "claimable" && <span className="absolute inset-0 rounded-full bg-primary/15" />}
      <GiftArt state={gift} held={held} className={cn("text-[1.125rem]", dim && "opacity-60")} />
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
        // 44 px to tap: the disc's 32 px and a ring of 6 around it, over the node's box.
        className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
        style={{ margin: "-0.375rem" }}
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
