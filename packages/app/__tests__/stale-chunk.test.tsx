import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { Outlet, RouterProvider, createMemoryRouter } from "react-router";
import { RouteError } from "../src/routes/RouteError";
import { useDeferred } from "../src/lib/deferred";
import { StaleChunkGate } from "../src/routes/stale-chunk-gate";
import { PROBE_TIMEOUT_MS, STALE_RELOAD_KEY, isChunkLoadError, listenForStaleChunks, recoverStaleChunk, resetStaleChunkForTests, type StaleChunkDeps } from "../src/lib/stale-chunk";

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

describe("recoverStaleChunk", () => {
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
    expect(await recoverStaleChunk(chromium(asset("over-R2jaf3I2.js?retry=1")), f.deps)).toBe("reloading");
    expect(f.asked).toEqual([asset("over-R2jaf3I2.js")]);
    expect(f.store.has(STALE_RELOAD_KEY + asset("over-R2jaf3I2.js"))).toBe(true);
    expect(f.reload).toHaveBeenCalledTimes(1);
    resetStaleChunkForTests(); // The reload: a new page, the same tab's sessionStorage.
    f.clock.now += 3_600_000;
    expect(await recoverStaleChunk(chromium(asset("over-R2jaf3I2.js")), f.deps)).toBe("gone");
    expect(f.reload).toHaveBeenCalledTimes(1);
  });

  it("does not reload again within 30 s, when the new build's chunk is missing too (an outage), and does after", async () => {
    const f = fakes(404);
    expect(await recoverStaleChunk(chromium(asset("over-OLD.js")), f.deps)).toBe("reloading");
    resetStaleChunkForTests();
    f.clock.now += 5_000;
    expect(await recoverStaleChunk(chromium(asset("over-NEW.js")), f.deps)).toBe("gone");
    expect(f.reload).toHaveBeenCalledTimes(1);
    resetStaleChunkForTests();
    f.clock.now += 3_600_000; // The next deployment, an hour later.
    expect(await recoverStaleChunk(chromium(asset("over-NEW.js")), f.deps)).toBe("reloading");
    expect(f.reload).toHaveBeenCalledTimes(2);
  });

  it("does not reload for a chunk the host still serves, an unreachable host or another error", async () => {
    for (const status of [200, 500, "offline"] as const) {
      const f = fakes(status);
      expect(await recoverStaleChunk(chromium(asset("over-R2jaf3I2.js")), f.deps)).toBe("other");
      expect(f.reload).not.toHaveBeenCalled();
      expect(f.store.size).toBe(0);
    }
    const f = fakes(404);
    expect(await recoverStaleChunk(new Error("Game 4 not found"), f.deps)).toBe("other");
    expect(f.asked).toEqual([]);
  });

  it("asks for the build's entry when the error names no asset of this origin (Safari)", async () => {
    const f = fakes(404);
    expect(await recoverStaleChunk(new TypeError("Importing a module script failed."), f.deps)).toBe("reloading");
    expect(f.asked).toEqual([asset("index-OLD.js")]);
    resetStaleChunkForTests();
    const other = fakes(200);
    expect(await recoverStaleChunk(chromium("https://elsewhere.example/assets/x.js"), other.deps)).toBe("other");
    expect(other.asked).toEqual([asset("index-OLD.js")]);
  });

  it("never reloads without a sessionStorage to guard it: the file is gone, the error page offers the Reload", async () => {
    const f = fakes(404);
    expect(await recoverStaleChunk(chromium(asset("over-x.js")), { ...f.deps, storage: () => null })).toBe("gone");
    expect(f.reload).not.toHaveBeenCalled();
  });

  it("shares one check between the calls made while it runs (Vite's event and the error page)", async () => {
    const f = fakes(404);
    const [a, b] = await Promise.all([recoverStaleChunk(chromium(asset("over-x.js")), f.deps), recoverStaleChunk(chromium(asset("over-x.js")), f.deps)]);
    expect([a, b]).toEqual(["reloading", "reloading"]);
    expect(f.reload).toHaveBeenCalledTimes(1);
    expect(f.asked).toHaveLength(1);
  });

  it("gives up on a host that does not answer within PROBE_TIMEOUT_MS, and a stalled ask holds no other file's", async () => {
    vi.useFakeTimers();
    try {
      const f = fakes(404);
      const signals: AbortSignal[] = [];
      const stalled: StaleChunkDeps = {
        ...f.deps,
        fetch: (url, init) => {
          if (url.endsWith("over-x.js")) return new Promise((_, reject) => (signals.push(init.signal!), init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))));
          return f.deps.fetch(url, init);
        },
      };
      const over = recoverStaleChunk(chromium(asset("over-x.js")), stalled);
      expect(await recoverStaleChunk(chromium(asset("balances-x.js")), stalled)).toBe("reloading");
      await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS);
      expect(signals[0]!.aborted).toBe(true);
      expect(await over).toBe("reloading"); // The page is being reloaded already, for the other file.
      resetStaleChunkForTests();
      const late = recoverStaleChunk(chromium(asset("over-x.js")), stalled);
      await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS);
      expect(await late).toBe("other");
    } finally {
      vi.useRealTimers();
    }
  });

  it("listens to Vite's preload error", async () => {
    const fetch = vi.fn(async () => ({ status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const target = new EventTarget() as Window;
    listenForStaleChunks(target);
    const event = Object.assign(new Event("vite:preloadError", { cancelable: true }), { payload: chromium(asset("balances-x.js")) });
    target.dispatchEvent(event);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledWith(asset("balances-x.js"), expect.objectContaining({ method: "HEAD", cache: "no-store" })));
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

  it("shows the error with Reload when the chunk is still gone after the reload made for it", async () => {
    const fetch = vi.fn(async () => ({ status: 404 }));
    vi.stubGlobal("fetch", fetch);
    sessionStorage.setItem(STALE_RELOAD_KEY + asset("over-R2jaf3I2.js"), "1");
    show(chromium(asset("over-R2jaf3I2.js")));
    expect(await screen.findByRole("button", { name: "Reload" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back home" })).toBeTruthy();
  });

  it("shows the error and its actions when the host does not answer, after PROBE_TIMEOUT_MS at most", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const fetch = vi.fn((_url: string, init: RequestInit) => new Promise((_, reject) => init.signal!.addEventListener("abort", () => reject(new Error("aborted")))));
      vi.stubGlobal("fetch", fetch);
      show(chromium(asset("over-R2jaf3I2.js")));
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
      expect(screen.queryByTestId("route-error")).toBeNull();
      await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS);
      expect(await screen.findByRole("button", { name: "Reload" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Back home" })).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the other errors as they were: no Reload", async () => {
    show(new Error("Game 4 not found"));
    expect(await screen.findByText("Game 4 not found")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reload" })).toBeNull();
  });
});

describe("useDeferred, a chunk loaded on demand (the Surrender dialog, the final board)", () => {
  function Deferred({ onError }: { onError: (e: unknown) => void }) {
    const loaded = useDeferred<string>(() => Promise.reject(chromium(asset("surrender-dialog-x.js"))), true, onError);
    return <p>{loaded ?? "waiting"}</p>;
  }
  const show = (onError: (e: unknown) => void) =>
    render(<RouterProvider router={createMemoryRouter([{ path: "/", element: <Deferred onError={onError} />, errorElement: <RouteError /> }])} />);

  it("shows the route's error page with Reload when the file is still gone after the reload made for it", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 404 })));
    sessionStorage.setItem(STALE_RELOAD_KEY + asset("surrender-dialog-x.js"), "1");
    const onError = vi.fn();
    show(onError);
    expect(await screen.findByRole("button", { name: "Reload" })).toBeTruthy();
    expect(screen.getByTestId("route-error").textContent).toContain("surrender-dialog-x.js");
    expect(onError).not.toHaveBeenCalled();
  });

  it("leaves a file the host still serves to the caller's own error (a new try may work)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 200 })));
    const onError = vi.fn();
    show(onError);
    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());
    expect(screen.queryByTestId("route-error")).toBeNull();
    expect(screen.getByText("waiting")).toBeTruthy();
  });
});

describe("StaleChunkGate, a chunk whose caller keeps its failure (the renderer's, a prefetch)", () => {
  it("shows the route's error page with Reload when the chunk is still gone after its reload, and Back home clears it", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 404 })));
    sessionStorage.setItem(STALE_RELOAD_KEY + asset("ambient-particles-x.js"), "1");
    const f = fakes(404);
    f.store.set(STALE_RELOAD_KEY + asset("ambient-particles-x.js"), "1");
    const target = new EventTarget() as Window;
    listenForStaleChunks(target, f.deps);
    const Layout = () => (
      <>
        <StaleChunkGate />
        <Outlet />
      </>
    );
    const router = createMemoryRouter([
      { path: "/", element: <Layout />, errorElement: <RouteError />, children: [{ index: true, element: <p>board</p> }, { path: "home", element: <p>home</p> }] },
    ]);
    render(<RouterProvider router={router} />);
    expect(await screen.findByText("board")).toBeTruthy();
    const event = Object.assign(new Event("vite:preloadError"), { payload: chromium(asset("ambient-particles-x.js")) });
    act(() => void target.dispatchEvent(event));
    expect(await screen.findByRole("button", { name: "Reload" })).toBeTruthy();
    expect(screen.getByTestId("route-error").textContent).toContain("ambient-particles-x.js");
    expect(f.reload).not.toHaveBeenCalled();
    await act(() => router.navigate("/home"));
    expect(await screen.findByText("home")).toBeTruthy();
  });

  it("leaves a chunk the host still serves to its caller", async () => {
    const f = fakes(200);
    const target = new EventTarget() as Window;
    listenForStaleChunks(target, f.deps);
    render(<RouterProvider router={createMemoryRouter([{ path: "/", element: <><StaleChunkGate /><p>board</p></>, errorElement: <RouteError /> }])} />);
    target.dispatchEvent(Object.assign(new Event("vite:preloadError"), { payload: chromium(asset("daynight-x.js")) }));
    await vi.waitFor(() => expect(f.asked).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId("route-error")).toBeNull();
    expect(screen.getByText("board")).toBeTruthy();
  });
});
