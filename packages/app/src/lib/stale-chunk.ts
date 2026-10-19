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

/** How long the host is asked before the failure is shown as it is: a stalled request never holds the page. */
export const PROBE_TIMEOUT_MS = 5_000;

/**
 * What a failed load turned out to be: `reloading` (a stale build, the page is being reloaded), `gone` (the file is gone
 * but the reload was made already: the error page with its Reload action) or `other` (not a chunk, a file the host still
 * serves, an unreachable or silent host: the caller's own error, with which a new try may work).
 */
export type StaleOutcome = "reloading" | "gone" | "other";

/** The asks in flight, by asset: the calls made while one runs share it, and a stalled one holds no other. */
const pending = new Map<string, Promise<StaleOutcome>>();
let reloading = false;

async function ask(probe: string, deps: StaleChunkDeps): Promise<StaleOutcome> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), PROBE_TIMEOUT_MS);
  try {
    const { status } = await deps.fetch(probe, { method: "HEAD", cache: "no-store", signal: abort.signal });
    if (status !== 404 && status !== 410) return reloading ? "reloading" : "other";
  } catch {
    return reloading ? "reloading" : "other";
  } finally {
    clearTimeout(timer);
  }
  const store = deps.storage();
  const key = STALE_RELOAD_KEY + probe;
  try {
    if (reloading) return "reloading";
    if (!store || store.getItem(key) || deps.now() - Number(store.getItem(LAST_KEY) ?? 0) < RELOAD_GAP_MS) return "gone";
    store.setItem(key, String(deps.now()));
    store.setItem(LAST_KEY, String(deps.now()));
  } catch {
    return "gone";
  }
  reloading = true;
  deps.reload();
  return "reloading";
}

/**
 * Reloads the page when `error` is a chunk of a build the host no longer serves (it answers 404 or 410 within
 * `PROBE_TIMEOUT_MS`), once per asset and tab, and never twice within 30 s: the keys in `sessionStorage` make a second
 * failure resolve `gone`, so a real outage never loops.
 */
export function recoverStaleChunk(error: unknown, deps: StaleChunkDeps = browserDeps): Promise<StaleOutcome> {
  if (!isChunkLoadError(error)) return Promise.resolve("other");
  if (reloading) return Promise.resolve("reloading");
  const probe = probeOf(error, deps);
  if (!probe) return Promise.resolve("other");
  let asked = pending.get(probe);
  if (!asked) {
    asked = ask(probe, deps).finally(() => pending.delete(probe));
    pending.set(probe, asked);
  }
  return asked;
}

/** Forgets the asks in flight and a reload made: for the tests, which reload more than once in a page. */
export function resetStaleChunkForTests(): void {
  pending.clear();
  reloading = false;
  goneChunk = null;
}

/**
 * A chunk still gone after the reload made for it, which its caller kept to itself (the renderer's chunks degrade with a
 * warning, a prefetch drops its failure): `StaleChunkGate` throws it into the route, whose `RouteError` offers the Reload.
 */
let goneChunk: { error: unknown } | null = null;
const goneListeners = new Set<() => void>();

export function goneChunkError(): { error: unknown } | null {
  return goneChunk;
}

export function subscribeGoneChunk(listener: () => void): () => void {
  goneListeners.add(listener);
  return () => goneListeners.delete(listener);
}

function setGoneChunk(next: { error: unknown } | null): void {
  if (goneChunk === next) return;
  goneChunk = next;
  for (const listener of goneListeners) listener();
}

/** Forgets the gone chunk once `RouteError` shows it, so Back home does not throw it again. */
export function clearGoneChunk(): void {
  setGoneChunk(null);
}

/**
 * Vite's event for a failed dynamic import (every chunk of the app and the renderer goes through it): a stale build reloads
 * from there, a prefetch's failure included. The error still reaches its caller; a `gone` file is also handed to
 * `StaleChunkGate`, for the callers that keep their failure to themselves (#589).
 */
export function listenForStaleChunks(target: Window = window, deps: StaleChunkDeps = browserDeps): void {
  target.addEventListener("vite:preloadError", (event) => {
    const error = (event as Event & { payload?: unknown }).payload;
    void recoverStaleChunk(error, deps).then((outcome) => outcome === "gone" && setGoneChunk({ error }));
  });
}
