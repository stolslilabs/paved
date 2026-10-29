import { useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useReducedMotionConfig } from "motion/react";
import * as m from "motion/react-m";
import { TokenIcon } from "./token-icon";

/** The stones of a burst, and the time between two (s). */
const STONES = 6;
const STAGGER = 0.06;
/** One stone's flight (s). */
const FLIGHT = 0.7;

interface Point {
  x: number;
  y: number;
}

const centre = (r: DOMRect): Point => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

/** The Cobbles' plate on screen (issue 828; the pill and the rail are both in the DOM, the breakpoint shows one), or null. */
function plate(): DOMRect | null {
  for (const el of document.querySelectorAll<HTMLElement>('[data-plate="cobbles"]')) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return r;
  }
  return null;
}

export interface CobblesBurstProps {
  /** Where the stones leave from: the reward that paid them, read once the burst is on screen. */
  from: () => HTMLElement | null;
  /** Once the last stone has landed (at once under reduced motion). */
  onDone: () => void;
}

/**
 * A short burst of Cobbles into the balance's plate (issue 869, proposal 5): a few stones leave the reward and fly, one after the
 * other, to the Cobbles' plate of the header (issue 828), which counts to the new balance; with no plate on screen they rise and fade.
 * Decorative: over the page in a fixed layer, it takes no pointer and says nothing to a screen reader. Under reduced motion
 * nothing moves: no stone is drawn.
 */
export function CobblesBurst({ from, onDone }: CobblesBurstProps) {
  const reduced = useReducedMotionConfig() ?? false;
  // The flight's ends, measured once when it starts.
  const [path, setPath] = useState<{ start: Point; end: Point; landed: boolean } | null>(null);
  useLayoutEffect(() => {
    const el = from();
    if (reduced) return;
    if (!el) return onDone();
    const start = centre(el.getBoundingClientRect());
    const target = plate();
    setPath({ start, end: target ? centre(target) : { x: start.x, y: start.y - 96 }, landed: target !== null });
    // Measured once: the burst is keyed by its claim.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (reduced) onDone();
  }, [reduced, onDone]);
  if (reduced || !path) return null;
  const dx = path.end.x - path.start.x;
  const dy = path.end.y - path.start.y;
  return createPortal(
    <span aria-hidden data-burst="cobbles" className="pointer-events-none fixed inset-0 z-50">
      {Array.from({ length: STONES }, (_, i) => {
        // A fan around the start, then the stones gather into the plate.
        const spread = (i - (STONES - 1) / 2) * 14;
        return (
          <m.span
            key={i}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: path.start.x, top: path.start.y }}
            initial={{ x: 0, y: 0, opacity: 0, scale: 0.6 }}
            animate={{ x: [0, spread, dx], y: [0, -28 - Math.abs(spread), dy], opacity: [0, 1, path.landed ? 1 : 0], scale: [0.6, 1.1, 0.7] }}
            transition={{ duration: FLIGHT, delay: i * STAGGER, ease: "easeInOut", times: [0, 0.3, 1] }}
            onAnimationComplete={i === STONES - 1 ? onDone : undefined}
          >
            <TokenIcon kind="cobbles" size="sm" />
          </m.span>
        );
      })}
    </span>,
    document.body,
  );
}
