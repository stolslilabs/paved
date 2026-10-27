import { useEffect } from "react";
import { useReducedMotionConfig } from "motion/react";
import * as m from "motion/react-m";
import { cn } from "../../lib/utils";
import { Cobbles, formatCobbles } from "./cobbles";
import { TokenIcon } from "./token-icon";

/**
 * A league's first-time bonus for the season (issue 833): `had` once the player reached the league this season (paid on chain then,
 * `leagueable.cairo`'s `LeagueReached`), `locked` while it is not reached, `ready` when it was paid and is still to be celebrated
 * (open point 1: no claim on chain, the moment plays once on a tap).
 */
export type LeagueBonusState = "had" | "locked" | "ready";

export interface LeagueBonusProps {
  state: LeagueBonusState;
  /** Its Cobbles (`bonus_of`). */
  value: number;
  /** The league's name, for its accessible name. */
  league: string;
  /** A tap on the `ready` icon: the moment plays. */
  onCelebrate?: () => void;
  className?: string;
}

const NAME: Record<LeagueBonusState, (league: string) => string> = {
  had: () => "had this season",
  locked: (league) => `reach ${league} to earn it`,
  ready: () => "earned, tap to celebrate",
};

/**
 * The first-time bonus's icon at a league card's top right (issue 833): the Cobbles' stones struck through once had, greyed out while
 * out of reach, ringed in the primary colour with a glow when it is to be celebrated. Its Cobbles are in its accessible name.
 */
export function LeagueBonus({ state, value, league, onCelebrate, className }: LeagueBonusProps) {
  const reduced = useReducedMotionConfig() ?? false;
  const name = `First-time bonus, +${formatCobbles(value)} Cobbles: ${NAME[state](league)}`;
  const box = "relative grid size-9 shrink-0 place-items-center rounded-full";
  if (state === "ready")
    return (
      <button
        type="button"
        aria-label={name}
        data-bonus={state}
        onClick={onCelebrate}
        style={{ boxShadow: "0 0 14px var(--primary)" }}
        className={cn(box, "touch-manipulation border-2 border-primary bg-card outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
      >
        {!reduced && (
          <m.span
            aria-hidden
            className="absolute inset-0 rounded-full border-2 border-primary"
            animate={{ scale: [1, 1.5], opacity: [0.8, 0] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
          />
        )}
        <TokenIcon kind="cobbles" size="sm" />
      </button>
    );
  // Had: the stones dimmed and struck through; not reached: greyed out.
  return (
    <span role="img" aria-label={name} data-bonus={state} style={state === "locked" ? { filter: "grayscale(1)" } : undefined} className={cn(box, "bg-muted", className)}>
      <TokenIcon kind="cobbles" size="sm" className={state === "had" ? "opacity-60" : "opacity-40"} />
      {state === "had" && <span aria-hidden className="absolute h-0.5 rounded-full bg-muted-foreground" style={{ width: "1.75rem", transform: "rotate(45deg)", boxShadow: "0 0 0 2px var(--muted)" }} />}
    </span>
  );
}

/** The moment's length, then it ends on its own. */
export const BONUS_BURST_MS = 1_600;

/** The stones that fly out: their angles, in degrees. */
const STONES = [0, 45, 90, 135, 180, 225, 270, 315];

export interface BonusBurstProps {
  value: number;
  /** The moment has played. */
  onDone?: () => void;
  /** For the stories: the moment held, its stones out. */
  held?: boolean;
  className?: string;
}

/**
 * The first-time bonus's moment (issue 833): over the league's card, a flash, the Cobbles' stones bursting out and "+N" rising, then
 * gone after `BONUS_BURST_MS`. Under reduced motion it is still: the figure shows, nothing moves. Its figure is announced.
 */
export function BonusBurst({ value, onDone, held = false, className }: BonusBurstProps) {
  const reduced = useReducedMotionConfig() ?? false;
  const still = held || reduced;
  useEffect(() => {
    if (held || !onDone) return;
    const id = setTimeout(onDone, BONUS_BURST_MS);
    return () => clearTimeout(id);
  }, [held, onDone]);
  return (
    <m.div
      data-slot="bonus-burst"
      className={cn("pointer-events-none absolute inset-0 z-10 grid place-items-center", className)}
      initial={held ? false : { opacity: 1 }}
      animate={{ opacity: held ? 1 : [1, 1, 0] }}
      transition={{ duration: BONUS_BURST_MS / 1000, times: [0, 0.75, 1] }}
    >
      <span aria-hidden className="absolute size-44 rounded-full opacity-40" style={{ backgroundImage: "radial-gradient(closest-side, var(--primary), transparent 70%)" }} />
      {!reduced &&
        STONES.map((angle) => {
          const rad = (angle * Math.PI) / 180;
          return (
            <m.span
              key={angle}
              aria-hidden
              className="absolute"
              initial={held ? false : { x: 0, y: 0, opacity: 1, scale: 0.6 }}
              animate={{ x: Math.cos(rad) * 72, y: Math.sin(rad) * 56, opacity: held ? 1 : 0, scale: 1 }}
              transition={{ duration: 0.9, ease: "easeOut" }}
            >
              <TokenIcon kind="cobbles" size="sm" />
            </m.span>
          );
        })}
      <m.span
        role="status"
        className="relative rounded-full bg-card px-3 py-1"
        initial={still ? false : { scale: 0.4, y: 12 }}
        animate={{ scale: 1, y: still ? 0 : -6 }}
        transition={{ type: "spring", stiffness: 380, damping: 16 }}
      >
        <Cobbles value={value} sign="+" size="lg" />
      </m.span>
    </m.div>
  );
}
