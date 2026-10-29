import { useEffect, useRef, useState, type RefObject } from "react";
import { isWalkKey, moveOfKeys, type WalkControl } from "@paved/renderer";

/** A mouse move larger than this in one event, CSS px, is a browser's jump at the lock's start or end, not a look. */
const MAX_MOVEMENT_PX = 300;

/**
 * The first-person walk's desktop input (V4-WALK-1, #876): the movement keys by their place (`KeyboardEvent.code`: ZQSD on an
 * AZERTY keyboard, WASD on a QWERTY one, and the arrows), and, with `pointerLock`, the mouse look under the Pointer Lock API: a
 * click on the board's canvas inside `target` locks the mouse (a press on the overlay's buttons or sticks does not), Escape frees
 * it (the browser's), and an Escape with the mouse free leaves the walk (`onExit`). Nothing is bound without a walk (`control`
 * null). Returns whether the mouse is locked.
 */
export function useWalkInput(control: WalkControl | null, target: RefObject<HTMLElement | null>, onExit: () => void, pointerLock = true): { mouseLocked: boolean } {
  const [mouseLocked, setMouseLocked] = useState(false);
  const exit = useRef(onExit);
  exit.current = onExit;

  useEffect(() => {
    if (!control) return;
    const held = new Set<string>();
    const sync = () => control.setMove(moveOfKeys(held));
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Escape") {
        // With the mouse locked, the browser's Escape frees it and this one never comes; with it free, it leaves.
        if (document.pointerLockElement !== target.current) exit.current();
        return;
      }
      if (!isWalkKey(event.code) || event.metaKey || event.ctrlKey || event.altKey) return;
      event.preventDefault();
      if (held.has(event.code)) return;
      held.add(event.code);
      sync();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (held.delete(event.code)) sync();
    };
    // A key let go while the window had no focus never comes up: everything stops.
    const onBlur = () => {
      held.clear();
      sync();
    };
    const onLockChange = () => setMouseLocked(document.pointerLockElement === target.current && target.current !== null);
    const onMouseMove = (event: MouseEvent) => {
      if (document.pointerLockElement !== target.current || !target.current) return;
      // Some browsers send one jump of hundreds of px as the lock starts or ends: it is dropped, not turned.
      if (Math.abs(event.movementX) > MAX_MOVEMENT_PX || Math.abs(event.movementY) > MAX_MOVEMENT_PX) return;
      control.look(event.movementX, event.movementY);
    };
    const onClick = (event: MouseEvent) => {
      if (!pointerLock || document.pointerLockElement === target.current || !(event.target instanceof HTMLCanvasElement)) return;
      // Some browsers return a promise that rejects (a click too soon after an Escape): the next click asks again.
      const asked = target.current?.requestPointerLock?.() as unknown;
      if (asked instanceof Promise) asked.catch(() => {});
    };
    const element = target.current;
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    document.addEventListener("pointerlockchange", onLockChange);
    document.addEventListener("mousemove", onMouseMove);
    element?.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("pointerlockchange", onLockChange);
      document.removeEventListener("mousemove", onMouseMove);
      element?.removeEventListener("click", onClick);
      control.setMove({ x: 0, y: 0 });
      if (element && document.pointerLockElement === element) document.exitPointerLock?.();
      setMouseLocked(false);
    };
  }, [control, target, pointerLock]);

  return { mouseLocked };
}
