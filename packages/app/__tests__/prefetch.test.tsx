import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The page loaders are the lazy `import()`s of the real pages: a counter stands in for each, so no page is evaluated.
const loads: string[] = [];
vi.mock("../src/routes/page-loaders", () => {
  const loader = (name: string) => () => {
    loads.push(name);
    return Promise.resolve({ default: () => null });
  };
  const board = loader("board");
  return {
    PAGE_LOADERS: {
      welcome: loader("welcome"),
      "": loader("home"),
      play: loader("play"),
      "play/challenge": loader("purchase"),
      cobbles: loader("cobbles"),
      "game/:gameId": board,
      training: board,
      "story/:campaign/:level": board,
      "missions/:day?": loader("quests"),
      vault: loader("vault"),
      settings: loader("settings"),
      "village/shop": loader("shop"),
      "village/chests": loader("chests"),
      "pvp/league": loader("league"),
    },
  };
});

const { loaderFor, prefetchAllowed, prefetchRoute, prefetchTabsWhenIdle, PrefetchOnIntent, resetPrefetchForTests, whenIdle } = await import("../src/routes/prefetch");

function setConnection(connection: unknown) {
  Object.defineProperty(navigator, "connection", { value: connection, configurable: true });
}

beforeEach(() => {
  loads.length = 0;
  resetPrefetchForTests();
  setConnection(undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete (navigator as { connection?: unknown }).connection;
});

describe("when a prefetch may run", () => {
  it("allows an unknown connection and a fast one", () => {
    expect(prefetchAllowed(undefined)).toBe(true);
    expect(prefetchAllowed({})).toBe(true);
    expect(prefetchAllowed({ effectiveType: "4g", saveData: false })).toBe(true);
    expect(prefetchAllowed({ effectiveType: "3g" })).toBe(true);
  });

  it("refuses save-data, 2G and slow 2G", () => {
    expect(prefetchAllowed({ saveData: true, effectiveType: "4g" })).toBe(false);
    expect(prefetchAllowed({ effectiveType: "2g" })).toBe(false);
    expect(prefetchAllowed({ effectiveType: "slow-2g" })).toBe(false);
  });

  it("reads the browser's connection by default", () => {
    setConnection({ saveData: true });
    expect(prefetchAllowed()).toBe(false);
    setConnection({ effectiveType: "4g" });
    expect(prefetchAllowed()).toBe(true);
  });
});

describe("prefetchRoute", () => {
  it("fetches the chunk of the page a path shows, with its query and params", () => {
    expect(prefetchRoute("/play/challenge?ref=0x1")).toBe(true);
    expect(prefetchRoute("/game/12")).toBe(true);
    expect(prefetchRoute("/missions/20000")).toBe(true);
    expect(loads).toEqual(["purchase", "board", "quests"]);
  });

  it("fetches a chunk once: the three boards share one", () => {
    prefetchRoute("/game/12");
    expect(prefetchRoute("/game/13")).toBe(false);
    expect(prefetchRoute("/training")).toBe(false);
    expect(loads).toEqual(["board"]);
  });

  it("matches the home route and not a prefix of another", () => {
    expect(loaderFor("/")).toBeDefined();
    expect(loaderFor("/vault/extra")).toBeUndefined();
    expect(loaderFor("/nowhere")).toBeUndefined();
  });

  it("fetches nothing on a save-data or 2G connection", () => {
    setConnection({ saveData: true });
    expect(prefetchRoute("/play/challenge")).toBe(false);
    setConnection({ effectiveType: "2g" });
    expect(prefetchRoute("/vault")).toBe(false);
    expect(loads).toEqual([]);
    setConnection({ effectiveType: "4g" });
    expect(prefetchRoute("/vault")).toBe(true);
  });
});

describe("the idle prefetch of the tab pages", () => {
  it("fetches the tab pages (the bar's and the header's, #763), one per idle slot, and nothing before the first slot", () => {
    vi.useFakeTimers();
    prefetchTabsWhenIdle();
    expect(loads).toEqual([]);
    vi.advanceTimersByTime(200);
    expect(loads).toEqual(["home"]);
    vi.advanceTimersByTime(200 * 7);
    expect(loads).toEqual(["home", "quests", "vault", "shop", "chests", "play", "league", "settings"]);
    vi.advanceTimersByTime(5000);
    expect(loads).toHaveLength(8);
  });

  it("stops when cancelled", () => {
    vi.useFakeTimers();
    const cancel = prefetchTabsWhenIdle();
    vi.advanceTimersByTime(200);
    cancel();
    vi.advanceTimersByTime(5000);
    expect(loads).toEqual(["home"]);
  });

  it("fetches nothing on a save-data connection", () => {
    vi.useFakeTimers();
    setConnection({ saveData: true });
    prefetchTabsWhenIdle();
    vi.advanceTimersByTime(5000);
    expect(loads).toEqual([]);
  });

  it("uses the browser's idle callback where there is one", () => {
    const request = vi.fn(() => 7);
    const cancel = vi.fn();
    vi.stubGlobal("requestIdleCallback", request);
    vi.stubGlobal("cancelIdleCallback", cancel);
    const stop = whenIdle(() => {});
    expect(request).toHaveBeenCalledOnce();
    stop();
    expect(cancel).toHaveBeenCalledWith(7);
  });
});

describe("PrefetchOnIntent", () => {
  it("fetches its routes when the pointer goes over it, once, and adds no box", () => {
    const { container } = render(
      <PrefetchOnIntent routes={["/play", "/play/challenge", "/game/9"]}>
        <button>Play</button>
      </PrefetchOnIntent>,
    );
    expect(loads).toEqual([]);
    fireEvent.pointerOver(screen.getByRole("button"));
    fireEvent.pointerOver(screen.getByRole("button"));
    expect(loads).toEqual(["play", "purchase", "board"]);
    expect(container.firstElementChild).toHaveClass("contents");
  });

  it("fetches when focus lands inside it", () => {
    render(
      <PrefetchOnIntent routes={["/play/challenge"]}>
        <button>Challenge</button>
      </PrefetchOnIntent>,
    );
    act(() => screen.getByRole("button").focus());
    expect(loads).toEqual(["purchase"]);
  });

  it("fetches nothing on a save-data connection", () => {
    setConnection({ saveData: true });
    render(
      <PrefetchOnIntent routes={["/play/challenge"]}>
        <button>Challenge</button>
      </PrefetchOnIntent>,
    );
    fireEvent.pointerOver(screen.getByRole("button"));
    act(() => screen.getByRole("button").focus());
    expect(loads).toEqual([]);
  });
});
