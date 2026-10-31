import { describe, expect, it, vi } from "vitest";
import { registerOfflineWorker, WORKER_URL } from "../src/lib/offline-worker";
import viteConfig from "../vite.config";
import { CACHE_PREFIX, offlineWorker, precacheLists, workerSource, workerVersion } from "../vite/offline-worker";

// The offline worker of a mock build (#927): with the network cut after the first load, the build's files come from it.

const FILES = ["index.html", "assets/index-a1.js", "assets/index-a1.js.map", "assets/new-player-b2.js", "assets/index-c3.css", "sfx/tap.wav", "renderer-assets/models/m.glb", "backgrounds/b.webp", "music/00.m4a", "music-art/00.webp", "sw.js"];

/** A worker scope of `source`, on a cache and a network of the test's. */
function scope(source: string, network: (url: string) => Promise<Response>) {
  const listeners: Record<string, (event: unknown) => void> = {};
  const stores = new Map<string, Map<string, Response>>();
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      addAll: async (urls: string[]) => {
        for (const u of urls) store.set(u, await network(u));
      },
      add: async (u: string) => void store.set(u, await network(u)),
      match: async (u: string) => store.get(u)?.clone(),
      put: async (u: string, r: Response) => void store.set(u, r),
      delete: async (u: string) => store.delete(u),
    };
  };
  const caches = {
    open,
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
    match: async (u: string, { cacheName }: { cacheName?: string } = {}) => {
      for (const [name, store] of stores) if ((!cacheName || name === cacheName) && store.has(u)) return store.get(u)!.clone();
      return undefined;
    },
  };
  const claimed = vi.fn(async () => undefined);
  /** The browser's open tabs, by id. */
  const tabs: string[] = [];
  const self = {
    location: { origin: "https://app.test" },
    addEventListener: (type: string, f: (e: unknown) => void) => (listeners[type] = f),
    skipWaiting: vi.fn(async () => undefined),
    clients: { claim: claimed, matchAll: async () => tabs.map((id) => ({ id })) },
  };
  new Function("self", "caches", "fetch", source)(self, caches, (r: Request | string) => network(typeof r === "string" ? r : new URL(r.url).pathname));
  const run = async (type: string, event: object) => {
    let done: Promise<unknown> = Promise.resolve();
    let answer: Promise<Response> | undefined;
    listeners[type]!({ ...event, waitUntil: (p: Promise<unknown>) => (done = p), respondWith: (p: Promise<Response>) => (answer = p) });
    const response = await answer;
    await done;
    return response;
  };
  const request = (path: string, mode = "cors") => ({ request: { url: `https://app.test${path}`, method: "GET", mode, headers: new Headers() } });
  return { stores, claimed, self, run, request, tabs };
}

