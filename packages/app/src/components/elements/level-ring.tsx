import { formatInteger } from "@paved/game-core";
import { useEffect, useId } from "react";
import { useMotionValue, useTransform } from "motion/react";
import * as m from "motion/react-m";
import { DEFAULT_BOX, isMaxLevel, pathShare } from "./xp-level";
import { useXpMotion, type PlayerProgress } from "./xp-ring";

/** The level's figures in px: 12 (never less, P-69) beside the phones' avatars, 16 beside the 144 px one. */
export const levelFont = (box: number): number => (box >= 144 ? 16 : 12);
/** The shield's text: the level; past 99 (never: the cap is 20) "99+"; nothing while the XP is read. */
export const levelText = (level: number | undefined): string => (level === undefined ? "" : level > 99 ? "99+" : formatInteger(level));

/**
 * The bar's course in a ring `box` px wide, its middle `r` px from the centre: in the ring's groove, a whole turn clockwise from 12
 * o'clock back to it (the owner, 2026-10-31), so it starts and ends under the shield. Two half turns: one arc cannot join its ends.
 */
export function levelArc(box: number, r: number) {
  const c = box / 2;
  return { d: `M ${c} ${c - r} A ${r} ${r} 0 0 1 ${c} ${c + r} A ${r} ${r} 0 0 1 ${c} ${c - r}`, c, length: 2 * Math.PI * r };
}

/** Where a share of the level ends on that course, in px. */
export function arcPoint(share: number, box: number, r: number): { x: number; y: number } {
  const c = box / 2;
  const angle = (Math.min(1, Math.max(0, share)) - 0.25) * 2 * Math.PI;
  return { x: c + r * Math.cos(angle), y: c + r * Math.sin(angle) };
}

/** The bar as the badge's art draws it (`badge-art`'s measures, in px for the ring's box): given by the badge, so this chunk takes none of its module. */
export interface LevelBar {
  /** The glowing ring's image, on the ring's frame. */
  src: string;
  /** The bar's middle, from the ring's centre, and its band across, its glow included. */
  radius: number;
  band: number;
  /** The centre of the shield's face, from the box's top: where the level stands. */
  levelY: number;
}

export interface LevelRingProps {
  /** Undefined while it is read: the empty groove, the shield blank. */
  progress: PlayerProgress | undefined;
  /** The avatar's box in px, the ring's (the season dial's size, issue 856). Default: the phone's 96. */
  box?: number;
  bar: LevelBar;
}

/**
 * The player's level on the badge's ring (the owner's direction of 2026-10-31): the luminous bar in the ring's groove, from 12
 * o'clock under the shield a whole turn clockwise, the share of the level drawn, and the level in the shield's face. The bar is
 * the glowing ring's image (`badge-art`) seen through a mask, the course drawn to the share with round ends. A gain fills it and a
 * "+N XP" rises at its end; a level up completes it, flashes it, turns the level over, then fills the new one (`useXpMotion`, the
 * ring's). Under reduced motion the values change at once with a brief flash. Laid over the ring's box; decorative: the control that
 * holds it says the level and the XP left.
 */
export function LevelRing({ progress, box = DEFAULT_BOX, bar }: LevelRingProps) {
  const { share, level, gain, setGain, burst, setBurst, flash, setFlash } = useXpMotion(progress);
  const capped = progress ? isMaxLevel(progress) : false;
  // The cap's bar is full whatever the share (its span is 0): a motion value too, so a level up into the cap redraws it.
  const full = useMotionValue(capped ? 1 : 0);
  useEffect(() => full.set(capped ? 1 : 0), [capped, full]);
  const drawn = useTransform([share, full], ([s, f]: number[]) => (f ? 1 : s!));
  // Nothing drawn at length 0 (the round end would show a dot there).
  const shown = useTransform(drawn, (v) => (v > 0.001 ? 1 : 0));
  // A mask's id, safe in `url(#...)`.
  const id = `level-${useId().replace(/[^\w-]/g, "")}`;
  const lit = burst ?? flash;
  const { d } = levelArc(box, bar.radius);
  const { band } = bar;
  const end = progress ? arcPoint(pathShare(progress), box, bar.radius) : null;
  return (
    <>
      <svg data-slot="level-bar" aria-hidden viewBox={`0 0 ${box} ${box}`} width={box} height={box} className="pointer-events-none absolute inset-0 overflow-visible">
        <defs>
          <mask id={`${id}-fill`}>
            <m.path data-slot="level-fill" d={d} fill="none" stroke="white" strokeWidth={band} strokeLinecap="round" style={{ pathLength: drawn, opacity: shown }} />
          </mask>
          <mask id={`${id}-all`}>
            <path d={d} fill="none" stroke="white" strokeWidth={band} strokeLinecap="round" />
          </mask>
        </defs>
        <image href={bar.src} width={box} height={box} mask={`url(#${id}-fill)`} />
        {lit !== null && (
          // The level up lights the whole course: the bar's image over it, fading.
          <m.image
            key={lit}
            data-slot="level-flash"
            href={bar.src}
            width={box}
            height={box}
            mask={`url(#${id}-all)`}
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            onAnimationComplete={() => {
              setFlash((f) => (f === lit ? null : f));
              setBurst((b) => (b === lit ? null : b));
            }}
          />
        )}
      </svg>
      <span
        data-slot="level"
        aria-hidden
        className="numeric text-outline pointer-events-none absolute leading-none font-bold whitespace-nowrap text-foreground perspective-[200px]"
        // Over the shield (`zIndex` 1, over the bar, whose end it hides).
        style={{ left: box / 2, top: bar.levelY, translate: "-50% -50%", fontSize: levelFont(box), zIndex: 2 }}
      >
        {progress && level !== undefined ? (
          <m.span key={level} className="relative inline-block" initial={burst === null ? false : { rotateX: -90 }} animate={{ rotateX: 0 }} transition={{ duration: 0.3, ease: "easeOut" }}>
            {levelText(level)}
          </m.span>
        ) : (
          levelText(undefined)
        )}
      </span>
      {gain && end && (
        <m.span
          key={gain.id}
          data-slot="xp-gain"
          aria-hidden
          className="numeric text-outline pointer-events-none absolute text-xs font-bold whitespace-nowrap text-primary"
          // Centred on the bar's end, but never left of the ring's box: on its left side a centred label would stick out of the
          // screen's edge at 320 px.
          style={{ left: end.x, top: end.y, translate: `calc(-1 * min(50%, ${end.x}px)) -100%`, zIndex: 2 }}
          initial={{ y: 0, opacity: 0 }}
          animate={{ y: -14, opacity: [0, 1, 1, 0] }}
          transition={{ duration: 1.2, ease: "easeOut", times: [0, 0.15, 0.7, 1] }}
          onAnimationComplete={() => setGain((g) => (g?.id === gain.id ? null : g))}
        >
          +{formatInteger(gain.amount)} XP
        </m.span>
      )}
    </>
  );
}
