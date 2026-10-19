import { useSyncExternalStore } from "react";
import { goneChunkError, subscribeGoneChunk } from "../lib/stale-chunk";

/**
 * Throws a chunk still gone after its reload (#589) into the route, whose `RouteError` shows it with a Reload action: the
 * renderer's chunks (ambient particles, day and night, the voxel drop…) and the prefetches keep their failure to themselves.
 */
export function StaleChunkGate() {
  const gone = useSyncExternalStore(subscribeGoneChunk, goneChunkError, goneChunkError);
  if (gone) throw gone.error;
  return null;
}