describe("the offline worker's lists (#927)", () => {
  it("caches the page's files at install, the renderer's and the large images after, never the maps, the music or itself", () => {
    expect(precacheLists(FILES)).toEqual({
      core: ["assets/index-a1.js", "assets/index-c3.css", "assets/new-player-b2.js", "index.html", "sfx/tap.wav"],
      rest: ["backgrounds/b.webp", "music-art/00.webp", "renderer-assets/models/m.glb"],
    });
  });

  it("is a new version for a new build", () => {
    const lists = precacheLists(FILES);
    expect(workerVersion(lists, "<html>a")).not.toBe(workerVersion(lists, "<html>b"));
    expect(workerVersion(lists, "<html>a")).toBe(workerVersion(precacheLists([...FILES].reverse()), "<html>a"));
  });

  it("names no other origin", () => {
    expect(workerSource(precacheLists(FILES), "v1")).not.toMatch(/https?:\/\//);
  });
});

describe("the offline worker (#927)", () => {
  const online = vi.fn(async (url: string) => new Response(`body of ${url}`));
  const offline = vi.fn(async (): Promise<Response> => {
    throw new TypeError("Failed to fetch");
  });

  it("caches the page's files at install, takes the tab once active, then caches the rest; an old build's cache with no tab left goes", async () => {
    let network: (url: string) => Promise<Response> = online;
    const w = scope(workerSource(precacheLists(FILES), "v2"), (u) => network(u));
    w.stores.set(`${CACHE_PREFIX}v1`, new Map());
    await w.run("install", {});
    expect([...w.stores.get(`${CACHE_PREFIX}v2`)!.keys()]).toEqual(["/assets/index-a1.js", "/assets/index-c3.css", "/assets/new-player-b2.js", "/index.html", "/sfx/tap.wav"]);
    expect(w.self.skipWaiting).toHaveBeenCalled();
    await w.run("activate", {});
    expect(w.claimed).toHaveBeenCalled();
    expect(w.stores.has(`${CACHE_PREFIX}v1`)).toBe(false);
    expect(w.stores.get(`${CACHE_PREFIX}v2`)!.has("/renderer-assets/models/m.glb")).toBe(true);

    // Offline: a chunk never loaded by the page, from the cache; a navigation, the cached index.html.
    network = offline;
    expect(await (await w.run("fetch", w.request("/assets/new-player-b2.js")))!.text()).toBe("body of /assets/new-player-b2.js");
    expect(await (await w.run("fetch", w.request("/game/1/over", "navigate")))!.text()).toBe("body of /index.html");
    // Not one of the build's files (the music), another origin: left to the browser.
    expect(await w.run("fetch", w.request("/music/00.m4a"))).toBeUndefined();
    expect(await w.run("fetch", { request: { url: "https://elsewhere.test/x.js", method: "GET", mode: "cors", headers: new Headers() } })).toBeUndefined();
  });
});

describe("an update of the offline worker (#927)", () => {
  const OLD = "/assets/lazy-page-z9.js";

  it("keeps the old build's cache for a tab that loaded it: its lazy chunk loads offline; once the tab closes, the cache goes", async () => {
    let network: (url: string) => Promise<Response> = async (url) => new Response(`v2 ${url}`);
    const w = scope(workerSource(precacheLists(FILES), "v2"), (u) => network(u));
    // The old build: its cache holds a lazy chunk the new build has not, and the renderer's manifest of its own.
    w.stores.set(`${CACHE_PREFIX}v1`, new Map([[OLD, new Response("v1 lazy page")], ["/assets/index-a1.js", new Response("v1 entry")]]));
    w.tabs.push("old-tab");
    await w.run("install", {});
    await w.run("activate", {});
    expect(w.claimed).toHaveBeenCalled();
    expect(w.stores.has(`${CACHE_PREFIX}v1`)).toBe(true);

    // Offline, the old tab asks for its lazy chunk: the old build's cache answers; a file of both builds is the new one's.
    network = async () => {
      throw new TypeError("Failed to fetch");
    };
    expect(await (await w.run("fetch", w.request(OLD)))!.text()).toBe("v1 lazy page");
    expect(await (await w.run("fetch", w.request("/assets/index-a1.js")))!.text()).toBe("v2 /assets/index-a1.js");

    // A new tab while the old one is open: the old cache stays. The old tab closed: the next navigation drops it.
    w.tabs.push("new-tab");
    await w.run("fetch", w.request("/", "navigate"));
    expect(w.stores.has(`${CACHE_PREFIX}v1`)).toBe(true);
    w.tabs.splice(w.tabs.indexOf("old-tab"), 1);
    await w.run("fetch", w.request("/", "navigate"));
    expect(w.stores.has(`${CACHE_PREFIX}v1`)).toBe(false);
    expect(w.stores.get(`${CACHE_PREFIX}v2`)!.has("/__paved-offline/held")).toBe(false);
  });

  it("drops the old cache once the tab that installed the update has reloaded: its own requests check again, every 10 s at most", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const w = scope(workerSource(precacheLists(FILES), "v2"), async (url) => new Response(url));
      w.stores.set(`${CACHE_PREFIX}v1`, new Map([[OLD, new Response("v1")]]));
      w.tabs.push("tab-b");
      await w.run("install", {});
      await w.run("activate", {});
      // Tab B reloads: during its navigation the old document is still there; once loaded, it is a new tab.
      await w.run("fetch", w.request("/", "navigate"));
      expect(w.stores.has(`${CACHE_PREFIX}v1`)).toBe(true);
      w.tabs.splice(0, 1, "tab-b-reloaded");
      await w.run("fetch", w.request("/assets/index-a1.js"));
      expect(w.stores.has(`${CACHE_PREFIX}v1`)).toBe(true);
      vi.setSystemTime(Date.now() + 11_000);
      await w.run("fetch", w.request("/assets/index-a1.js"));
      expect(w.stores.has(`${CACHE_PREFIX}v1`)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("holds every old build's cache through two updates while a tab of the first is open", async () => {
    const network = async (url: string) => new Response(url);
    const v2 = scope(workerSource(precacheLists(FILES), "v2"), network);
    v2.stores.set(`${CACHE_PREFIX}v1`, new Map([[OLD, new Response("v1")]]));
    v2.tabs.push("old-tab");
    await v2.run("install", {});
    await v2.run("activate", {});
    // v3 on the same caches and tabs.
    const v3 = scope(workerSource(precacheLists([...FILES, "assets/more-d4.js"]), "v3"), network);
    for (const [k, store] of v2.stores) v3.stores.set(k, store);
    v3.tabs.push("old-tab");
    await v3.run("install", {});
    await v3.run("activate", {});
    expect([...v3.stores.keys()].sort()).toEqual([`${CACHE_PREFIX}v1`, `${CACHE_PREFIX}v2`, `${CACHE_PREFIX}v3`]);
    v3.tabs.length = 0;
    await v3.run("fetch", v3.request("/", "navigate"));
    expect([...v3.stores.keys()]).toEqual([`${CACHE_PREFIX}v3`]);
  });
});

describe("the worker's registration (#927)", () => {
  it("clears the previous client's workers first, then registers on the whole origin", async () => {
    const order: string[] = [];
    const register = vi.fn(async () => void order.push("register"));
    const ok = await registerOfflineWorker({ serviceWorker: { register } as unknown as ServiceWorkerContainer, clearLegacy: async () => void order.push("clear") });
    expect(ok).toBe(true);
    expect(order).toEqual(["clear", "register"]);
    expect(register).toHaveBeenCalledWith(WORKER_URL, { scope: "/" });
  });

  it("registers nothing where the browser has no workers, and still clears", async () => {
    const clearLegacy = vi.fn(async () => undefined);
    expect(await registerOfflineWorker({ clearLegacy })).toBe(false);
    expect(clearLegacy).toHaveBeenCalled();
  });

  it("is written by a mock build only", () => {
    type Config = (env: { command: "build" | "serve"; mode: string }) => { plugins: unknown[] };
    const names = (network: string) => {
      const saved = process.env.VITE_NETWORK;
      process.env.VITE_NETWORK = network;
      try {
        return ((viteConfig as unknown as Config)({ command: "build", mode: "production" }).plugins.flat() as Array<{ name?: string } | null>).map((p) => p?.name);
      } finally {
        if (saved === undefined) delete process.env.VITE_NETWORK;
        else process.env.VITE_NETWORK = saved;
      }
    };
    expect(names("sepolia")).toContain(offlineWorker().name);
    expect(names("devnet")).not.toContain(offlineWorker().name);
  });
});
