import { useEffect, useState } from "react";

/**
 * A module loaded on demand (BOARD-CHUNK): `null` until `wanted` first turns true and `load()` answers. A failed load calls
 * `onError` once and the next `wanted` turning true tries again; nothing throws into the page (ERR-UI), unlike `lazy`, whose
 * rejection reaches the route's error boundary and takes the board with it.
 */
export function useDeferred<T>(load: () => Promise<T>, wanted: boolean, onError?: (error: unknown) => void): T | null {
  const [loaded, setLoaded] = useState<T | null>(null);
  useEffect(() => {
    if (!wanted || loaded !== null) return;
    let live = true;
    load().then(
      (m) => live && setLoaded(m),
      (e) => live && onError?.(e),
    );
    return () => {
      live = false;
    };
    // `load` and `onError` are module-level or stable by the callers' contract.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, loaded]);
  return loaded;
}
