import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

/** How far a press may move and still be a tap, in CSS px: past it, a drag (a pan of the scene). */
export const TAP_SLOP = 10;

/**
 * A tap or a click outside `ref` (#792): a press that starts and ends outside it, moves less than `TAP_SLOP`, and is the
 * gesture's only pointer. A drag, a pinch (a second pointer at any time of the gesture), a press the browser took for a scroll
 * (`pointercancel`) and a mouse's other buttons are not taps. A press on `ignore` (a selector: the element's own toggle,
 * whose click does the closing) is not outside. Listened to at the document's capture phase, so a canvas that captures its
 * pointers still tells. Nothing is swallowed: the tap goes on to what it hit.
 */
export function useTapOutside(ref: RefObject<HTMLElement | null>, onTap: () => void, { enabled = true, ignore }: { enabled?: boolean; ignore?: string } = {}) {
  const latest = useRef(onTap);
  useLayoutEffect(() => {
    latest.current = onTap;
  });
  useEffect(() => {
    if (!enabled) return;
    const presses = new Map<number, { x: number; y: number; outside: boolean; moved: boolean }>();
    // A second pointer down: the whole gesture is a pinch, none of its presses a tap.
    let pinch = false;
    const outside = (target: EventTarget | null) => {
      if (!(target instanceof Node)) return true;
      if (ref.current?.contains(target)) return false;
      return !(ignore && target instanceof Element && target.closest(ignore));
    };
    const end = (id: number) => {
      presses.delete(id);
      if (presses.size === 0) pinch = false;
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      presses.set(e.pointerId, { x: e.clientX, y: e.clientY, outside: outside(e.target), moved: false });
      if (presses.size > 1) pinch = true;
    };
    const move = (e: PointerEvent) => {
      const press = presses.get(e.pointerId);
      if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > TAP_SLOP) press.moved = true;
    };
    const up = (e: PointerEvent) => {
      const press = presses.get(e.pointerId);
      if (!press) return;
      const tap = press.outside && !pinch && !press.moved && Math.hypot(e.clientX - press.x, e.clientY - press.y) <= TAP_SLOP;
      end(e.pointerId);
      if (tap) latest.current();
    };
    const cancel = (e: PointerEvent) => end(e.pointerId);
    const options = { capture: true } as const;
    document.addEventListener("pointerdown", down, options);
    document.addEventListener("pointermove", move, options);
    document.addEventListener("pointerup", up, options);
    document.addEventListener("pointercancel", cancel, options);
    return () => {
      document.removeEventListener("pointerdown", down, options);
      document.removeEventListener("pointermove", move, options);
      document.removeEventListener("pointerup", up, options);
      document.removeEventListener("pointercancel", cancel, options);
    };
  }, [enabled, ref, ignore]);
}
