import { useEffect, useRef, useState } from "react";
import { useReducedMotionConfig } from "motion/react";

/**
 * How long a game that ends on its board stays there before its scores open: the last tile's drop (the renderer's `voxelDrop`,
 * 1 to 2 s), its green (`confirmHoldMs`, 1 s) and the points it closed (`ClosingFeed`, the score's +N) play out, and the player
 * sees the finished board.
 */
export const GAME_OVER_HOLD_MS = 3000;

/** The same under reduced motion: no drop and a short green (`reducedConfirmMs`), so only the time to read the last points. */
export const GAME_OVER_HOLD_REDUCED_MS = 1500;

export interface AfterGameOverOptions {
  /** Every move is final (a Challenge's confirmed by the chain): the scores wait for it as well as for the hold. Default true. */
  settled?: boolean;
  /** Hold the board first; off when the end has nothing to watch (a surrender). Default true. */
  hold?: boolean;
}

/**
 * Calls `onOver` once the game is over and settled: after the hold when it ended on this board (its last move, predicted or
 * not), at once when it was already over when first read (a reload, a link to a finished game). `over` is null while the game
 * is not read. Leaving the board, or a game no longer over (a new game, a refused move rolled back), cancels it.
 */
export function useAfterGameOver(over: boolean | null, onOver: () => void, { settled = true, hold = true }: AfterGameOverOptions = {}): void {
  const reduced = useReducedMotionConfig();
  // Whether the game was over when first read: null until then.
  const overOnOpen = useRef<boolean | null>(over);
  const latest = useRef(onOver);
  latest.current = onOver;
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (over === null) return;
    overOnOpen.current ??= over;
    if (!over) {
      overOnOpen.current = false;
      setHeld(false);
      return;
    }
    if (overOnOpen.current || !hold) {
      setHeld(true);
      return;
    }
    const timer = setTimeout(() => setHeld(true), reduced ? GAME_OVER_HOLD_REDUCED_MS : GAME_OVER_HOLD_MS);
    return () => clearTimeout(timer);
  }, [over, hold, reduced]);
  useEffect(() => {
    if (over && held && settled) latest.current();
  }, [over, held, settled]);
}
