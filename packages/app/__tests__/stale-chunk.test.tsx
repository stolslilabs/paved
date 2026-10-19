import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router";
import { RouteError } from "../src/routes/RouteError";
import { STALE_RELOAD_KEY, isChunkLoadError, listenForStaleChunks, reloadOnStaleChunk, resetStaleChunkForTests, type StaleChunkDeps } from "../src/lib/stale-chunk";

// A tab opened before a deployment asks for chunks the host no longer serves (#589): it reloads once, never in a loop.
const asset = (name: string) => `${window.location.origin}/assets/${name}`;
const chromium = (url: string) => new TypeError(`Failed to fetch dynamically imported module: ${url}`);

function fakes(status: number | "offline", entry: string | null = asset("index-OLD.js")) {
  const store = new Map<string, string>();
  const clock = { now: 1_000_000 };
  const asked: string[] = [];
  const reload = vi.fn();
  const deps: StaleChunkDeps = {
    fetch: async (url) => {
      asked.push(url);
      if (status === "offline") throw new TypeError("Failed to fetch");
      return { status };
    },
    storage: () => ({ getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) }),
    reload,
    now: () => clock.now,
    entry: () => entry,
  };
  return { deps, store, asked, reload, clock };
}

beforeEach(() => {
  resetStaleChunkForTests();
  sessionStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe("reloadOnStaleChunk", () => {
  it("tells a failed module from any other error", () => {
    expect(isChunkLoadError(chromium(asset("over-R2jaf3I2.js")))).toBe(true);
    expect(isChunkLoadError(new TypeError("error loading dynamically imported module: x"))).toBe(true);
    expect(isChunkLoadError(new TypeError("Importing a module script failed."))).toBe(true);
    expect(isChunkLoadError(new Error("Unable to preload CSS for /assets/over-x.css"))).toBe(true);
    expect(isChunkLoadError(new Error("Game 4 not found"))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });

  it("reloads once when the failed chunk answers 404, and shows the error at its second failure", async () => {
    const f = fakes(404);
    // The retry of `reimport` names the same file under a query: one key for both.
    expect(await reloadOnStaleChunk(chromium(asset("over-R2jaf3I2.js?retry=1")), f.deps)).toBe(true);
    expect(f.asked).toEqual([asset("over-R2jaf3I2.js")]);
    expect(f.store.has(STALE_RELOAD_KEY + asset("over-R2jaf3I2.js"))).toBe(true);
    expect(f.reload).toHaveBeenCalledTimes(1);
    resetStaleChunkForTests(); // The reload: a new page, the same tab's sessionStorage.
    expect(await reloadOnStaleChunk(chromium(asset("over-R2jaf3I2.js")), f.deps)).toBe(false);
    expect(f.asked).toHaveLength(1);
    expect(f.reload).toHaveBeenCalledTimes(1);
  });

  it("does not reload again within 30 s, when the new build's chunk is missing too (an outage), and does after", async () => {
    const f = fakes(404);
    expect(await reloadOnStaleChunk(chromium(asset("over-OLD.js")), f.deps)).toBe(true);
    resetStaleChunkForTests();
    f.clock.now += 5_000;
    expect(await reloadOnStaleChunk(chromium(asset("over-NEW.js")), f.deps)).toBe(false);
    expect(f.reload).toHaveBeenCalledTimes(1);
    resetStaleChunkForTests();
    f.clock.now += 3_600_000; // The next deployment, an hour later.
    expect(await reloadOnStaleChunk(chromium(asset("over-NEW.js")), f.deps)).toBe(true);
    expect(f.reload).toHaveBeenCalledTimes(2);
  });

  it("does not reload for a chunk the host still serves, an unreachable host or another error", async () => {
    for (const status of [200, 500, "offline"] as const) {
      const f = fakes(status);
      expect(await reloadOnStaleChunk(chromium(asset("over-R2jaf3I2.js")), f.deps)).toBe(false);
      expect(f.reload).not.toHaveBeenCalled();
      expect(f.store.size).toBe(0);
    }
    const f = fakes(404);
    expect(await reloadOnStaleChunk(new Error("Game 4 not found"), f.deps)).toBe(false);
    expect(f.asked).toEqual([]);
  });

  it("asks for the build's entry when the error names no asset of this origin (Safari)", async () => {
    const f = fakes(404);
    expect(await reloadOnStaleChunk(new TypeError("Importing a module script failed."), f.deps)).toBe(true);
    expect(f.asked).toEqual([asset("index-OLD.js")]);
    resetStaleChunkForTests();
    const other = fakes(200);
    expect(await reloadOnStaleChunk(chromium("https://elsewhere.example/assets/x.js"), other.deps)).toBe(false);
    expect(other.asked).toEqual([asset("index-OLD.js")]);
  });

  it("never reloads without a sessionStorage to guard it", async () => {
    const f = fakes(404);
    expect(await reloadOnStaleChunk(chromium(asset("over-x.js")), { ...f.deps, storage: () => null })).toBe(false);
    expect(f.reload).not.toHaveBeenCalled();
  });

  it("shares one check between the calls made while it runs (Vite's event and the error page)", async () => {
    const f = fakes(404);
    const [a, b] = await Promise.all([reloadOnStaleChunk(chromium(asset("over-x.js")), f.deps), reloadOnStaleChunk(chromium(asset("over-x.js")), f.deps)]);
    expect([a, b]).toEqual([true, true]);
    expect(f.reload).toHaveBeenCalledTimes(1);
  });

  it("listens to Vite's preload error", async () => {
    const fetch = vi.fn(async () => ({ status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const target = new EventTarget() as Window;
    listenForStaleChunks(target);
    const event = Object.assign(new Event("vite:preloadError", { cancelable: true }), { payload: chromium(asset("balances-x.js")) });
    target.dispatchEvent(event);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledWith(asset("balances-x.js"), { method: "HEAD", cache: "no-store" }));
    // The import still rejects to its caller.
    expect(event.defaultPrevented).toBe(false);
  });
});

describe("RouteError", () => {
  const show = (error: unknown) =>
    render(
      <RouterProvider
        router={createMemoryRouter([
          {
            path: "/",
            loader: () => {
              throw error;
            },
            errorElement: <RouteError />,
          },
        ])}
      />,
    );

  it("shows the error with a Reload action once the chunk is found still served (or already reloaded for)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 200 })));
    show(chromium(asset("over-R2jaf3I2.js")));
    expect(await screen.findByTestId("route-error")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back home" })).toBeTruthy();
  });

  it("shows the error at once, after the reload made for the same chunk", async () => {
    const fetch = vi.fn(async () => ({ status: 404 }));
    vi.stubGlobal("fetch", fetch);
    sessionStorage.setItem(STALE_RELOAD_KEY + asset("over-R2jaf3I2.js"), "1");
    show(chromium(asset("over-R2jaf3I2.js")));
    expect(await screen.findByRole("button", { name: "Reload" })).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps the other errors as they were: no Reload", async () => {
    show(new Error("Game 4 not found"));
    expect(await screen.findByText("Game 4 not found")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reload" })).toBeNull();
  });
});
