import { useReducedMotionConfig } from "motion/react";
import * as m from "motion/react-m";
import { cn } from "../../lib/utils";
import type { ChestRank } from "./chest-badge";

/** Each rank's medal colour (the tokens of `theme.css`), for the light. */
const MEDAL: Readonly<Record<ChestRank, string>> = { epic: "var(--medal-1)", rare: "var(--medal-2)", basic: "var(--medal-3)" };

/**
 * The rays behind the chest, a wheel of thin wedges faded at its edge, and the flash: inline styles, as each is drawn once, so
 * the page's stylesheet carries no gradient per rank.
 */
const rays = (color: string) => ({
  backgroundImage: `repeating-conic-gradient(${color} 0deg 7deg, transparent 7deg 22.5deg)`,
  maskImage: "radial-gradient(closest-side, var(--foreground) 20%, transparent)",
});
const flash = (color: string) => ({ backgroundImage: `radial-gradient(closest-side, ${color}, transparent 70%)` });

export interface ChestBurstProps {
  rank: ChestRank;
  /** For the stories: the light held at its peak, the rays still. */
  held?: boolean;
  className?: string;
}

/**
 * The light of a chest's opening (issue 784): a flash in the rank's colour that blooms and settles into a glow, and rays that turn
 * slowly behind the chest. Decorative: it sits behind the chest, takes no pointer and says nothing to a screen reader. Under
 * reduced motion the rays stay still and the flash only fades.
 */
export function ChestBurst({ rank, held = false, className }: ChestBurstProps) {
  const reduced = useReducedMotionConfig() ?? false;
  const still = held || reduced;
  return (
    <span aria-hidden data-burst={rank} className={cn("pointer-events-none absolute inset-0 grid place-items-center", className)}>
      <m.span
        className="absolute size-72 rounded-full"
        style={rays(MEDAL[rank])}
        initial={held ? false : { opacity: 0, scale: reduced ? 1 : 0.4 }}
        animate={{ opacity: 0.5, scale: 1, rotate: still ? 0 : 360 }}
        transition={{ opacity: { duration: 0.4 }, scale: { duration: 0.5, ease: "easeOut" }, rotate: { duration: 24, repeat: Infinity, ease: "linear" } }}
      />
      <m.span
        className="absolute size-48 rounded-full"
        style={flash(MEDAL[rank])}
        initial={held ? false : { opacity: 1, scale: reduced ? 1 : 0.3 }}
        animate={held ? { opacity: 0.9, scale: 1.3 } : { opacity: 0.35, scale: reduced ? 1 : 1.5 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
      />
    </span>
  );
}
