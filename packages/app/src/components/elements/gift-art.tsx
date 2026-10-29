import { useReducedMotionConfig } from "motion/react";
import * as m from "motion/react-m";
import { cn } from "../../lib/utils";

/**
 * A gift's state (issue 869, the owner's decision of 2026-10-29): `locked` is out of reach (greyed), `lit` is reached but cannot be
 * claimed now (still), `ready` waits for its tap (lit,
 * shaking now and then, as a ready chest does), `shaking` is its claim on its way (shaking fast, as the chest while its draw comes),
 * `opening` plays the opening (the box jumps, its lid pops up and away, light bursts out of it), `open` is the gift opened (the lid
 * tilted off the box, its light inside).
 */
export type GiftArtState = "locked" | "lit" | "ready" | "shaking" | "opening" | "open";

/** The lid's flight off the box (s), and when the light peaks: the reward shows then. */
export const GIFT_LID_S = 0.45;
export const GIFT_LIGHT_S = 0.3;

/** The shake of a ready gift: a few short shakes, then a pause, repeated (s), the chest modal's rhythm (issue 784). */
const SHAKE_S = 0.7;
const SHAKE_PAUSE_S = 1.4;
const SHAKE = { rotate: [0, -12, 12, -9, 9, -4, 4, 0] };
/** The claim's fast shake: keyframes of its own, so the change from `ready` starts it at once (Motion restarts on new values only). */
const SHAKE_FAST = { rotate: [0, -10, 10, -10, 10, 0] };

/**
 * A part's paint, by inline style so the drawing adds no class to the first load's CSS: a semantic token of `theme.css` (`--primary`,
 * always defined, unlike the `--color-*` that Tailwind emits only when a class uses it).
 */
const paint = (token: string, opacity?: number) => ({ fill: `var(--${token})`, fillOpacity: opacity });

/** The lid's resting place once the gift is open: tilted up and off to the left, in the drawing's units. */
const LID_OPEN = { x: -5, y: -6, rotate: -28 };

export interface GiftArtProps {
  state?: GiftArtState;
  /** The opening's last frame at once (the stories): the lid off, the light held. */
  held?: boolean;
  className?: string;
}

/**
 * A small gift drawn for the day's milestones (issue 869): a box in the gold of the primary, a red ribbon, a lid with its bow, so that
 * a reward node needs no figure on it. Decorative (`aria-hidden`): the node names the reward. Its size is the font size (1em). Under
 * reduced motion nothing shakes or flies: the opening shows the gift open at once.
 */
export function GiftArt({ state = "ready", held = false, className }: GiftArtProps) {
  const reduced = useReducedMotionConfig() ?? false;
  const muted = state === "locked";
  const opened = state === "opening" || state === "open";
  const fly = state === "opening" && !reduced && !held;
  const still = reduced || muted || opened || state === "lit";
  const box = muted ? paint("muted-foreground", 0.45) : paint("primary");
  const ribbon = muted ? paint("muted-foreground") : paint("destructive");
  const lid = (
    <>
      <rect x="3" y="10" width="26" height="6" rx="1.5" style={box} />
      <rect x="3" y="10" width="26" height="1.5" rx="0.75" style={paint("foreground", 0.25)} />
      <rect x="14" y="10" width="4" height="6" style={ribbon} />
      <path d="M16 10C12 3 6 4 7.5 8.2 8.4 10 12.5 10 16 10ZM16 10C20 3 26 4 24.5 8.2 23.6 10 19.5 10 16 10Z" style={ribbon} />
      <circle cx="16" cy="9.6" r="2" style={ribbon} />
    </>
  );
  return (
    <span aria-hidden data-slot="gift-art" data-state={state} className={cn("relative inline-grid place-items-center", className)}
      style={{ width: "1em", height: "1em" }}>
      {opened && (
        // The light out of the open box: a glow that swells and settles, held while the gift is open.
        <m.span
          className="absolute rounded-full"
          style={{ inset: "-0.35em", background: "var(--primary)", filter: "blur(0.2em)" }}
          initial={fly ? { scale: 0.2, opacity: 0 } : false}
          animate={state === "opening" ? { scale: 1, opacity: 0.4 } : { scale: 0.75, opacity: 0.22 }}
          transition={fly ? { duration: 0.5, delay: GIFT_LIGHT_S * 0.4, ease: "easeOut" } : { duration: 0 }}
        />
      )}
      <m.svg
        viewBox="0 0 32 32"
        className="relative size-full overflow-visible"
        initial={false}
        animate={still ? { rotate: 0, scale: fly ? [1, 0.86, 1.12, 1] : 1 } : state === "shaking" ? SHAKE_FAST : SHAKE}
        transition={
          fly
            ? { duration: 0.4, times: [0, 0.3, 0.65, 1], ease: "easeOut" }
            : still
              ? { duration: 0 }
              : state === "shaking"
                ? { duration: SHAKE_S / 2, repeat: Infinity, ease: "easeInOut" }
                : { duration: SHAKE_S, repeat: Infinity, repeatDelay: SHAKE_PAUSE_S, ease: "easeInOut" }
        }
        style={{ transformOrigin: "50% 90%" }}
      >
        <rect x="5" y="15" width="22" height="14" rx="2" style={box} />
        <rect x="5" y="15" width="22" height="3" style={paint("background", 0.3)} />
        <rect x="14" y="15" width="4" height="14" style={ribbon} />
        {opened && <rect x="7" y="15" width="18" height="1.5" rx="0.75" style={paint("primary-foreground", 0.6)} />}
        <m.g
          data-part="lid"
          initial={fly ? { x: 0, y: 0, rotate: 0 } : false}
          animate={opened ? (fly ? { x: [0, 0, -7, LID_OPEN.x], y: [0, 2, -12, LID_OPEN.y], rotate: [0, 0, -50, LID_OPEN.rotate] } : LID_OPEN) : { x: 0, y: 0, rotate: 0 }}
          transition={fly ? { duration: GIFT_LID_S, times: [0, 0.2, 0.65, 1], ease: "easeOut" } : { duration: 0 }}
          style={{ transformBox: "fill-box", transformOrigin: "50% 100%" }}
        >
          {lid}
        </m.g>
      </m.svg>
    </span>
  );
}
