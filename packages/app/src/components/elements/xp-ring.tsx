import { formatInteger } from "@paved/game-core";
import { useEffect, useRef, useState } from "react";
import { animate } from "motion";
import { useMotionValue, useReducedMotionConfig, useTransform } from "motion/react";
import * as m from "motion/react-m";
import { cn } from "../../lib/utils";

/** Where the player stands (issue 625): their level, the XP made in it, and the XP that completes it. */
export interface PlayerProgress {
  level: number;
  xp: number;
  xpForNext: number;
  /** The player's whole XP, when the source knows it (`Setup.player_level`, #641): what a gain across levels is measured on. */
  total?: number;
}

/** The share of the current level the ring draws, from 0 to 1. */
export const levelShare = ({ xp, xpForNext }: PlayerProgress): number => (xpForNext > 0 ? Math.min(1, Math.max(0, xp / xpForNext)) : 0);

/**
 * The XP made between two readings, for the "+N XP": 0 when nothing was gained (a drop is not animated). With both totals, their
 * difference: the levels passed cost what the curve says, which the ring does not know. Without them, across levels: the rest
 * of the first, each full level passed (at the new threshold) and the new level's XP.
 */
export function xpGained(from: PlayerProgress, to: PlayerProgress): number {
  if (from.total !== undefined && to.total !== undefined) return Math.max(0, to.total - from.total);
  if (to.level < from.level) return 0;
  if (to.level === from.level) return Math.max(0, to.xp - from.xp);
  return Math.max(0, from.xpForNext - from.xp) + (to.level - from.level - 1) * to.xpForNext + to.xp;
}

/** Each avatar size's box (`PlayerAvatar`'s) and the ring's width in its band. */
const GEOMETRY = {
  md: { box: 44, stroke: 3, rise: -22 },
  lg: { box: 96, stroke: 5, rise: -28 },
} as const;

/** Where the "+N XP" starts: the small avatar's centre (in a header at the top of the screen it ends at the avatar's top), the large one's top. */
const GAIN_FROM = { md: "top-1/2 -mt-2", lg: "top-0" } as const;

const BADGE = {
  md: "-right-1 -bottom-1 h-5 min-w-5 px-1 text-xs",
  lg: "right-0 bottom-0 h-8 min-w-8 px-1.5 text-sm",
} as const;

const FILL_S = 0.6;
const COMPLETE_S = 0.4;
/** The burst's sparks, evenly round the avatar. */
const SPARKS = 8;

export interface XpRingProps {
  /** Undefined while it is read: the empty track, no badge. */
  progress: PlayerProgress | undefined;
  size?: keyof typeof GEOMETRY;
  className?: string;
}

/**
 * The XP ring and level badge around `PlayerAvatar` (issue 625), drawn in its band (pass it as the avatar's children). The arc is
 * the share of the current level. A gain fills the arc to its new share and a "+N XP" rises and fades; a level up completes
 * the arc, turns the badge over to the next number with a short burst, then fills the new level. Under reduced motion the
 * values change at once with a brief flash, and nothing moves. Decorative, like the avatar: the control that holds it says the level.
 */
