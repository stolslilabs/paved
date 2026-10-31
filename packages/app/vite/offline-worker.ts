/**
 * The offline worker of a mock build (#927): with the network cut after the first load, the client runs on (the browser
 * offline). The mock's data is the device's; its files are the build's, so a service worker keeps them: `sw.js`, written at
 * the root of the output once the build is complete, with the list of its files. `src/lib/offline-worker.ts` registers it,
 * on the mock only (a `chain` build has no service worker, `lib/legacy-sw.ts`).
 *
 * - **At install**, the files a page needs to run (`core`: the HTML, the scripts, the styles, the fonts, Font Awesome, the
 *   sound effects): a few MB. The worker then takes the open tab at once, so a chunk asked for later comes from it.
 * - **Once active**, the rest (`rest`: the renderer's models, renders and tiles, the backgrounds, the music's art), one file at
 *   a time, a failure skipped.
 * - **Never**: the source maps and the music (86 MB; its tracks stay on the network, offline the music is silent).
 *
 * A request for one of the build's files is answered from the cache, else the network (and kept); a navigation from the
 * network, else the cached `index.html` (the SPA's fallback, as `vercel.json` rewrites). A new build is a new worker (its
 * version is its list's hash): it caches anew and deletes the old build's cache. Nothing is asked outside the app's origin.
 *
 * Node 24 runs it as is (type stripping): the syntax stays erasable.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { Plugin, ResolvedConfig } from "vite";

/** The worker's file, at the output's root: its scope is the whole origin. */
export const WORKER_FILE = "sw.js";
/** The prefix of the worker's caches: a cache of this name and another version is an old build's, deleted at activation. */
export const CACHE_PREFIX = "paved-mock-";

/** Never cached: the source maps, the music's tracks, the worker itself. */
const SKIP = (path: string) => path.endsWith(".map") || path.startsWith("music/") || path === WORKER_FILE;
/** Cached once the worker is active, not before: the renderer's assets and the large images. */
const LATER = (path: string) => /^(renderer-assets|backgrounds|music-art)\//.test(path);

/** The build's files (paths relative to the output, `/`-separated) split into what the worker caches at install and after. */
export function precacheLists(files: readonly string[]): { core: string[]; rest: string[] } {
  const kept = files.filter((f) => !SKIP(f)).sort();
  return { core: kept.filter((f) => !LATER(f)), rest: kept.filter(LATER) };
}

/** The version of a build's worker: the hash of its lists and of its `index.html`. */
export function workerVersion(lists: { core: string[]; rest: string[] }, indexHtml: string): string {
  return createHash("sha256").update(JSON.stringify(lists)).update(indexHtml).digest("hex").slice(0, 16);
}

/** The worker's source for `lists`, of `version`. */
export function workerSource(lists: { core: string[]; rest: string[] }, version: string): string {
  const url = (f: string) => `/${f}`;
  return `// Paved's offline worker, mock build ${version} (packages/app/vite/offline-worker.ts). Generated: do not edit.
const CACHE = ${JSON.stringify(CACHE_PREFIX + version)};
const CORE = ${JSON.stringify(lists.core.map(url))};
const REST = ${JSON.stringify(lists.rest.map(url))};
const FILES = new Set([...CORE, ...REST]);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key.startsWith(${JSON.stringify(CACHE_PREFIX)}) && key !== CACHE) await caches.delete(key);
      await self.clients.claim();
      const cache = await caches.open(CACHE);
      for (const file of REST) if (!(await cache.match(file))) await cache.add(file).catch(() => undefined);
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || request.headers.has("range")) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(async () => (await caches.match("/index.html", { cacheName: CACHE })) ?? Response.error()));
    return;
  }
  if (!FILES.has(url.pathname)) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(url.pathname);
      if (hit) return hit;
      const response = await fetch(request);
      if (response.ok) await cache.put(url.pathname, response.clone()).catch(() => undefined);
      return response;
    })(),
  );
});
`;
}

/** Every file under `dir`, relative to it, `/`-separated. */
function filesOf(dir: string): string[] {
  const out: string[] = [];
  const walk = (at: string) => {
    for (const name of readdirSync(at)) {
      const path = join(at, name);
      if (statSync(path).isDirectory()) walk(path);
      else out.push(relative(dir, path).split(sep).join("/"));
    }
  };
  walk(dir);
  return out;
}

/** Writes `sw.js` into the output of a build, once every file of it is there. Named, so the Storybook leaves it out. */
export function offlineWorker(): Plugin {
  let config: ResolvedConfig;
  return {
    name: "paved:mock-offline-worker",
    apply: "build",
    configResolved(resolved) {
      config = resolved;
    },
    closeBundle() {
      const outDir = config.build.outDir.startsWith("/") ? config.build.outDir : join(config.root, config.build.outDir);
      const lists = precacheLists(filesOf(outDir));
      const version = workerVersion(lists, readFileSync(join(outDir, "index.html"), "utf8"));
      writeFileSync(join(outDir, WORKER_FILE), workerSource(lists, version));
    },
  };
}
