/**
 * The previous client (`app/`) registered a service worker with a precache (`vite-plugin-pwa`) on this origin, which can
 * serve an old build (#589). The web client is not a PWA and has no service worker: at startup, once per browser, every
 * registration of the origin is removed and every Cache Storage entry deleted. Kept for several releases.
 */

export const LEGACY_SW_KEY = "paved:legacy-sw-cleared";

export interface LegacySwDeps {
  serviceWorker?: Pick<ServiceWorkerContainer, "getRegistrations">;
  caches?: Pick<CacheStorage, "keys" | "delete">;
  storage: () => Pick<Storage, "getItem" | "setItem"> | null;
  log: (message: string) => void;
}

const browserDeps = (): LegacySwDeps => ({
  serviceWorker: typeof navigator !== "undefined" ? navigator.serviceWorker : undefined,
  caches: typeof caches !== "undefined" ? caches : undefined,
  storage: () => {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  },
  log: (message) => console.info(message),
});

/** Removes the old service workers and caches, unless done before in this browser. Resolves false when skipped. */
export async function clearLegacyServiceWorkers(deps: LegacySwDeps = browserDeps()): Promise<boolean> {
  const store = deps.storage();
  try {
    if (store?.getItem(LEGACY_SW_KEY)) return false;
    const registrations = (await deps.serviceWorker?.getRegistrations()) ?? [];
    const workers = (await Promise.all(registrations.map((r) => r.unregister()))).filter(Boolean).length;
    const keys = (await deps.caches?.keys()) ?? [];
    const cleared = (await Promise.all(keys.map((k) => deps.caches!.delete(k)))).filter(Boolean).length;
    store?.setItem(LEGACY_SW_KEY, String(Date.now()));
    deps.log(`Paved: removed ${workers} service worker(s) and ${cleared} cache(s) of the previous client.`);
    return true;
  } catch {
    return false;
  }
}
