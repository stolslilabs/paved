import { useReducedMotionConfig } from "motion/react";
import * as m from "motion/react-m";
import { cn } from "../../lib/utils";

/**
 * One cloud: where it sits (percent of the layer), its width (percent of the layer's width), the side it leaves by when the
 * clouds part, and how long one drift across takes.
 */
interface Cloud {
  top: number;
  left: number;
  width: number;
  side: -1 | 1;
  drift: number;
}

/** Twelve clouds in four bands, staggered: the screen covered at 375 px and at 1440 px. */
const CLOUDS: readonly Cloud[] = [
  { top: -6, left: -18, width: 70, side: -1, drift: 14 },
  { top: 0, left: 42, width: 76, side: 1, drift: 17 },
  { top: 16, left: 8, width: 64, side: -1, drift: 15 },
  { top: 22, left: 58, width: 66, side: 1, drift: 19 },
  { top: 36, left: -24, width: 74, side: -1, drift: 16 },
  { top: 40, left: 36, width: 80, side: 1, drift: 13 },
  { top: 54, left: 4, width: 70, side: -1, drift: 18 },
  { top: 58, left: 60, width: 64, side: 1, drift: 15 },
  { top: 72, left: -16, width: 78, side: -1, drift: 17 },
  { top: 76, left: 44, width: 72, side: 1, drift: 14 },
  { top: 88, left: 0, width: 66, side: -1, drift: 16 },
  { top: 90, left: 54, width: 70, side: 1, drift: 19 },
];

/** A cloud's shape: three puffs on a flat base, the lower edge shaded. Decorative. */
function Puffs() {
  return (
    <span className="relative block aspect-[5/2] w-full">
      <span className="absolute bottom-0 left-[4%] h-[62%] w-[44%] rounded-full bg-cloud" />
      <span className="absolute bottom-[14%] left-[26%] h-[86%] w-[42%] rounded-full bg-cloud" />
      <span className="absolute bottom-0 left-[52%] h-[70%] w-[44%] rounded-full bg-cloud" />
      <span className="absolute inset-x-[8%] bottom-0 h-[34%] rounded-full bg-cloud-shade" />
      <span className="absolute inset-x-[10%] bottom-[8%] h-[30%] rounded-full bg-cloud" />
    </span>
  );
}

export interface SearchCloudsProps {
  /** The opponent is found: the clouds part, each to its side, and uncover what is under them. */
  parted?: boolean;
  className?: string;
}

/**
 * The search's clouds (issue 647, Clash of Clans' waiting screen): a sky covered by clouds that drift side to side while an
 * opponent is drawn, and part once one is found. Under reduced motion they stand still and part at once. Decorative: the
 * scene says what is happening.
 */
export function SearchClouds({ parted = false, className }: SearchCloudsProps) {
  const reduced = useReducedMotionConfig() ?? false;
  return (
    <div aria-hidden data-parted={parted} className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      {CLOUDS.map((c, i) => (
        <m.span
          key={i}
          className="absolute block drop-shadow-lg"
          style={{ top: `${c.top}%`, left: `${c.left}%`, width: `${c.width}%`, maxWidth: "52rem" }}
          initial={false}
          animate={
            parted
              ? { x: `${c.side * 140}%`, opacity: 0 }
              : reduced
                ? { x: "0%", opacity: 1 }
                : { x: ["0%", `${c.side * -8}%`, "0%"], opacity: 1 }
          }
          transition={
            parted
              ? { duration: reduced ? 0 : 0.9, ease: [0.4, 0, 0.2, 1], delay: reduced ? 0 : (i % 4) * 0.05 }
              : { duration: c.drift / 2, ease: "easeInOut", repeat: reduced ? 0 : Infinity }
          }
        >
          <Puffs />
        </m.span>
      ))}
    </div>
  );
}