export function XpRing({ progress, size = "md", className }: XpRingProps) {
  const { box, stroke, rise } = GEOMETRY[size];
  const r = (box - stroke) / 2;
  const reduced = useReducedMotionConfig();
  const share = useMotionValue(progress ? levelShare(progress) : 0);
  // A round cap draws a dot at length 0: the arc is hidden there.
  const arcOpacity = useTransform(share, (v) => (v > 0.001 ? 1 : 0));
  const [level, setLevel] = useState(progress?.level);
  const [gain, setGain] = useState<{ id: number; amount: number } | null>(null);
  const [burst, setBurst] = useState<number | null>(null);
  const [flash, setFlash] = useState<number | null>(null);
  const events = useRef(0);
  const last = useRef(progress);

  const lv = progress?.level;
  const xp = progress?.xp;
  const next = progress?.xpForNext;
  const total = progress?.total;
  useEffect(() => {
    if (lv === undefined || xp === undefined || next === undefined) {
      // Read again: the empty track, and the next reading is drawn as it is (no gain from a stale one).
      last.current = undefined;
      share.jump(0);
      return;
    }
    const to = { level: lv, xp, xpForNext: next, total };
    const from = last.current;
    last.current = to;
    const target = levelShare(to);
    const gained = from ? xpGained(from, to) : 0;
    if (!from || gained <= 0 || reduced) {
      share.jump(target);
      setLevel(lv);
      if (from && gained > 0) setFlash(++events.current);
      return;
    }
    setGain({ id: ++events.current, amount: gained });
    if (lv === from.level) {
      setLevel(lv);
      const run = animate(share, target, { duration: FILL_S, ease: "easeOut" });
      return () => run.stop();
    }
    let stopped = false;
    let run = animate(share, 1, { duration: COMPLETE_S, ease: "easeIn" });
    void run.then(() => {
      if (stopped) return;
      setLevel(lv);
      setBurst(++events.current);
      share.jump(0);
      run = animate(share, target, { duration: FILL_S, ease: "easeOut", delay: 0.15 });
    });
    return () => {
      stopped = true;
      run.stop();
    };
  }, [lv, xp, next, total, reduced, share]);

  return (
    <span data-slot="xp-ring" aria-hidden className={cn("pointer-events-none absolute inset-0", className)}>
      <svg viewBox={`0 0 ${box} ${box}`} className="absolute inset-0 size-full -rotate-90 overflow-visible">
        <circle cx={box / 2} cy={box / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-primary/25" />
        <m.circle cx={box / 2} cy={box / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" className="stroke-primary" style={{ pathLength: share, opacity: arcOpacity }} />
      </svg>

      {flash !== null && (
        <m.span
          key={flash}
          data-slot="xp-flash"
          className="absolute inset-0 rounded-full bg-primary/35"
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          onAnimationComplete={() => setFlash((f) => (f === flash ? null : f))}
        />
      )}

      {burst !== null && (
        <span key={burst} data-slot="xp-burst" className="absolute inset-0">
          <m.span
            className="absolute inset-0 rounded-full border-2 border-primary"
            initial={{ scale: 1, opacity: 0.6 }}
            animate={{ scale: 1.3, opacity: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            onAnimationComplete={() => setBurst((b) => (b === burst ? null : b))}
          />
          {Array.from({ length: SPARKS }, (_, i) => {
            const angle = (i / SPARKS) * Math.PI * 2;
            // From the ring's edge outwards, clear of the avatar's face.
            const [from, to] = [box / 2, box * 0.7];
            return (
              <m.span
                key={i}
                className="absolute top-1/2 left-1/2 -mt-0.5 -ml-0.5 size-1 rounded-full bg-primary"
                initial={{ x: Math.cos(angle) * from, y: Math.sin(angle) * from, opacity: 0.8 }}
                animate={{ x: Math.cos(angle) * to, y: Math.sin(angle) * to, opacity: 0 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              />
            );
          })}
        </span>
      )}

      {gain && (
        <m.span
          key={gain.id}
          data-slot="xp-gain"
          className={cn("numeric absolute left-1/2 -translate-x-1/2 text-xs font-bold whitespace-nowrap text-primary [text-shadow:0_1px_2px_var(--background)]", GAIN_FROM[size])}
          initial={{ y: 0, opacity: 0 }}
          animate={{ y: rise, opacity: [0, 1, 1, 0] }}
          transition={{ duration: 1.2, ease: "easeOut", times: [0, 0.15, 0.7, 1] }}
          onAnimationComplete={() => setGain((g) => (g?.id === gain.id ? null : g))}
        >
          +{formatInteger(gain.amount)} XP
        </m.span>
      )}

      {progress && level !== undefined && (
        <span data-slot="level-badge" className={cn("absolute grid place-items-center overflow-hidden rounded-full border-2 border-background bg-primary perspective-[200px]", BADGE[size])}>
          <m.span
            key={level}
            className="numeric leading-none font-bold text-primary-foreground"
            initial={burst === null ? false : { rotateX: -90 }}
            animate={{ rotateX: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            {formatInteger(level)}
          </m.span>
        </span>
      )}
    </span>
  );
}
