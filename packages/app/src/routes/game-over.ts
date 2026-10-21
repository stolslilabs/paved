import { useEffect, useRef } from "react";
import { useReducedMotionConfig } from "motion/react";

/**
 * How long a game that ends on its board stays there before its scores open: the last tile's drop (the renderer's `voxelDrop`,
 * 1 to 2 s), its green (`confirmHoldMs`, 1 s) and the points it closed (`ClosingFeed`, the score's +N) play out, and the player
 * sees the finished board.
 */
export const GAME_OVER_HOLD_MS = 3000;

/** The same under reduced motion: no drop and a short green (`reducedConfirmMs`), so only the time to read the last points. */
export const GAME_OVER_HOLD_REDUCED_MS = 1500;

/**
 * Calls `onOver` once the game is over: after the hold when it ended on this board (its last move), at once when it was
 * already over as the board opened (a reload, a link to a finished game). Leaving the board, or a new game, cancels it.
 */
export function useAfterGameOver(over: boolean, onOver: () => void): void {
  const reduced = useReducedMotionConfig();
  const overOnOpen = useRef(over);
  const latest = useRef(onOver);
  latest.current = onOver;
  useEffect(() => {
    if (!over) {
      overOnOpen.current = false;
      return;
    }
    if (overOnOpen.current) {
      latest.current();
      return;
    }
    const timer = setTimeout(() => latest.current(), reduced ? GAME_OVER_HOLD_REDUCED_MS : GAME_OVER_HOLD_MS);
    return () => clearTimeout(timer);
  }, [over, reduced]);
}
