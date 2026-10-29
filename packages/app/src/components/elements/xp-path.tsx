import { formatInteger } from "@paved/game-core";
import { useEffect } from "react";
import { useMotionValue, useTransform } from "motion/react";
import * as m from "motion/react-m";
import { FILL_PATH, isMaxLevel, LevelPlate, levelPath, PATH_BOX, pathPoint, pathShare, XpPathFrame } from "./xp-level";
import { useXpMotion, type PlayerProgress } from "./xp-ring";

export interface XpPathProps {
  /** Undefined while it is read: the empty track, "Lv" alone. */
  progress: PlayerProgress | undefined;
  /** The name column's width in the path's units (px at the 44 px box): the line runs over it, to "Lv i". */
  column: number;
  /** The avatar's box in px, the path drawn at its scale (#856: the season dial's size on the home). Default: 44. */
  box?: number;
}

/**
 * The player's level as a path (issue 830, in place of issue 787's bar): an arc round the avatar from its right, clockwise to its
 * top, that runs on as a line to the right, and "Lv i" in a plate at its end. The share of the level is laid on the whole path,
 * so the arc fills first, then the line. A gain fills it and a "+N XP" rises at the progress's end; a level up completes it,
 * flashes it, turns the level over, then fills the new one (`useXpMotion`, the ring's). Under reduced motion the values change
 * at once with a brief flash. Two siblings for the badge's row: the drawing over the avatar's box, and the plate in the flow.
 * Decorative: the control that holds it says the level and the XP left.
 */
export function XpPath({ progress, column, box = PATH_BOX }: XpPathProps) {
  const { share, level, gain, setGain, burst, setBurst, flash, setFlash } = useXpMotion(progress);
  const capped = progress ? isMaxLevel(progress) : false;
  // The cap's path is full whatever the share (its span is 0): a motion value too, so a level up into the cap redraws it.
  const full = useMotionValue(capped ? 1 : 0);
  useEffect(() => full.set(capped ? 1 : 0), [capped, full]);
  const drawn = useTransform([share, full], ([s, f]: number[]) => (f ? 1 : s!));
  // A round cap draws a dot at length 0: the fill is hidden there.
  const fillOpacity = useTransform(drawn, (v) => (v > 0.001 ? 1 : 0));
  const lit = burst ?? flash;
  const { d } = levelPath(column);
  const end = progress ? pathPoint(pathShare(progress), column) : null;
  const k = box / PATH_BOX;
  return (
    <>
      <XpPathFrame
        column={column}
        box={box}
        fill={<m.path data-slot="xp-fill" d={d} {...FILL_PATH} style={{ pathLength: drawn, opacity: fillOpacity }} />}
        over={
          gain &&
          end && (
            <m.span
              key={gain.id}
              data-slot="xp-gain"
              className="numeric absolute text-xs font-bold whitespace-nowrap text-primary [text-shadow:0_1px_2px_var(--background)]"
              // Centred on the fill's end, but never left of the path's box: on the arc's left side (a quarter of the level) a
              // centred label would stick out of the screen's edge at 360 px.
              style={{ left: end.x * k, top: end.y * k, translate: `calc(-1 * min(50%, ${end.x * k}px)) -100%` }}
              initial={{ y: 0, opacity: 0 }}
              animate={{ y: -14, opacity: [0, 1, 1, 0] }}
              transition={{ duration: 1.2, ease: "easeOut", times: [0, 0.15, 0.7, 1] }}
              onAnimationComplete={() => setGain((g) => (g?.id === gain.id ? null : g))}
            >
              +{formatInteger(gain.amount)} XP
            </m.span>
          )
        }
      >
        {lit !== null && (
          <m.path
            key={lit}
            data-slot="xp-flash"
            d={d}
            fill="none"
            strokeWidth={7}
            strokeLinecap="round"
            className="stroke-primary/60"
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            onAnimationComplete={() => {
              setFlash((f) => (f === lit ? null : f));
              setBurst((b) => (b === lit ? null : b));
            }}
          />
        )}
      </XpPathFrame>
      <LevelPlate>
        {progress && level !== undefined ? (
          <m.span key={level} className="inline-block" initial={burst === null ? false : { rotateX: -90 }} animate={{ rotateX: 0 }} transition={{ duration: 0.3, ease: "easeOut" }}>
            Lv {formatInteger(level)}
          </m.span>
        ) : (
          "Lv"
        )}
      </LevelPlate>
    </>
  );
}
