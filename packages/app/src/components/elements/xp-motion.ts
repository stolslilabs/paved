import { useEffect, useRef, useState } from "react";
import { animate } from "motion";
import { useMotionValue, useReducedMotionConfig } from "motion/react";

/** Where the player stands (issue 625): their level, the XP made in it, and the XP that completes it. */
export interface PlayerProgress {
  level: number;
  xp: number;
  xpForNext: number;
  /** The player's whole XP, when the source knows it (`Setup.player_level`, issue 641): what a gain across levels is measured on. */
  total?: number;
}

/** The share of the current level the bar draws, from 0 to 1. */
export const levelShare = ({ xp, xpForNext }: PlayerProgress): number => (xpForNext > 0 ? Math.min(1, Math.max(0, xp / xpForNext)) : 0);

/**
 * The XP made between two readings, for the "+N XP": 0 when nothing was gained (a drop is not animated). With both totals, their
 * difference: the levels passed cost what the curve says, which a level's own figures do not give. Without them, across levels: the rest
 * of the first, each full level passed (at the new threshold) and the new level's XP.
 */
export function xpGained(from: PlayerProgress, to: PlayerProgress): number {
  if (from.total !== undefined && to.total !== undefined) return Math.max(0, to.total - from.total);
  if (to.level < from.level) return 0;
  if (to.level === from.level) return Math.max(0, to.xp - from.xp);
  return Math.max(0, from.xpForNext - from.xp) + (to.level - from.level - 1) * to.xpForNext + to.xp;
}

const FILL_S = 0.6;
const COMPLETE_S = 0.4;

/**
 * The motion of a level's progress (issue 625; issue 787's bar, `LevelBar`, draws it): the share drawn, the level shown, and the events
 * (a "+N XP", a level up's burst, reduced motion's flash), each a fresh id the drawing keys on and clears once played. A gain
 * fills the share; a level up completes it, turns the level over, then fills the new one; under reduced motion the values change
 * at once with the flash.
 */
export function useXpMotion(progress: PlayerProgress | undefined) {
  const reduced = useReducedMotionConfig();
  const share = useMotionValue(progress ? levelShare(progress) : 0);
  const [level, setLevel] = useState(progress?.level);
  const [gain, setGain] = useState<{ id: number; amount: number } | null>(null);
  const [burst, setBurst] = useState<number | null>(null);
  const [flash, setFlash] = useState<number | null>(null);
  const events = useRef(0);
  const last = useRef(progress);

  const lv = progress?.level;
  const xp = progress?.xp;
  const next = progress?.xpForNext;
  const total = progress?.total;
  useEffect(() => {
    if (lv === undefined || xp === undefined || next === undefined) {
      // Read again: the empty track, and the next reading is drawn as it is (no gain from a stale one).
      last.current = undefined;
      share.jump(0);
      return;
    }
    const to = { level: lv, xp, xpForNext: next, total };
    const from = last.current;
    last.current = to;
    const target = levelShare(to);
    const gained = from ? xpGained(from, to) : 0;
    if (!from || gained <= 0 || reduced) {
      share.jump(target);
      setLevel(lv);
      if (from && gained > 0) setFlash(++events.current);
      return;
    }
    setGain({ id: ++events.current, amount: gained });
    if (lv === from.level) {
      setLevel(lv);
      const run = animate(share, target, { duration: FILL_S, ease: "easeOut" });
      return () => run.stop();
    }
    let stopped = false;
    let run = animate(share, 1, { duration: COMPLETE_S, ease: "easeIn" });
    void run.then(() => {
      if (stopped) return;
      setLevel(lv);
      setBurst(++events.current);
      share.jump(0);
      run = animate(share, target, { duration: FILL_S, ease: "easeOut", delay: 0.15 });
    });
    return () => {
      stopped = true;
      run.stop();
    };
  }, [lv, xp, next, total, reduced, share]);

  return { share, level, gain, setGain, burst, setBurst, flash, setFlash };
}
