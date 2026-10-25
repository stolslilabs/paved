import { useEffect, useState, type CSSProperties } from "react";
import { useReducedMotionConfig } from "motion/react";
import * as m from "motion/react-m";
import { cn } from "../../lib/utils";

/**
 * How the village arrives (issue 761): `fog`, a cold arrival, under a thick fog that thins out once the village is drawn; `fade`, a
 * later one (the renderer's chunk and the assets already in), a short fade from the sky.
 */
export type VillageArrival = "fog" | "fade";

/** How long the fog takes to thin out, and the later arrival's fade (ms). */
export const FOG_CLEAR_MS = 600;
export const FADE_MS = 200;

/** A bank of mist: wide soft blobs of the fog's grey, drawn wider than the scene so that it can drift. */
const mist = (blobs: ReadonlyArray<readonly [x: number, y: number, w: number, h: number, alpha: number]>): CSSProperties => ({
  left: "-20%",
  width: "140%",
  // Its own layer: the drift and the clearing move it on the compositor, with no repaint of the gradients.
  willChange: "transform, opacity",
  backgroundImage: blobs
    .map(([x, y, w, h, alpha]) => `radial-gradient(${w}% ${h}% at ${x}% ${y}%, color-mix(in oklab, var(--fog) ${alpha}%, transparent), transparent)`)
    .join(", "),
});
const BACK = mist([
  [20, 30, 45, 40, 70],
  [55, 55, 50, 45, 75],
  [85, 35, 40, 40, 65],
  [35, 80, 55, 35, 70],
  [75, 85, 45, 35, 65],
]);
const FRONT = mist([
  [10, 60, 35, 30, 55],
  [45, 25, 40, 30, 50],
  [70, 65, 40, 35, 55],
  [95, 50, 35, 40, 50],
]);

export interface VillageFogProps {
  arrival: VillageArrival;
  /** The village and its assets are drawn (the canvas's ready signal): the fog thins out, then leaves the tree. */
  cleared: boolean;
  className?: string;
}

/**
 * The fog over the home's scene while the village loads (issue 761): the placeholder sky under two banks of mist that drift, over
 * the scene's box only (the overlays stay over it, in view and usable: it takes no pointer). Cleared, it thins out (the mist
 * spreads as it fades, `FOG_CLEAR_MS`), then unmounts; under reduced motion the mist stays still and a plain fade clears it.
 * A later arrival (`fade`) is the sky alone, faded out in `FADE_MS`. Hooks and `m` components: the drift waits for the Motion
 * feature set, the clearing never does (its end is a timer).
 */
export function VillageFog({ arrival, cleared, className }: VillageFogProps) {
  const reduced = useReducedMotionConfig() ?? false;
  const ms = arrival === "fog" ? FOG_CLEAR_MS : FADE_MS;
  const [gone, setGone] = useState(false);
  useEffect(() => {
    setGone(false);
    if (!cleared) return;
    const timer = setTimeout(() => setGone(true), ms);
    return () => clearTimeout(timer);
  }, [cleared, ms]);
  if (gone) return null;
  const fog = arrival === "fog";
  return (
    <m.div
      aria-hidden
      data-village-fog={cleared ? "clearing" : "fogged"}
      data-arrival={arrival}
      className={cn("pointer-events-none absolute inset-0 overflow-hidden bg-board", className)}
      initial={false}
      animate={{ opacity: cleared ? 0 : 1 }}
      transition={{ duration: ms / 1000, ease: "easeOut" }}
    >
      {/* The placeholder sky, as the scene's while the stage's chunk arrives: the fog takes over from it with no seam. */}
      <div className="absolute inset-0 bg-gradient-to-b from-background/40 to-board" />
      {fog && (
        <>
          <Bank style={BACK} cleared={cleared} reduced={reduced} drift={[-6, 6]} seconds={22} />
          <Bank style={FRONT} cleared={cleared} reduced={reduced} drift={[5, -5]} seconds={15} />
        </>
      )}
    </m.div>
  );
}

/** A bank of mist: it rolls in as the fog mounts, drifts across and back, and spreads as the fog clears. */
function Bank({ style, cleared, reduced, drift, seconds }: { style: CSSProperties; cleared: boolean; reduced: boolean; drift: [number, number]; seconds: number }) {
  return (
    <m.div
      data-fog-bank={reduced ? "still" : "drifting"}
      className="absolute inset-y-0"
      style={style}
      initial={reduced ? false : { opacity: 0 }}
      animate={reduced ? undefined : cleared ? { opacity: 1, scale: 1.3 } : { opacity: 1, x: drift.map((d) => `${d}%`) }}
      transition={
        cleared
          ? { duration: FOG_CLEAR_MS / 1000, ease: "easeOut" }
          : { opacity: { duration: 0.3 }, x: { duration: seconds, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" } }
      }
    />
  );
}
