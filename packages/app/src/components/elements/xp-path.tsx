import { formatInteger } from "@paved/game-core";
import { useEffect } from "react";
import { useMotionValue, useTransform } from "motion/react";
import * as m from "motion/react-m";
import { DEFAULT_BOX, isMaxLevel, pathShare } from "./xp-level";
import { BAR_OUTLINE, fillCap, fillPath, LevelTag, levelPath, pathPoint, StartCap, tagText, XpPathFrame } from "./xp-path-frame";
import { useXpMotion, type PlayerProgress } from "./xp-ring";

export interface XpPathProps {
  /** Undefined while it is read: the empty track, "Lv" alone. */
  progress: PlayerProgress | undefined;
  /** The avatar's box in px, the path drawn round it and the badge 1.5 times as wide (issues 856, 928). Default: the phone's 96. */
  box?: number;
}

/**
 * The player's level as a path (issue 830, in place of issue 787's bar): an arc round the avatar from its right, clockwise to its
 * top (its start round), that runs on as a line to the right and ends square in the level tag, "Lv i" (issue 928). The share of the level is laid on the whole path,
 * so the arc fills first, then the line. A gain fills it and a "+N XP" rises at the progress's end; a level up completes it,
 * flashes it and lights the tag, turns the level over, then fills the new one (`useXpMotion`, the ring's). Under reduced motion the values change
 * at once with a brief flash. Two siblings laid over the badge's box: the drawing and the tag.
 * Decorative: the control that holds it says the level and the XP left.
 */
export function XpPath({ progress, box = DEFAULT_BOX }: XpPathProps) {
  const { share, level, gain, setGain, burst, setBurst, flash, setFlash } = useXpMotion(progress);
  const capped = progress ? isMaxLevel(progress) : false;
  // The cap's path is full whatever the share (its span is 0): a motion value too, so a level up into the cap redraws it.
  const full = useMotionValue(capped ? 1 : 0);
  useEffect(() => full.set(capped ? 1 : 0), [capped, full]);
  const drawn = useTransform([share, full], ([s, f]: number[]) => (f ? 1 : s!));
  // Nothing drawn at length 0 (the round start would draw a dot there): the fill is hidden, its cap with it.
  const fillOpacity = useTransform(drawn, (v) => (v > 0.001 ? 1 : 0));
  const lit = burst ?? flash;
  const { d, thick } = levelPath(box);
  const end = progress ? pathPoint(pathShare(progress), box) : null;
  return (
    <>
      <XpPathFrame
        box={box}
        fill={
          <>
            <m.path data-slot="xp-fill" d={d} {...fillPath(box)} style={{ pathLength: drawn, opacity: fillOpacity }} />
            <m.g style={{ opacity: fillOpacity }}>
              <StartCap {...fillCap(box)} />
            </m.g>
          </>
        }
        over={
          gain &&
          end && (
            <m.span
              key={gain.id}
              data-slot="xp-gain"
              className="numeric absolute text-xs font-bold whitespace-nowrap text-primary [text-shadow:0_1px_2px_var(--background)]"
              // Centred on the fill's end, but never left of the path's box: on the arc's left side (a quarter of the level) a
              // centred label would stick out of the screen's edge at 360 px.
              style={{ left: end.x, top: end.y, translate: `calc(-1 * min(50%, ${end.x}px)) -100%` }}
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
          <m.g
            key={lit}
            data-slot="xp-flash"
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            onAnimationComplete={() => {
              setFlash((f) => (f === lit ? null : f));
              setBurst((b) => (b === lit ? null : b));
            }}
          >
            {/* Opaque inside a group at 60 %: the cap's lower half, over the path, does not show twice as bright. */}
            <g opacity={0.6}>
              <path d={d} fill="none" strokeWidth={thick + 2 * BAR_OUTLINE} strokeLinecap="butt" className="stroke-primary" />
              <StartCap box={box} width={thick + 2 * BAR_OUTLINE} className="stroke-primary" />
            </g>
          </m.g>
        )}
      </XpPathFrame>
      <LevelTag
        box={box}
        over={
          // The level up lights the tag with the path.
          lit !== null && (
            <m.span key={lit} data-slot="level-flash" className="absolute inset-0 bg-primary/60" initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ duration: 0.5, ease: "easeOut" }} />
          )
        }
      >
        {progress && level !== undefined ? (
          <m.span key={level} className="relative inline-block" initial={burst === null ? false : { rotateX: -90 }} animate={{ rotateX: 0 }} transition={{ duration: 0.3, ease: "easeOut" }}>
            {tagText(level)}
          </m.span>
        ) : (
          tagText(undefined)
        )}
      </LevelTag>
    </>
  );
}
