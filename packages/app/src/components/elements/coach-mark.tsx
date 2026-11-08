import type { CSSProperties } from "react";
import * as m from "motion/react-m";
import { useReducedMotionConfig } from "motion/react";
import { cn } from "../../lib/utils";
import { CHEST_EFFECTS, chestEffectUrl, pickSize } from "./chest-images";

/** The waves of light that spring from the control one after the other (as the opened chest's gushes), seconds each. */
const WAVE_S = 2.4;
const WAVES = [0, 1] as const;
/** The breath of the light: its glow and its front fan swell and settle, seconds. */
const BREATH_S = 1.6;

/** The screen's density, for the rays' copy: 1 to 3. */
const density = () => (typeof window === "undefined" ? 2 : Math.min(3, Math.max(1, window.devicePixelRatio || 1)));

/** An image as a mask, stretched to its box: the painted rays tinted by the code. */
const masked = (url: string): CSSProperties => ({ maskImage: `url(${url})`, maskSize: "100% 100%", maskRepeat: "no-repeat" });

/** The light's colours: the Missions' gold of the hold rings (`--hold-gold-*`), white at its heart. */
const GOLD = "var(--hold-gold-bright)";
const SHINE = "var(--hold-gold-shine)";

export interface CoachMarkProps {
  /** The light's width, as a share of its box's width (the control's): 2.2 round a 44 px button. */
  spread?: number;
  /** The light's centre in its box, as shares of its sides: the box's middle by default (the tile stack's pile is lower). */
  at?: { x: number; y: number };
  /** The light's width on screen, CSS px: which copy of the painted rays it takes. */
  px?: number;
  className?: string;
}

/**
 * The coach mark (GAME-OVERLAY, the owner's ask of 2026-11-07: no yellow wireframe pulsing round the deck): the control a Story tip
 * names stands in the light of an opened chest (`ChestArt`'s), the one shine of the board, which marks the control to use. Behind the
 * control (its box is `relative isolate`, the mark first in it): a flash as it comes, at once; two fans of the painted rays
 * (`chest-art/fx/rays`, painted by Codex on black, the black turned to transparency) in the hold rings' gold, turning either way; a
 * white glow breathing at its heart; waves of light springing out one after the other. The same mark on every target (the tile's
 * Confirm and trash, the stack's trash, the tile stack, the gear). Its rays are a shape (a starburst round the
 * control, bright on the dark board), never a colour alone; under reduced motion the fans and the glow stay, still.
 */
export function CoachMark({ spread = 2.2, at = { x: 0.5, y: 0.5 }, px = 96, className }: CoachMarkProps) {
  const reduced = useReducedMotionConfig() ?? false;
  const rays = chestEffectUrl("rays", pickSize(CHEST_EFFECTS.rays.sizes, px * density()));
  return (
    <span
      aria-hidden
      data-coach-mark
      className={cn("pointer-events-none absolute -z-10 aspect-square -translate-x-1/2 -translate-y-1/2", className)}
      style={{ left: `${at.x * 100}%`, top: `${at.y * 100}%`, width: `${spread * 100}%` }}
    >
      {/* The flash as the mark comes: at once, then gone (a fade-in would read as lag). */}
      {!reduced && (
        <m.span
          data-part="flash"
          className="absolute inset-0 rounded-full"
          style={{ background: `radial-gradient(closest-side, ${SHINE}, ${GOLD} 30%, transparent 70%)` }}
          initial={{ opacity: 0.95, scale: 0.5 }}
          animate={{ opacity: 0, scale: 1.3 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      )}
      {/* The waves: fans of light springing out of the control, growing and fading, one after the other. */}
      {!reduced &&
        WAVES.map((i) => (
          <m.span
            key={i}
            data-part="wave"
            className="absolute inset-0"
            style={{ ...masked(rays), backgroundColor: `color-mix(in oklab, ${GOLD} 55%, ${SHINE})`, rotate: `${i * 15}deg` }}
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: [0, 0.75, 0], scale: [0.4, 0.95, 1.35] }}
            transition={{ duration: WAVE_S, times: [0, 0.3, 1], ease: "easeOut", repeat: Infinity, delay: 0.2 + (i * WAVE_S) / WAVES.length }}
          />
        ))}
      {/* The two fans: the gold one turning one way, a white one over it turning the other way and breathing. */}
      <m.span
        data-part="rays"
        className="absolute inset-0"
        style={{ ...masked(rays), backgroundColor: GOLD, opacity: 0.9 }}
        animate={reduced ? { rotate: 0 } : { rotate: 360 }}
        transition={reduced ? { duration: 0 } : { duration: 14, repeat: Infinity, ease: "linear" }}
      />
      <m.span
        data-part="rays"
        className="absolute inset-0"
        style={{ ...masked(rays), backgroundColor: SHINE, opacity: 0.45 }}
        initial={{ rotate: 12 }}
        animate={reduced ? { rotate: 12 } : { rotate: -348, scale: [1, 1.1, 1] }}
        transition={reduced ? { duration: 0 } : { rotate: { duration: 10, repeat: Infinity, ease: "linear" }, scale: { duration: BREATH_S, repeat: Infinity, ease: "easeInOut" } }}
      />
      {/* The glow at the heart, under the control: gold, breathing (white would wash out a light control over it). */}
      <m.span
        data-part="glow"
        className="absolute inset-[18%] rounded-full"
        style={{ background: `radial-gradient(closest-side, ${GOLD}, color-mix(in oklab, ${GOLD} 55%, transparent) 55%, transparent)` }}
        initial={{ opacity: 0.7 }}
        animate={reduced ? { opacity: 0.7 } : { opacity: [0.55, 0.9, 0.55] }}
        transition={reduced ? { duration: 0 } : { duration: BREATH_S, repeat: Infinity, ease: "easeInOut" }}
      />
    </span>
  );
}
