import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, render, screen, waitFor, within } from "@testing-library/react";
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
  it("follows the bar's order (#763): Shop, Chests, Play, League, Settings", () => {
    expect(tabSwipeWay("shop", "chests")).toBe("next");
    expect(tabSwipeWay("chests", "league")).toBe("next");
    expect(tabSwipeWay("shop", "settings")).toBe("next");
    expect(tabSwipeWay("league", "chests")).toBe("prev");
    expect(tabSwipeWay("settings", "shop")).toBe("prev");
  });

  it("is none for Play, within one tab, from a page of no tab, and from or to a tab not in the bar", () => {
    expect(tabSwipeWay("shop", "play")).toBeNull();
    expect(tabSwipeWay("play", "league")).toBeNull();
    expect(tabSwipeWay("settings", "settings")).toBeNull();
    expect(tabSwipeWay(null, "shop")).toBeNull();
    // The home, Missions and the Vault are the overlay's, not the bar's: no item is current there, so no way.
    expect(tabSwipeWay("home", "chests")).toBeNull();
    expect(tabSwipeWay("vault", "settings")).toBeNull();
    expect(tabSwipeWay("league", "home")).toBeNull();
    expect(tabSwipeWay("vault", "quests")).toBeNull();
  });
});

describe("tabSwipe", () => {
  it("below desktop, marks <html> with the way and asks for a view transition", () => {
    media();
    viewTransitions();
    expect(tabSwipe("shop", "league")).toEqual({ viewTransition: true });
    expect(html.getAttribute(TAB_SWIPE_MARK)).toBe("next");
    expect(tabSwipe("league", "shop")).toEqual({ viewTransition: true });
    expect(html.getAttribute(TAB_SWIPE_MARK)).toBe("prev");
  });

  it.each([
    ["from desktop", () => (media({ below: false }), viewTransitions())],
    ["under reduced motion", () => (media({ reduced: true }), viewTransitions())],
    ["without document.startViewTransition", () => media()],
  ])("changes the page at once %s", (_name, setUp) => {
    setUp();
    expect(tabSwipe("shop", "league")).toBeUndefined();
    expect(html.hasAttribute(TAB_SWIPE_MARK)).toBe(false);
  });

  it("changes the page at once for Play and within one tab", () => {
    media();
    viewTransitions();
    expect(tabSwipe("shop", "play")).toBeUndefined();
    expect(tabSwipe("settings", "settings")).toBeUndefined();
    expect(tabSwipe("home", "chests")).toBeUndefined();
    expect(html.hasAttribute(TAB_SWIPE_MARK)).toBe(false);
  });
});

