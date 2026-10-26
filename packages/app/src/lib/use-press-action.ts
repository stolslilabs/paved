import { useCallback, useEffect, useRef, useState } from "react";
import { useHold, type Hold } from "./use-hold";

/** How long a press lasts, within the click threshold, before what it shows comes (the tile in hand, #680; the press bubble, #799). */
export const PRESS_SHOW_MS = 150;
/** How long the press bubble stays after an early let go, its button tappable, before it fades (#799: about 3 s). */
export const PRESS_LINGER_MS = 3000;
/** The press bubble's fade, ms (none under reduced motion: it goes at the fade's end). */
export const PRESS_FADE_MS = 200;

/** holding: the press goes on, the ring fills; lingering: let go early, the button tappable; fading: on its way out. */
export type PressPhase = "holding" | "lingering" | "fading";

export interface PressActionOptions {
  /** The action: the end of the hold, or a tap on the bubble's button. */
  onAct: () => void;
  /** Off: no press shows anything, and a bubble up goes. */
  enabled: boolean;
  holdMs?: number;
  showMs?: number;
  lingerMs?: number;
}

export interface PressAction<C> {
  /** The bubble up, by `cell`, in its phase; null: none. */
  shown: { cell: C; phase: PressPhase } | null;
  /** The bubble's ring. */
  hold: Hold;
  /** A press down on a cell that can be pressed: once it lasts `showMs`, the bubble shows by it and the hold starts. */
  down(cell: C): void;
  /** The press let go: true when it showed the bubble or acted, so its let go clicks nothing. */
  release(): boolean;
  /** The press dropped (a pan, a second finger, the pointer leaving): nothing shows, or the bubble goes at once. */
  cancel(): void;
  /** A tap elsewhere, Escape: the bubble goes at once. */
  dismiss(): void;
  /** The bubble's button tapped: acts at once, with the firm tick. */
  act(): void;
}

/**
 * A long press into an action (LONGPRESS-EDIT, #799, the village's Edit): a press that stays still for `showMs` shows a bubble
 * by its cell with one button, whose ring (`useHold`) fills as the press goes on; held to its end, it acts, with the firm tick.
 * Let go early, the ring rewinds and the bubble stays `lingerMs` with its button tappable, then fades. A pan or a second finger
 * before the bubble shows does nothing; after, it hides the bubble at once, as a new press anywhere does. The surface (the 3D
 * board's presses, the plan view's pointer events) says which cells can be pressed and reports the press.
 */
export function usePressAction<C>({ onAct, enabled, holdMs, showMs = PRESS_SHOW_MS, lingerMs = PRESS_LINGER_MS }: PressActionOptions): PressAction<C> {
  const [shown, setShown] = useState<{ cell: C; phase: PressPhase } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The press under way (from its down to its let go), and whether it showed the bubble or acted.
  const pressing = useRef(false);
  const showed = useRef(false);
  const acted = useRef(false);
  const action = useRef(onAct);
  action.current = onAct;
  const complete = useCallback(() => {
    acted.current = true;
    action.current();
  }, []);
  const hold = useHold({ onComplete: complete, holdMs, disabled: !enabled });
  const holdRef = useRef(hold);
  holdRef.current = hold;

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const dismiss = useCallback(() => {
    clear();
    holdRef.current.cancel();
    setShown(null);
  }, [clear]);
  const down = useCallback(
    (cell: C) => {
      dismiss();
      pressing.current = true;
      showed.current = false;
      acted.current = false;
      if (!enabled) return;
      timer.current = setTimeout(() => {
        timer.current = null;
        showed.current = true;
        setShown({ cell, phase: "holding" });
        holdRef.current.start();
      }, showMs);
    },
    [dismiss, enabled, showMs],
  );
  const release = useCallback(() => {
    if (!pressing.current) return false;
    pressing.current = false;
    if (acted.current) {
      dismiss();
      return true;
    }
    if (!showed.current) {
      clear();
      return false;
    }
    holdRef.current.release();
    setShown((s) => s && { ...s, phase: "lingering" });
    timer.current = setTimeout(() => {
      setShown((s) => s && { ...s, phase: "fading" });
      timer.current = setTimeout(() => {
        timer.current = null;
        setShown(null);
      }, PRESS_FADE_MS);
    }, lingerMs);
    return true;
  }, [clear, dismiss, lingerMs]);
  const cancel = useCallback(() => {
    pressing.current = false;
    dismiss();
  }, [dismiss]);
  const act = useCallback(() => {
    dismiss();
    holdRef.current.act();
  }, [dismiss]);

  useEffect(() => {
    if (!enabled) dismiss();
  }, [enabled, dismiss]);
  useEffect(() => clear, [clear]);

  return { shown, hold, down, release, cancel, dismiss, act };
}
