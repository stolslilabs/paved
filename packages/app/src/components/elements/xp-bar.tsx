import { formatInteger } from "@paved/game-core";
import * as m from "motion/react-m";
import { isMaxLevel, xpLeftText, XpBarFrame } from "./xp-level";
import { useXpMotion, type PlayerProgress } from "./xp-ring";

export interface XpBarProps {
  /** Undefined while it is read: the empty track, no level. */
  progress: PlayerProgress | undefined;
  className?: string;
}

/**
 * The player's level as a horizontal bar (issue 787, in place of issue 625's ring on the home): "Lv 7" and the share of the level, then
 * the XP left to the next ("Max level" at the cap, the bar full). A gain fills the bar and a "+N XP" rises over its end; a
 * level up completes it, flashes it, turns the level over, then fills the new one (`useXpMotion`, the ring's). Under reduced
 * motion the values change at once with a brief flash. Decorative: the control that holds it says the level and the XP left.
 */
export function XpBar({ progress, className }: XpBarProps) {
  const { share, level, gain, setGain, burst, setBurst, flash, setFlash } = useXpMotion(progress);
  const capped = progress ? isMaxLevel(progress) : false;
  const lit = burst ?? flash;
  return (
    <XpBarFrame
      className={className}
      level={
        progress && level !== undefined ? (
          <m.span key={level} className="inline-block" initial={burst === null ? false : { rotateX: -90 }} animate={{ rotateX: 0 }} transition={{ duration: 0.3, ease: "easeOut" }}>
            Lv {formatInteger(level)}
          </m.span>
        ) : (
          "Lv"
        )
      }
      fill={<m.span data-slot="xp-fill" className="absolute inset-0 origin-left rounded-full bg-primary" style={{ scaleX: capped ? 1 : share }} />}
      left={progress ? xpLeftText(progress) : " "}
    >
      {lit !== null && (
        <m.span
          key={lit}
          data-slot="xp-flash"
          className="absolute -inset-0.5 rounded-full bg-primary/60"
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          onAnimationComplete={() => {
            setFlash((f) => (f === lit ? null : f));
            setBurst((b) => (b === lit ? null : b));
          }}
        />
      )}
      {gain && (
        <m.span
          key={gain.id}
          data-slot="xp-gain"
          className="numeric absolute right-0 -top-1 text-xs font-bold whitespace-nowrap text-primary [text-shadow:0_1px_2px_var(--background)]"
          initial={{ y: 0, opacity: 0 }}
          animate={{ y: -14, opacity: [0, 1, 1, 0] }}
          transition={{ duration: 1.2, ease: "easeOut", times: [0, 0.15, 0.7, 1] }}
          onAnimationComplete={() => setGain((g) => (g?.id === gain.id ? null : g))}
        >
          +{formatInteger(gain.amount)} XP
        </m.span>
      )}
    </XpBarFrame>
  );
}
