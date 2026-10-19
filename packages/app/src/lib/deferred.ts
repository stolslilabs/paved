import { useEffect, useState } from "react";
import { isChunkLoadError, recoverStaleChunk } from "./stale-chunk";

/**
 * A module loaded on demand (BOARD-CHUNK): `null` until `wanted` first turns true and `load()` answers. A failed load calls
 * `onError` once and the next `wanted` turning true tries again; nothing throws into the page (ERR-UI), unlike `lazy`, whose
 * rejection reaches the route's error boundary and takes the board with it. A chunk of a build the host no longer serves
 * (#589) reloads the page; after that reload, the same failure is thrown into the page, whose `RouteError` offers a Reload:
 * no new try can fetch it.
 */
export function useDeferred<T>(load: () => Promise<T>, wanted: boolean, onError?: (error: unknown) => void): T | null {
  const [loaded, setLoaded] = useState<T | null>(null);
  const [gone, setGone] = useState<{ error: unknown } | null>(null);
  useEffect(() => {
    if (!wanted || loaded !== null) return;
    let live = true;
    load().then(
      (m) => live && setLoaded(() => m),
      (e: unknown) => {
        if (!live) return;
        if (!isChunkLoadError(e)) return onError?.(e);
        void recoverStaleChunk(e).then((outcome) => {
          if (!live || outcome === "reloading") return;
          if (outcome === "gone") setGone({ error: e });
          else onError?.(e);
        });
      },
    );
    return () => {
      live = false;
    };
    // `load` and `onError` are module-level or stable by the callers' contract.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, loaded]);
  if (gone) throw gone.error;
  return loaded;
}
