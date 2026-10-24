import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { AppNav } from "../src/components/containers/app-nav";
import { createTestRouter } from "../src/routes/router";
import { TAB_SWIPE_MARK, tabSwipe, tabSwipeWay } from "../src/routes/tab-swipe";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { fakeSources } from "./data-fakes";
import { fakeWallet } from "./wallet-fakes";
import { preloadPages } from "./route-helpers";

const html = document.documentElement;
const realMatchMedia = window.matchMedia;

/** The media queries that match: `below` for the widths under `desktop`, `reduced` for reduced motion. */
function media({ below = true, reduced = false } = {}) {
  window.matchMedia = ((query: string) =>
    ({
      matches: (below && query === "(width < 64rem)") || (reduced && query === "(prefers-reduced-motion: reduce)"),
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
}

/** `document.startViewTransition` (jsdom has none): runs the update and records the mark it saw. */
function viewTransitions() {
  const marks: (string | null)[] = [];
  const start = vi.fn((update: () => unknown) => {
    marks.push(html.getAttribute(TAB_SWIPE_MARK));
    const done = Promise.resolve().then(update).then(() => undefined);
    return { finished: done, ready: done, updateCallbackDone: done, skipTransition() {}, types: new Set() };
  });
  Object.assign(document, { startViewTransition: start });
  return { start, marks };
}

afterEach(() => {
  window.matchMedia = realMatchMedia;
  delete (document as { startViewTransition?: unknown }).startViewTransition;
  html.removeAttribute(TAB_SWIPE_MARK);
  vi.restoreAllMocks();
});

describe("tabSwipeWay", () => {
  it("follows the bar's order", () => {
    expect(tabSwipeWay("home", "quests")).toBe("next");
    expect(tabSwipeWay("home", "settings")).toBe("next");
    expect(tabSwipeWay("vault", "quests")).toBe("prev");
    expect(tabSwipeWay("settings", "home")).toBe("prev");
  });

  it("is none for Play, within one tab, and from a page of no tab", () => {
    expect(tabSwipeWay("home", "play")).toBeNull();
    expect(tabSwipeWay("play", "vault")).toBeNull();
    expect(tabSwipeWay("settings", "settings")).toBeNull();
    expect(tabSwipeWay(null, "home")).toBeNull();
  });
});

describe("tabSwipe", () => {
  it("below desktop, marks <html> with the way and asks for a view transition", () => {
    media();
    viewTransitions();
    expect(tabSwipe("home", "vault")).toEqual({ viewTransition: true });
    expect(html.getAttribute(TAB_SWIPE_MARK)).toBe("next");
    expect(tabSwipe("vault", "home")).toEqual({ viewTransition: true });
    expect(html.getAttribute(TAB_SWIPE_MARK)).toBe("prev");
  });

  it.each([
    ["from desktop", () => (media({ below: false }), viewTransitions())],
    ["under reduced motion", () => (media({ reduced: true }), viewTransitions())],
    ["without document.startViewTransition", () => media()],
  ])("changes the page at once %s", (_name, setUp) => {
    setUp();
    expect(tabSwipe("home", "vault")).toBeUndefined();
    expect(html.hasAttribute(TAB_SWIPE_MARK)).toBe(false);
  });

  it("changes the page at once for Play and within one tab", () => {
    media();
    viewTransitions();
    expect(tabSwipe("home", "play")).toBeUndefined();
    expect(tabSwipe("settings", "settings")).toBeUndefined();
    expect(html.hasAttribute(TAB_SWIPE_MARK)).toBe(false);
  });
});

describe("a pick in the bar", () => {
  preloadPages("home", "quests", "vault");
  beforeEach(() => {
    localStorage.clear();
    resetWelcomedForTests();
    markWelcomed();
  });
  afterEach(() => {
    localStorage.clear();
    resetWelcomedForTests();
  });

  const open = (path: string) => {
    const router = createTestRouter(path);
    render(<App router={router} sources={fakeSources().sources} connector={fakeWallet().load} />);
    return router;
  };

  it("below desktop, swipes the page with the mark on, and the mark is gone after", async () => {
    media();
    const { start, marks } = viewTransitions();
    const router = open("/vault");
    await screen.findByRole("heading", { level: 1, name: "Vault" });
    await userEvent.click(screen.getByRole("button", { name: "Missions" }));
    await screen.findByRole("heading", { level: 1, name: "Missions" });
    expect(router.state.location.pathname).toBe("/missions");
    expect(start).toHaveBeenCalledTimes(1);
    expect(marks).toEqual(["prev"]);
    await waitFor(() => expect(html.hasAttribute(TAB_SWIPE_MARK)).toBe(false));
  });

  it("from desktop, changes the page with no transition", async () => {
    media({ below: false });
    const { start } = viewTransitions();
    const router = open("/vault");
    await screen.findByRole("heading", { level: 1, name: "Vault" });
    await userEvent.click(screen.getByRole("button", { name: "Missions" }));
    await screen.findByRole("heading", { level: 1, name: "Missions" });
    expect(router.state.location.pathname).toBe("/missions");
    expect(start).not.toHaveBeenCalled();
    expect(html.hasAttribute(TAB_SWIPE_MARK)).toBe(false);
  });
});

describe("the bar", () => {
  const highlight = () => document.querySelector<HTMLElement>('[data-slot="app-nav-highlight"]')!;
  const label = (name: string) => screen.getByRole("button", { name }).querySelector<HTMLElement>('[data-slot="app-nav-label"]')!;
  /** The bars of the tests before are gone: none on screen, the next one starts still. */
  beforeEach(async () => {
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  });

  it("unfolds only the current item's label, and puts the highlight on its column", () => {
    render(<AppNav active="vault" />);
    expect(["Home", "Missions", "Vault", "Settings"].filter((name) => label(name).hasAttribute("data-open"))).toEqual(["Vault"]);
    expect(label("Vault").className).toContain("grid-rows-[1fr]");
    expect(label("Home").className).toContain("grid-rows-[0fr]");
    expect(highlight().dataset.column).toBe("3");
    expect(highlight().style.getPropertyValue("--nav-col")).toBe("3");
    // A first bar starts still: no starting style of another tab.
    expect(highlight().style.getPropertyValue("--nav-from")).toBe("3");
    expect(label("Vault").className).not.toContain("starting:");
  });

  it("has no highlight on Play", () => {
    render(<AppNav active="play" />);
    expect(highlight().className).toContain("opacity-0");
  });

  it("starts a new bar from the state the last one drew", () => {
    // A tab change: one bar unmounts as the next mounts, in the same commit.
    const { rerender } = render(<AppNav key="home" active="home" />);
    rerender(<AppNav key="settings" active="settings" />);
    expect(highlight().style.getPropertyValue("--nav-col")).toBe("4");
    expect(highlight().style.getPropertyValue("--nav-from")).toBe("0");
    expect(label("Home").className).toContain("max-desktop:starting:grid-rows-[1fr]");
    expect(label("Settings").className).toContain("max-desktop:starting:grid-rows-[0fr]");
    expect(label("Settings")).toHaveAttribute("data-open");
    expect(label("Home")).not.toHaveAttribute("data-open");
  });

  it("starts still once no bar was left on screen (a flow came between)", async () => {
    const { unmount } = render(<AppNav active="home" />);
    unmount();
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    render(<AppNav active="vault" />);
    expect(highlight().style.getPropertyValue("--nav-from")).toBe("3");
  });

  it("moves by its transitions when it stays mounted", () => {
    const { rerender } = render(<AppNav active="home" />);
    rerender(<AppNav active="quests" />);
    expect(highlight().style.getPropertyValue("--nav-col")).toBe("1");
    expect(label("Missions")).toHaveAttribute("data-open");
    expect(label("Home")).not.toHaveAttribute("data-open");
  });
});
