import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { AppNav } from "../src/components/containers/app-nav";
import { useTabNavigate } from "../src/routes/ref";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { fakeSources } from "./data-fakes";
import { fakeWallet } from "./wallet-fakes";
import { preloadPages } from "./route-helpers";

// The home's dock (#763, HOME-DOCK). DOCK-UNDER-PAGES (the owner's ask of 2026-11-04): only the home draws it, under the pages it
// opens, so no item is ever the current page; the sliding highlight (TAB-SWIPE #726), the swipe between pages and its disc
// (SWIPE-DISC #780) and the re-tap that closed the current page (TAB-RETAP #800) left with the pages' bars.

describe("the dock", () => {
  it("holds Shop, Ranking, Play, Guild, Settings in that order, at every width (#763, HOME-DOCK; END-CHEST: Ranking in the Chests' place), none of them current", () => {
    render(<AppNav />);
    expect(screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["Shop", "Ranking", "Play", "Guild", "Settings"]);
    expect(screen.queryByRole("button", { current: "page" })).toBeNull();
    expect(screen.getByRole("navigation", { name: "Main" })).not.toHaveClass("desktop:hidden");
    // The labels from `mobile` (a 320 px phone too narrow for the five).
    for (const name of ["Shop", "Ranking", "Guild", "Settings"]) {
      expect(screen.getByRole("button", { name }).querySelector('[data-slot="app-nav-label"]')!.className).toContain("mobile:block");
    }
    // The painted wood and parchment under it (the mockup's pieces, 9-slices), and the four dividers between its columns.
    for (const slot of ["dock-wood", "dock-panel"]) expect(document.querySelector(`[data-slot="${slot}"]`), slot).not.toBeNull();
    expect(document.querySelectorAll('[data-slot="dock-divider"]')).toHaveLength(4);
  });

  it("on the home, shows the guild's count on Guild; Ranking opens the Leaderboard (LEADERBOARD-PAGE)", async () => {
    const onNavigate = vi.fn();
    render(<AppNav badges={{ guild: 1 }} onNavigate={onNavigate} />);
    expect(screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["Shop", "Ranking", "Play", "Guild, 1 waiting", "Settings"]);
    expect([...document.querySelectorAll('[data-slot="app-nav-badge"]')].map((b) => b.textContent)).toEqual(["1"]);
    const ranking = screen.getByRole("button", { name: "Ranking" });
    expect(ranking).not.toHaveAttribute("aria-disabled");
    ranking.click();
    expect(onNavigate).toHaveBeenCalledWith("ranking");
  });
});

describe("useTabNavigate", () => {
  /** The location, and a pick of Settings in the dock. */
  function Probe() {
    const onNavigate = useTabNavigate();
    return (
      <>
        <output>{useLocation().pathname}</output>
        <button type="button" onClick={() => onNavigate("settings")}>
          Settings
        </button>
      </>
    );
  }

  it("opens the tab's page, a new entry over the village's", async () => {
    const router = createMemoryRouter([{ path: "*", element: <Probe /> }], { initialEntries: ["/?ref=0xabc"] });
    render(<RouterProvider router={router} />);
    await userEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(router.state.location.pathname).toBe("/settings");
    expect(router.state.location.search).toBe("?ref=0xabc");
    expect(router.state.historyAction).toBe("PUSH");
  });
});

describe("a pick in the home's dock", () => {
  preloadPages("home", "shop");
  beforeEach(() => {
    localStorage.clear();
    resetWelcomedForTests();
    markWelcomed();
  });
  afterEach(() => {
    localStorage.clear();
    resetWelcomedForTests();
  });

  // SHOP-PAGE: the Shop is the HUD's drawer over the home, as Missions; the dock under it, out of reach (DOCK-UNDER-PAGES).
  it("opens its page, which carries no dock", async () => {
    const router = createTestRouter("/");
    render(<App router={router} sources={fakeSources().sources} connector={fakeWallet().load} />);
    await userEvent.click(within(await screen.findByRole("navigation", { name: "Main" })).getByRole("button", { name: "Shop" }));
    await screen.findByRole("dialog", { name: "Shop" });
    expect(router.state.location.pathname).toBe("/village/shop");
    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
  });
});
