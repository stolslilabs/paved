import { useEffect } from "react";

/**
 * iOS Safari ignores `user-scalable=no`: its pinch reaches the page as the non-standard `gesturestart` and
 * `gesturechange` events, which zoom the page unless cancelled (APP-FEEL, P-69). Cancelling them leaves the touch and
 * pointer events alone: the board's canvas still gets its own pinch, pan and rotate.
 */
export function stopPageGesture(event: Event): void {
  event.preventDefault();
}

/** Cancels the page's pinch on the document, for as long as the app is mounted. */
export function usePageGestures(target: Document = document): void {
  useEffect(() => {
    const options = { passive: false } as const;
    target.addEventListener("gesturestart", stopPageGesture, options);
    target.addEventListener("gesturechange", stopPageGesture, options);
    return () => {
      target.removeEventListener("gesturestart", stopPageGesture);
      target.removeEventListener("gesturechange", stopPageGesture);
    };
  }, [target]);
}
