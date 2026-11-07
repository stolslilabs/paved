import type { CSSProperties, ReactNode } from "react";
import { useReducedMotionConfig } from "motion/react";
import * as m from "motion/react-m";
import { cn } from "../../lib/utils";
import { attackArtSources } from "./attack-art";
import { UiIcon } from "./ui-icon";

/** One turn of the sweep, seconds. */
const TURN_S = 2.4;

/**
 * The blips, where the book draws its three crowns (`search`): the angle clockwise from the top, and the distance from the centre in
 * the dish's radius. The dish fills 480 of its frame's 512 px, so its radius is 0.47 of the box.
 */
const BLIPS = [
  { angle: 324, r: 0.69 },
  { angle: 104, r: 0.59 },
  { angle: 216, r: 0.63 },
] as const;
const DISH = 0.47;

/** A blip's place in the box, percent from its top left, and its size (a crown a ninth of the dish). */
const place = (angle: number, r: number): CSSProperties => {
  const a = (angle * Math.PI) / 180;
  return { left: `${50 + 100 * DISH * r * Math.sin(a)}%`, top: `${50 - 100 * DISH * r * Math.cos(a)}%`, width: "11%", height: "11%" };
};
/** The sweep's box: its light reaches the face's edge, 0.815 of the dish's box, centred (inline: no one-off class). */
const BEAM: CSSProperties = { inset: "9.25%", width: "81.5%", height: "81.5%" };
/** The face inside the rim, where the rival found is shown. */
const CENTRE: CSSProperties = { inset: "18%" };

export interface SearchRadarProps {
  /** The draw is on its way: the sweep turns and the crowns light as it passes. Off: the dish alone, still. */
  sweeping: boolean;
  /** No rival drawn (none in range, an error): the dish dimmed. */
  quiet?: boolean;
  /** What the dish shows at its centre once the sweep stops (the rival found). */
  children?: ReactNode;
  className?: string;
}

/**
 * The search's radar (ATTACK-SCOUT, the Paved UX Book's `search`): the painted gold dish, its painted sweep turning over it, and the
 * crowns of the villages near the player's as blips, each lit as the sweep passes and fading after. Under reduced motion the sweep
 * stands still and the crowns stay lit. A square sized by its caller; decorative, the scene says what happens.
 */
export function SearchRadar({ sweeping, quiet = false, children, className }: SearchRadarProps) {
  const reduced = useReducedMotionConfig() ?? false;
  return (
    <span aria-hidden data-slot="search-radar" data-sweeping={sweeping} className={cn("relative block aspect-square shrink-0", className)}>
      <img {...attackArtSources("radar", 208)} alt="" draggable={false} decoding="async" className={cn("absolute inset-0 size-full transition-[filter] duration-300", quiet && "brightness-75 grayscale")} />
      {sweeping && (
        <>
          {/* The sweep's light reaches the face's edge: 0.815 of the dish's box. */}
          <m.img
            {...attackArtSources("radar-beam", 170)}
            alt=""
            draggable={false}
            decoding="async"
            className="absolute mix-blend-screen"
            style={BEAM}
            initial={{ rotate: reduced ? 40 : 0 }}
            animate={reduced ? { rotate: 40 } : { rotate: 360 }}
            transition={reduced ? { duration: 0 } : { duration: TURN_S, ease: "linear", repeat: Infinity }}
          />
          {BLIPS.map((b) => (
            <m.span key={b.angle} className="absolute -translate-x-1/2 -translate-y-1/2" style={place(b.angle, b.r)}
              initial={{ opacity: reduced ? 1 : 0.25 }}
              animate={reduced ? { opacity: 1 } : { opacity: [1, 0.25], scale: [1.2, 1] }}
              transition={reduced ? { duration: 0 } : { duration: TURN_S, ease: "easeOut", repeat: Infinity, delay: (b.angle / 360) * TURN_S }}
            >
              <UiIcon name="crown" px={24} className="block size-full" />
            </m.span>
          ))}
        </>
      )}
      {children && (
        <span className="absolute grid place-items-center" style={CENTRE}>
          {children}
        </span>
      )}
    </span>
  );
}
