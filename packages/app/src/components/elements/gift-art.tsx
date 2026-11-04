import { useReducedMotionConfig } from "motion/react";
import * as m from "motion/react-m";
import type { CSSProperties } from "react";
import { cn } from "../../lib/utils";
import { missionPartImage } from "./medallion-art";
import { UiIcon } from "./ui-icon";

/**
 * A gift's state (issue 869, the owner's decision of 2026-10-29): `locked` is out of reach (silvered), `lit` is reached but cannot be
 * claimed now (still), `ready` waits for its tap (lit,
 * shaking now and then, as a ready chest does), `shaking` is its claim on its way (shaking fast, as the chest while its draw comes),
 * `opening` plays the opening (the box jumps, light bursts out of it), `open` is the gift opened (its light inside, the box dimmed). A
 * gift that waits (`ready`, `shaking`) sits in the book's gold halo, its box rimmed with light.
 */
export type GiftArtState = "locked" | "lit" | "ready" | "shaking" | "opening" | "open";

/**
 * Whose gift it is: the day's or the week's. MISSIONS-PAGE (the Paved UX Book's Missions, the owner's approved mockups of 2026-11-02):
 * both are the book's one gift, the week's told apart by its row and its tooltip's Cobbles, no longer by a ribbon of its own.
 */
export type GiftArtVariant = "day" | "week";

/** The lid's flight off the box (s), and when the light peaks: the reward shows then. */
export const GIFT_LID_S = 0.45;
export const GIFT_LIGHT_S = 0.3;

/** The shake of a ready gift: a few short shakes, then a pause, repeated (s), the chest modal's rhythm (issue 784). */
const SHAKE_S = 0.7;
const SHAKE_PAUSE_S = 1.4;
const SHAKE = { rotate: [0, -12, 12, -9, 9, -4, 4, 0] };
/** The claim's fast shake: keyframes of its own, so the change from `ready` starts it at once (Motion restarts on new values only). */
const SHAKE_FAST = { rotate: [0, -10, 10, -10, 10, 0] };

/** A waiting gift's rim (the book's): a tight light gold glow along the box, then an orange one. */
export const GIFT_RIM = "drop-shadow(0 0 1.5px var(--medal-1)) drop-shadow(0 0 4px var(--warning))";

/**
 * The gift's look by state, as a filter on the book's red gift: out of reach, the book's silver box (no colour, lighter); waiting, its
 * glowing rim; opened, the box dimmed under its light. Inline, in the page's chunk.
 */
const LOOK: Partial<Record<GiftArtState, CSSProperties>> = {
  locked: { filter: "grayscale(1) brightness(1.2) contrast(0.85)" },
  ready: { filter: GIFT_RIM },
  shaking: { filter: GIFT_RIM },
  open: { filter: "saturate(0.55) brightness(0.8)" },
};

/** The gold halo a waiting gift sits in (the book's, `gift-glow`): about 3.2 times the gift, saturated as the book's, no blur. */
const HALO: CSSProperties = { inset: "-1.1em", background: `${missionPartImage("gift-glow")} center / contain no-repeat`, filter: "saturate(1.6)" };

export interface GiftArtProps {
  state?: GiftArtState;
  /** The opening's last frame at once (the stories): the light held. */
  held?: boolean;
  /** The day's gift (the default) or the week's: the same gift (MISSIONS-PAGE), the variant kept on its node for the tests and styles. */
  variant?: GiftArtVariant;
  className?: string;
  /** Its box's style: its size is its font size (`fontSize`). */
  style?: CSSProperties;
}

/**
 * A gift of the milestones, the day's (issue 869) and the week's (issue 976): the Paved UX Book's red box with its gold ribbon
 * (MISSIONS-PAGE, the HUD's gift icon, `invite`, the book's own drawing), silvered out of reach, so that a reward node needs no figure
 * on it. Decorative (`aria-hidden`): the node names the reward. Its size is the font size (1em). Under reduced motion nothing shakes
 * or jumps: the opening shows the gift open at once.
 */
export function GiftArt({ state = "ready", held = false, variant = "day", className, style }: GiftArtProps) {
  const reduced = useReducedMotionConfig() ?? false;
  const muted = state === "locked";
  const opened = state === "opening" || state === "open";
  const fly = state === "opening" && !reduced && !held;
  const still = reduced || muted || opened || state === "lit";
  return (
    <span aria-hidden data-slot="gift-art" data-state={state} data-variant={variant} className={cn("relative inline-grid place-items-center", className)}
      style={{ width: "1em", height: "1em", ...style }}>
      {(opened || state === "ready" || state === "shaking") && (
        // The light: the book's gold halo round a gift that waits, swelling out of it as it opens, held smaller once it is open.
        <m.span
          data-part="light"
          className="absolute"
          style={HALO}
          initial={fly ? { scale: 0.2, opacity: 0 } : false}
          animate={state === "opening" ? { scale: 1.1, opacity: 1 } : opened ? { scale: 0.7, opacity: 0.45 } : { scale: 0.8, opacity: 1 }}
          transition={fly ? { duration: 0.5, delay: GIFT_LIGHT_S * 0.4, ease: "easeOut" } : { duration: 0 }}
        />
      )}
      <m.span
        className="absolute inset-0"
        initial={false}
        animate={still ? { rotate: 0, scale: fly ? [1, 0.86, 1.18, 1] : 1, y: fly ? [0, 0, -4, 0] : 0 } : state === "shaking" ? SHAKE_FAST : SHAKE}
        transition={
          fly
            ? { duration: GIFT_LID_S, times: [0, 0.3, 0.65, 1], ease: "easeOut" }
            : still
              ? { duration: 0 }
              : state === "shaking"
                ? { duration: SHAKE_S / 2, repeat: Infinity, ease: "easeInOut" }
                : { duration: SHAKE_S, repeat: Infinity, repeatDelay: SHAKE_PAUSE_S, ease: "easeInOut" }
        }
        style={{ transformOrigin: "50% 90%", ...LOOK[state] }}
      >
        <UiIcon name="invite" px={40} className="drawer-icon block size-full" />
      </m.span>
    </span>
  );
}
