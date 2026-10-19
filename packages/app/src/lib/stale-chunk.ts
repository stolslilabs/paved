import { failedModuleUrl } from "./reimport";

/**
 * A tab opened before a deployment asks for chunks of its own build, which the host no longer serves (#589): every hashed
 * file of `/assets/` is replaced at each deployment, and the old names answer 404. Such a tab is reloaded once, onto the
 * latest build (docs/client/v2-architecture.md, section 6.6). Nothing is saved first: a Training game is saved at each move
 * (`LocalSession`), and a Challenge placement is on chain or not.
 */

/** The key, in `sessionStorage`, of a reload already made for an asset: a second failure of it shows the error page. */
export const STALE_RELOAD_KEY = "paved:stale-reload:";
/** The time of the tab's last such reload: none follows it within `RELOAD_GAP_MS` (the new build failing too is an outage). */
const LAST_KEY = `${STALE_RELOAD_KEY}last`;
const RELOAD_GAP_MS = 30_000;

/** True for a module (or its CSS) that failed to load: Chromium, Firefox, Safari and Vite's preload. */
export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return /dynamically imported module|importing a module script failed|unable to preload css/i.test(message);
}

export interface StaleChunkDeps {
  fetch: (url: string, init: RequestInit) => Promise<{ status: number }>;
  storage: () => Pick<Storage, "getItem" | "setItem"> | null;
  reload: () => void;
  now: () => number;
  /** The running build's entry script: what is asked for when the error names no asset (Safari). */
  entry: () => string | null;
}

const browserDeps: StaleChunkDeps = {
  fetch: (url, init) => fetch(url, init),
  storage: () => {
    try {
      return window.sessionStorage;
    } catch {
      return null;
    }
  },
  reload: () => window.location.reload(),
  now: () => Date.now(),
  entry: () => document.querySelector<HTMLScriptElement>("script[type=module][src]")?.src ?? null,
};

/** The asset to ask the host for: the failed one when it is a file of this origin's `/assets/`, else the build's entry. */
function probeOf(error: unknown, deps: StaleChunkDeps): string | null {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const named = failedModuleUrl(error) ?? /preload CSS for\s+(\S+)/i.exec(message)?.[1];
  if (named) {
    try {
      const url = new URL(named, window.location.href);
      if (url.origin === window.location.origin && url.pathname.startsWith("/assets/")) return url.origin + url.pathname;
    } catch {
      // Not a URL: the entry is asked for.
    }
  }
  const entry = deps.entry();
  return entry ? new URL(entry, window.location.href).href : null;
}

let pending: Promise<boolean> | null = null;

/**
 * Reloads the page when `error` is a chunk of a build the host no longer serves (it answers 404 or 410), once per asset
 * and tab, and never twice within 30 s: the keys in `sessionStorage` make a second failure resolve false, so a real outage
 * never loops (an unreachable host, too, resolves false). True when the page is being reloaded. Calls made while one is asking share it.
 */
export function reloadOnStaleChunk(error: unknown, deps: StaleChunkDeps = browserDeps): Promise<boolean> {
  if (!isChunkLoadError(error)) return Promise.resolve(false);
  pending ??= (async () => {
    const probe = probeOf(error, deps);
    const store = deps.storage();
    if (!probe || !store) return false;
    const key = STALE_RELOAD_KEY + probe;
    try {
      if (store.getItem(key) || deps.now() - Number(store.getItem(LAST_KEY) ?? 0) < RELOAD_GAP_MS) return false;
      const { status } = await deps.fetch(probe, { method: "HEAD", cache: "no-store" });
      if (status !== 404 && status !== 410) return false;
      store.setItem(key, String(deps.now()));
      store.setItem(LAST_KEY, String(deps.now()));
    } catch {
      return false;
    }
    deps.reload();
    return true;
  })().then((reloading) => {
    if (!reloading) pending = null;
    return reloading;
  });
  return pending;
}

/** Forgets the call in flight: for the tests, which reload more than once in a page. */
export function resetStaleChunkForTests(): void {
  pending = null;
}

/** Vite's event for a failed dynamic import (every chunk of the app and the renderer goes through it); the error still reaches its caller. */
export function listenForStaleChunks(target: Window = window): void {
  target.addEventListener("vite:preloadError", (event) => void reloadOnStaleChunk((event as Event & { payload?: unknown }).payload));
}
