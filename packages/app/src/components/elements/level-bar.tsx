import { formatInteger } from "@paved/game-core";
import { useEffect } from "react";
import { useMotionValue, useTransform } from "motion/react";
import * as m from "motion/react-m";
import { cn } from "../../lib/utils";
import { UiIcon } from "./ui-icon";
import { isMaxLevel } from "./xp-level";
import { useXpMotion, type PlayerProgress } from "./xp-ring";

/** The level as the star shows it: two figures at most ("99+" past them). */
export const levelText = (level: number | undefined): string => (level === undefined ? "" : level > 99 ? "99+" : formatInteger(level));

/** The XP as the bar shows it: "90/150", "Max" at the cap. */
export const xpText = (progress: PlayerProgress): string =>
  isMaxLevel(progress) ? "Max" : `${formatInteger(progress.xp)}/${formatInteger(progress.xpForNext)}`;

export interface LevelBarProps {
  /** Undefined while it is read: the empty track, the star blank. */
  progress: PlayerProgress | undefined;
  className?: string;
}

/**
 * The player's level on the player card (the owner's direction of 2026-11-01, `docs/design/home.webp`): the HUD's blue star holding
 * the level, over the left end of a luminous blue bar, the XP made and the XP the level needs in it ("90/150"). A gain fills the bar
 * and a "+N XP" rises at its end; a level up completes it, flashes it, turns the level over, then fills the new one (`useXpMotion`).
 * Under reduced motion the values change at once with a brief flash. Decorative: the card says the level and the XP left.
 */
export function LevelBar({ progress, className }: LevelBarProps) {
  const { share, level, gain, setGain, burst, setBurst, flash, setFlash } = useXpMotion(progress);
  const capped = progress ? isMaxLevel(progress) : false;
  // The cap's bar is full whatever the share (its span is 0): a motion value too, so a level up into the cap redraws it.
  const full = useMotionValue(capped ? 1 : 0);
  useEffect(() => full.set(capped ? 1 : 0), [capped, full]);
  const width = useTransform([share, full], ([s, f]: number[]) => `${(f ? 1 : s!) * 100}%`);
  const lit = burst ?? flash;
  return (
    <span data-slot="level-bar" aria-hidden className={cn("relative flex h-7 w-36 shrink-0 items-center pl-3.5 tablet:w-40", className)}>
      {/* The track: a dark groove with a light edge; the fill a luminous blue, lit along its top. */}
      <span className="relative h-4.5 flex-1 overflow-hidden rounded-r-full border border-foreground/25 bg-background shadow-inner">
        <m.span data-slot="level-fill" className="absolute inset-y-0 left-0 bg-gradient-to-b from-info to-info/55 after:absolute after:inset-x-0 after:top-0.5 after:h-1 after:rounded-full after:bg-foreground/30" style={{ width }} />
        {lit !== null && (
          // The level up lights the whole bar, fading.
          <m.span
            key={lit}
            data-slot="level-flash"
            className="absolute inset-0 bg-info"
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            onAnimationComplete={() => {
              setFlash((f) => (f === lit ? null : f));
              setBurst((b) => (b === lit ? null : b));
            }}
          />
        )}
        <span data-slot="xp" className="numeric text-outline absolute inset-0 grid place-items-center pl-2 text-xs leading-none font-bold text-foreground">
          {progress ? xpText(progress) : ""}
        </span>
      </span>
      {/* The star over the bar's left end, the level in it. */}
      <span className="absolute top-0 left-0 grid size-7 place-items-center perspective-[200px]">
        <UiIcon name="level-star" px={28} className="absolute inset-0 size-full" />
        <span data-slot="level" className="numeric text-outline relative text-xs leading-none font-bold text-foreground">
          {progress && level !== undefined ? (
            <m.span key={level} className="inline-block" initial={burst === null ? false : { rotateX: -90 }} animate={{ rotateX: 0 }} transition={{ duration: 0.3, ease: "easeOut" }}>
              {levelText(level)}
            </m.span>
          ) : (
            levelText(undefined)
          )}
        </span>
      </span>
      {gain && (
        <m.span
          key={gain.id}
          data-slot="xp-gain"
          className="numeric text-outline pointer-events-none absolute right-0 bottom-full text-xs font-bold whitespace-nowrap text-primary"
          initial={{ y: 0, opacity: 0 }}
          animate={{ y: -10, opacity: [0, 1, 1, 0] }}
          transition={{ duration: 1.2, ease: "easeOut", times: [0, 0.15, 0.7, 1] }}
          onAnimationComplete={() => setGain((g) => (g?.id === gain.id ? null : g))}
        >
          +{formatInteger(gain.amount)} XP
        </m.span>
      )}
    </span>
  );
}
