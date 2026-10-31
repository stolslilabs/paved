import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { LEGACY_SW_KEY, clearLegacyServiceWorkers, type LegacySwDeps } from "../src/lib/legacy-sw";

// The web client is not a PWA (#589): no PWA plugin, no workbox, no standalone display, and no service worker but one: a mock
// build's offline worker (#927, `vite/offline-worker.ts`), registered by `lib/offline-worker.ts` on the mock alone, so that the
// client runs with the network cut after the first load. vitest runs in the package.
const ROOT = join(import.meta.dirname, "..");
const WORKER_FILE = /^(sw|service-worker|registerSW)\.js$|^workbox-.*\.js$|\.webmanifest$/;

function files(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true, recursive: true }).filter((e) => e.isFile()).map((e) => e.name);
}

describe("no service worker", () => {
  it("has no PWA plugin or workbox in the package or its Vite config", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as Record<string, Record<string, string> | undefined>;
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.optionalDependencies });
    expect(deps.filter((d) => /pwa|workbox|service-?worker/i.test(d))).toEqual([]);
    expect(readFileSync(join(ROOT, "vite.config.ts"), "utf8")).not.toMatch(/pwa|workbox/i);
  });

  it("ships no worker file in public/, and in a build only the mock's offline worker", () => {
    expect(files(join(ROOT, "public")).filter((f) => WORKER_FILE.test(f) && f !== "site.webmanifest")).toEqual([]);
    const built = files(join(ROOT, "dist")).filter((f) => WORKER_FILE.test(f) && f !== "site.webmanifest");
    expect(built.filter((f) => !(f === "sw.js" && readFileSync(join(ROOT, "dist", f), "utf8").startsWith("// Paved's offline worker, mock build")))).toEqual([]);
  });

  it("registers no service worker in its code but the mock's offline worker, from main.tsx on the mock alone", () => {
    const sources = readdirSync(join(ROOT, "src"), { recursive: true, encoding: "utf8" }).filter((f) => /\.tsx?$/.test(f));
    const registering = sources.filter((f) => /serviceWorker\s*\.\s*register\s*\(|virtual:pwa/.test(readFileSync(join(ROOT, "src", f), "utf8")));
    expect(registering.map((f) => f.split("\\").join("/"))).toEqual(["lib/offline-worker.ts"]);
    expect(readFileSync(join(ROOT, "src/main.tsx"), "utf8")).toMatch(/if \(MOCKED && import\.meta\.env\.PROD\)\s+void import\("\.\/lib\/offline-worker"\)/);
  });

  it("keeps the manifest's name and icons, without the standalone display", () => {
    const manifest = JSON.parse(readFileSync(join(ROOT, "public/site.webmanifest"), "utf8")) as Record<string, unknown>;
    expect(manifest.display).toBeUndefined();
    expect(manifest.name).toBe("Paved");
    expect(manifest.icons).toHaveLength(3);
  });
});

describe("clearLegacyServiceWorkers", () => {
  function fakes() {
    const store = new Map<string, string>();
    const unregister = vi.fn(async () => true);
    const remove = vi.fn(async () => true);
    const log = vi.fn();
    const deps: LegacySwDeps = {
      serviceWorker: { getRegistrations: async () => [{ unregister }, { unregister }] as unknown as ServiceWorkerRegistration[] },
      caches: { keys: async () => ["workbox-precache-v2", "pages"], delete: remove },
      storage: () => ({ getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) }),
      log,
    };
    return { deps, store, unregister, remove, log };
  }

  it("removes every registration and cache once per browser, and says so once", async () => {
    const f = fakes();
    expect(await clearLegacyServiceWorkers(f.deps)).toBe(true);
    expect(f.unregister).toHaveBeenCalledTimes(2);
    expect(f.remove.mock.calls).toEqual([["workbox-precache-v2"], ["pages"]]);
    expect(f.log).toHaveBeenCalledWith("Paved: removed 2 service worker(s) and 2 cache(s) of the previous client.");
    expect(f.store.has(LEGACY_SW_KEY)).toBe(true);
    expect(await clearLegacyServiceWorkers(f.deps)).toBe(false);
    expect(f.unregister).toHaveBeenCalledTimes(2);
    expect(f.log).toHaveBeenCalledTimes(1);
  });

  it("runs in a browser without the service worker or Cache Storage APIs", async () => {
    const f = fakes();
    expect(await clearLegacyServiceWorkers({ ...f.deps, serviceWorker: undefined, caches: undefined })).toBe(true);
    expect(f.log).toHaveBeenCalledWith("Paved: removed 0 service worker(s) and 0 cache(s) of the previous client.");
  });
});
