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
  it("follows the dock's order (#763, HOME-DOCK): Shop, Chests, Play, Guild, Settings", () => {
    expect(tabSwipeWay("shop", "chests")).toBe("next");
    expect(tabSwipeWay("chests", "guild")).toBe("next");
    expect(tabSwipeWay("shop", "settings")).toBe("next");
    expect(tabSwipeWay("guild", "chests")).toBe("prev");
    expect(tabSwipeWay("settings", "shop")).toBe("prev");
  });

  it("is none for Play, within one tab, from a page of no tab, and from or to a tab not in the bar", () => {
    expect(tabSwipeWay("shop", "play")).toBeNull();
    expect(tabSwipeWay("play", "guild")).toBeNull();
    expect(tabSwipeWay("settings", "settings")).toBeNull();
    expect(tabSwipeWay(null, "shop")).toBeNull();
    // The home, Missions and the Vault are the overlay's, not the bar's: no item is current there, so no way.
    expect(tabSwipeWay("home", "chests")).toBeNull();
    expect(tabSwipeWay("vault", "settings")).toBeNull();
    expect(tabSwipeWay("guild", "home")).toBeNull();
    // League left the dock (HOME-DOCK): the crowns' capsule leads to it, so no way either.
    expect(tabSwipeWay("shop", "league")).toBeNull();
    expect(tabSwipeWay("vault", "quests")).toBeNull();
  });
});

describe("tabSwipe", () => {
  it("below desktop, marks <html> with the way and asks for a view transition", () => {
    media();
    viewTransitions();
    expect(tabSwipe("shop", "guild")).toEqual({ viewTransition: true });
    expect(html.getAttribute(TAB_SWIPE_MARK)).toBe("next");
    expect(tabSwipe("guild", "shop")).toEqual({ viewTransition: true });
    expect(html.getAttribute(TAB_SWIPE_MARK)).toBe("prev");
  });

  it.each([
    ["from desktop", () => (media({ below: false }), viewTransitions())],
    ["under reduced motion", () => (media({ reduced: true }), viewTransitions())],
    ["without document.startViewTransition", () => media()],
  ])("changes the page at once %s", (_name, setUp) => {
    setUp();
    expect(tabSwipe("shop", "guild")).toBeUndefined();
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
  preloadPages("home", "missions", "vault", "settings", "village-shop", "village-chests");
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

  it("shows every item's label (the mockup's), the current one gold, and puts the highlight on its column", () => {
    render(<AppNav active="guild" />);
    // The labels from `mobile` (a 320 px phone too narrow for the five).
    for (const name of ["Shop", "Chests", "Guild", "Settings"]) expect(label(name).className).toContain("mobile:block");
    expect(screen.getByRole("button", { name: "Guild" })).toHaveClass("text-primary");
    expect(screen.getByRole("button", { name: "Shop" })).toHaveClass("text-foreground");
    expect(highlight().dataset.column).toBe("3");
    // Its offset in its own width (one item's): past Play, the medallion's column less an item's.
    expect(highlight().style.getPropertyValue("--nav-x")).toMatch(/^calc\(3 \* 100% \+ [\d.]+px - 100%\)$/);
    expect(highlight().className).not.toContain("opacity-0");
    // A first bar starts still: no starting style of another tab.
    expect(highlight().dataset.from).toBe("3");
    expect(highlight().style.getPropertyValue("--nav-from-x")).toBe(highlight().style.getPropertyValue("--nav-x"));
    expect(screen.getByRole("button", { name: "Guild" }).className).not.toContain("starting:");
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
    expect(highlight().dataset.column).toBe("4");
    expect(highlight().dataset.from).toBe("0");
    expect(highlight().style.getPropertyValue("--nav-from-x")).toBe("calc(0 * 100%)");
    // The old item starts gold, the new one white, and each moves to its own.
    expect(screen.getByRole("button", { name: "Shop" }).className).toContain("starting:text-primary");
    expect(screen.getByRole("button", { name: "Settings" }).className).toContain("starting:text-foreground");
    expect(screen.getByRole("button", { name: "Settings" })).toHaveAttribute("aria-current", "page");
  });

  it("fades the highlight in on its column when the last bar had no item current (the home's)", () => {
    const { rerender } = render(<AppNav key="home" active={null} />);
    rerender(<AppNav key="chests" active="chests" />);
    expect(highlight().dataset.column).toBe("1");
    expect(highlight().className).toContain("starting:opacity-0");
    expect(highlight().className).not.toMatch(/(^| )opacity-0/);
  });

  it("starts still once no bar was left on screen (a flow came between)", async () => {
    const { unmount } = render(<AppNav active="shop" />);
    unmount();
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    render(<AppNav active="guild" />);
    expect(highlight().dataset.from).toBe("3");
  });

  it("moves by its transitions when it stays mounted", () => {
    const { rerender } = render(<AppNav active="shop" />);
    rerender(<AppNav active="chests" />);
    expect(highlight().dataset.column).toBe("1");
    expect(highlight().style.getPropertyValue("--nav-x")).toBe("calc(1 * 100%)");
    expect(screen.getByRole("button", { name: "Chests" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Shop" })).not.toHaveAttribute("aria-current");
  });

  it("holds Shop, Chests, Play, Guild, Settings in that order, at every width (#763, HOME-DOCK)", () => {
    render(<AppNav active="shop" />);
    expect(screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["Shop", "Chests", "Play", "Guild", "Settings"]);
    // The dock itself hides at no width: the page frame hides it from `desktop`, where pages open in the home's side panel.
    expect(screen.getByRole("navigation", { name: "Main" })).not.toHaveClass("desktop:hidden");
    // The painted wood and parchment under it (the mockup's pieces, 9-slices), and the four dividers between its columns.
    for (const slot of ["dock-wood", "dock-panel"]) expect(document.querySelector(`[data-slot="${slot}"]`), slot).not.toBeNull();
    expect(document.querySelectorAll('[data-slot="dock-divider"]')).toHaveLength(4);
  });

  it("on the home, shows the dock's items alone, the chests waiting on Chests and the guild's count on Guild", () => {
    render(<AppNav active={null} badges={{ chests: 2, guild: 1 }} />);
    expect(screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["Shop", "Chests, 2 waiting", "Play", "Guild, 1 waiting", "Settings"]);
    expect([...document.querySelectorAll('[data-slot="app-nav-badge"]')].map((b) => b.textContent)).toEqual(["2", "1"]);
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
