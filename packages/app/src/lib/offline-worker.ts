/**
 * The offline worker of a mock build (#927, `vite/offline-worker.ts`): registered once the previous client's workers are
 * cleared (`legacy-sw.ts` removes every registration of the origin, once per browser), so it is never the one removed. It
 * keeps the build's files, and the client runs with the network cut after the first load. A `chain` build registers none.
 */

export const WORKER_URL = "/sw.js";

export interface OfflineWorkerDeps {
  serviceWorker?: Pick<ServiceWorkerContainer, "register">;
  /** The legacy clearing, awaited first. */
  clearLegacy: () => Promise<unknown>;
}

/** Clears the legacy workers, then registers the offline worker on the whole origin. Resolves false where there is none. */
export async function registerOfflineWorker(deps: OfflineWorkerDeps): Promise<boolean> {
  await deps.clearLegacy().catch(() => undefined);
  if (!deps.serviceWorker) return false;
  try {
    await deps.serviceWorker.register(WORKER_URL, { scope: "/" });
    return true;
  } catch {
    return false;
  }
}
