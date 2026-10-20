import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { haptic } from "./haptics";

/** How long a hold lasts to act, ms (PLACE-POLISH, issue 568: about 0.8 s, the usual hold of a sensitive action). */
export const HOLD_MS = 800;

/** idle: not held; holding: the ring fills; done: the hold completed, the ring full until it is let go. */
export type HoldState = "idle" | "holding" | "done";

export interface HoldOptions {
  /** The action, once per completed hold. */
  onComplete: () => void;
  /** The hold's length, ms. */
  holdMs?: number;
  /**
   * What the hold validates (the tile's cell and rotation, say): when it changes mid-hold, the hold is dropped and the ring
   * rewinds, so a completed hold always acts on what was shown for its whole length.
   */
  holdKey?: string | number;
  /** Disabled or busy: no hold starts, and one under way is dropped. */
  disabled?: boolean;
}

/**
 * One hold, whatever holds it (TILE-HOLD, #630): the button that shows its ring (`HoldButton`) and any other source, the
 * board's press on the placed tile. Each source starts it and lets it go; the ring fills the same whichever it is.
 */
export interface Hold {
  state: HoldState;
  holdMs: number;
  /** Starts the hold, with the light tick: false when it is disabled (nothing starts; the source does what it does without). */
  start(): boolean;
  /** Let go: before the end the hold is cancelled and the ring rewinds; after it, the ring empties. */
  release(): void;
  /** The source dropped it (a pan, a second finger, the pointer leaving): as a release before the end. */
  cancel(): void;
  /** The hold last started completed: read at the let go, so that a completed hold does not also act on its release. */
  completed(): boolean;
  /** Acts at once, with the firm tick: an activation with no hold before it (a screen reader's double tap). */
  act(): void;
}

/**
 * The hold's controller (PLACE-POLISH, #568; shared by TILE-HOLD, #630): `start` fills it over `holdMs` (a light tick), the
 * end acts once (a firmer tick, `haptic`, where the device has haptics); `release` or `cancel` before the end rewinds it.
 * A change of `holdKey`, `disabled` turning on, or the unmount drops a hold under way.
 */
export function useHold({ onComplete, holdMs = HOLD_MS, holdKey, disabled = false }: HoldOptions): Hold {
  const [state, setState] = useState<HoldState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const done = useRef(false);
  // The hold's timer calls the latest action, never the one of the render it started in.
  const action = useRef(onComplete);
  action.current = onComplete;
  const off = useRef(disabled);
  off.current = disabled;

  const stop = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const act = useCallback(() => {
    haptic("firm");
    action.current();
  }, []);
  const start = useCallback(() => {
    if (off.current) return false;
    stop();
    done.current = false;
    haptic("light");
    setState("holding");
    timer.current = setTimeout(() => {
      timer.current = null;
      done.current = true;
      setState("done");
      act();
    }, holdMs);
    return true;
  }, [stop, holdMs, act]);
  const release = useCallback(() => {
    stop();
    setState("idle");
  }, [stop]);
  const completed = useCallback(() => done.current, []);

  useEffect(() => stop, [stop]);
  // Disabled or busy mid-hold: the hold is dropped.
  useEffect(() => {
    if (disabled) release();
  }, [disabled, release]);
  // What the hold validates changed mid-hold (a rotation): the hold is dropped; a new press starts it again.
  const lastKey = useRef(holdKey);
  useEffect(() => {
    if (lastKey.current === holdKey) return;
    lastKey.current = holdKey;
    release();
  }, [holdKey, release]);

  return useMemo(() => ({ state, holdMs, start, release, cancel: release, completed, act }), [state, holdMs, start, release, completed, act]);
}
