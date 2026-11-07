import type { CSSProperties } from "react";
import * as m from "motion/react-m";
import { BLACK_OUTLINE } from "./black-outline";
import { goldPillStyle } from "./friends-art";

/**
 * A drawer's main action in its footer (PLAY-PAGE's Confirm, VAULT-PAGE's Deposit and Withdraw; the owner's asks of 2026-11-06): the
 * book's gold pill (Follow back's, `goldPillStyle`) at 48 px, the footer's band less its padding, the word in white outlined in black
 * (`BLACK_OUTLINE`); no glow. On a ghost `Button`, `relative`, with `GoldShine` inside while it can be pressed.
 */
export const GOLD_ACTION: CSSProperties = { ...goldPillStyle(48), textShadow: BLACK_OUTLINE };

/** The light crossing the pill: a white band, faded at both ends. */
const SHINE: CSSProperties = { backgroundImage: "linear-gradient(90deg, transparent, color-mix(in oklab, var(--foreground) 55%, transparent), transparent)" };

/**
 * The light crossing a gold action now and then, as it crosses the chests' Take: inside the pill's face, `delay` seconds after it shows,
 * then every 3.1 s. Decorative; still under reduced motion (`MotionConfig`).
 */
export function GoldShine({ delay = 0.4 }: { delay?: number }) {
  return (
    <span aria-hidden data-slot="gold-shine" className="pointer-events-none absolute inset-1 overflow-hidden rounded-full">
      <m.span
        className="absolute inset-y-0 left-0 w-1/3"
        style={SHINE}
        initial={{ x: "-120%" }}
        animate={{ x: "320%" }}
        transition={{ delay, duration: 0.9, repeat: Infinity, repeatDelay: 2.2, ease: "easeInOut" }}
      />
    </span>
  );
}
