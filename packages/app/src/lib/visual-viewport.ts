import { useEffect, useState } from "react";

/**
 * The height of the visual viewport, in CSS px, as it changes (#955): on a phone the on-screen keyboard shrinks it, so a box sized
 * by it keeps its field above the keyboard. Null where the browser has no `visualViewport` (then the box keeps its own height).
 */
export function useVisualViewportHeight(): number | null {
  const [height, setHeight] = useState<number | null>(() => (typeof window !== "undefined" && window.visualViewport ? window.visualViewport.height : null));
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;
    const update = () => setHeight(vv.height);
    vv.addEventListener("resize", update);
    return () => vv.removeEventListener("resize", update);
  }, []);
  return height;
}