describe("a pick in the bar", () => {
  preloadPages("home", "quests", "vault", "settings", "village-shop", "village-chests");
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
    const router = open("/settings");
    await screen.findByRole("heading", { level: 1, name: "Settings" });
    await userEvent.click(within(screen.getByRole("navigation", { name: "Main" })).getByRole("button", { name: "Shop" }));
    await screen.findByRole("heading", { level: 1, name: "Tile shop" });
    expect(router.state.location.pathname).toBe("/village/shop");
    expect(start).toHaveBeenCalledTimes(1);
    expect(marks).toEqual(["prev"]);
    await waitFor(() => expect(html.hasAttribute(TAB_SWIPE_MARK)).toBe(false));
  });

  it("does not swipe from a page of no item of the bar (the Vault, #763)", async () => {
    media();
    const { start } = viewTransitions();
    const router = open("/vault");
    await screen.findByRole("heading", { level: 1, name: "Vault" });
    await userEvent.click(within(screen.getByRole("navigation", { name: "Main" })).getByRole("button", { name: "Chests" }));
    await screen.findByRole("heading", { level: 1, name: "Chests" });
    expect(router.state.location.pathname).toBe("/village/chests");
    expect(start).not.toHaveBeenCalled();
  });

  it("from desktop, changes the page with no transition", async () => {
    media({ below: false });
    const { start } = viewTransitions();
    // (The side panel's query is not matched here: the pages stay full, their bar's picks are what is tested.)
    const router = open("/settings");
    await screen.findByRole("heading", { level: 1, name: "Settings" });
    await userEvent.click(within(screen.getByRole("navigation", { name: "Main" })).getByRole("button", { name: "Shop" }));
    await screen.findByRole("heading", { level: 1, name: "Tile shop" });
    expect(router.state.location.pathname).toBe("/village/shop");
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
    render(<AppNav active="league" />);
    expect(["Shop", "Chests", "League", "Settings"].filter((name) => label(name).hasAttribute("data-open"))).toEqual(["League"]);
    expect(label("League").className).toContain("grid-rows-[1fr]");
    expect(label("Shop").className).toContain("grid-rows-[0fr]");
    expect(highlight().dataset.column).toBe("3");
    expect(highlight().style.getPropertyValue("--nav-col")).toBe("3");
    expect(highlight().className).not.toContain("opacity-0");
    // A first bar starts still: no starting style of another tab.
    expect(highlight().style.getPropertyValue("--nav-from")).toBe("3");
    expect(label("League").className).not.toContain("starting:");
  });

  it("has no highlight on Play, nor where no item of the bar is current (the home, the Vault, #763)", () => {
    const { unmount } = render(<AppNav active="play" />);
    expect(highlight().className).toContain("opacity-0");
    unmount();
    const home = render(<AppNav active={null} />);
    expect(highlight().className).toContain("opacity-0");
    expect(screen.queryByRole("button", { current: "page" })).toBeNull();
    home.unmount();
    render(<AppNav active="vault" />);
    expect(highlight().className).toContain("opacity-0");
  });

  it("starts a new bar from the state the last one drew", () => {
    // A tab change: one bar unmounts as the next mounts, in the same commit.
    const { rerender } = render(<AppNav key="shop" active="shop" />);
    rerender(<AppNav key="settings" active="settings" />);
    expect(highlight().style.getPropertyValue("--nav-col")).toBe("4");
    expect(highlight().style.getPropertyValue("--nav-from")).toBe("0");
    expect(label("Shop").className).toContain("max-desktop:starting:grid-rows-[1fr]");
    expect(label("Settings").className).toContain("max-desktop:starting:grid-rows-[0fr]");
    expect(label("Settings")).toHaveAttribute("data-open");
    expect(label("Shop")).not.toHaveAttribute("data-open");
  });

  it("fades the highlight in on its column when the last bar had no item current (the home's)", () => {
    const { rerender } = render(<AppNav key="home" active={null} />);
    rerender(<AppNav key="chests" active="chests" />);
    expect(highlight().style.getPropertyValue("--nav-col")).toBe("1");
    expect(highlight().className).toContain("max-desktop:starting:opacity-0");
    expect(highlight().className).not.toMatch(/(^| )opacity-0/);
  });

  it("starts still once no bar was left on screen (a flow came between)", async () => {
    const { unmount } = render(<AppNav active="shop" />);
    unmount();
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    render(<AppNav active="league" />);
    expect(highlight().style.getPropertyValue("--nav-from")).toBe("3");
  });

  it("moves by its transitions when it stays mounted", () => {
    const { rerender } = render(<AppNav active="shop" />);
    rerender(<AppNav active="chests" />);
    expect(highlight().style.getPropertyValue("--nav-col")).toBe("1");
    expect(label("Chests")).toHaveAttribute("data-open");
    expect(label("Shop")).not.toHaveAttribute("data-open");
  });

  it("holds Shop, Chests, Play, League, Settings in that order below desktop, and nothing from it (#763, #762)", () => {
    render(<AppNav active="shop" />);
    expect(screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["Shop", "Chests", "Play", "League", "Settings"]);
    expect(screen.getByRole("navigation", { name: "Main" })).toHaveClass("desktop:hidden");
  });

  it("on the home, shows the bar's items alone, the chests waiting on Chests, and nothing from desktop", () => {
    render(<AppNav active={null} badges={{ chests: 2 }} />);
    expect(screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["Shop", "Chests, 2 waiting", "Play", "League", "Settings"]);
    expect(screen.getByRole("navigation", { name: "Main" }).className).toContain("desktop:hidden");
    expect(document.querySelector('[data-slot="app-nav-badge"]')).toHaveTextContent("2");
  });
});

describe("the Play disc during a swipe (SWIPE-DISC, #780)", () => {
  const css = readFileSync(join(process.cwd(), "src/styles/theme.css"), "utf8");
  /** The declarations of the first rule whose selector is `selector`. */
  const rule = (selector: string) => {
    const at = css.indexOf(`${selector} {`);
    expect(at, selector).toBeGreaterThanOrEqual(0);
    return css.slice(css.indexOf("{", at) + 1, css.indexOf("}", at));
  };

  it("names the bar on its own while the mark is on, so the page's snapshots never cover the disc", () => {
    render(<AppNav active="shop" />);
    expect(screen.getByRole("navigation", { name: "Main" })).toHaveAttribute("data-slot", "app-nav");
    expect(rule('html[data-tab-swipe] [data-slot="app-nav"]')).toContain("view-transition-name: app-nav");
    expect(rule('html[data-tab-swipe] [data-slot="page-scroll"]')).toContain("view-transition-name: tab-page");
  });

  it("paints the bar's group above the page's, still: its new snapshot alone, not animated", () => {
    expect(rule("html[data-tab-swipe]::view-transition-group(app-nav)")).toMatch(/z-index: [1-9]/);
    expect(rule("html[data-tab-swipe]::view-transition-group(tab-page)")).not.toContain("z-index");
    expect(rule("html[data-tab-swipe]::view-transition-group(app-nav)")).toContain("animation: none");
    expect(rule("html[data-tab-swipe]::view-transition-old(app-nav)")).toMatch(/animation: none;\s+opacity: 0/);
    expect(rule("html[data-tab-swipe]::view-transition-new(app-nav)")).toContain("animation: none");
  });
});
