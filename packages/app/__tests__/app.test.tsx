import { slow } from "../test-slow";
import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../src/App";
import { PAGES } from "../src/routes/pages";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";

/** A path that matches a route pattern: every parameter gets a value. */
const concrete = (path: string) => "/" + path.replace(/\/?:\w+\?/, "").replace(/:(\w+)/g, "1");

beforeEach(() => {
  localStorage.clear();
  resetWelcomedForTests();
  markWelcomed();
});
const firstVisit = () => {
  localStorage.clear();
  resetWelcomedForTests();
};
afterEach(() => {
  localStorage.clear();
  resetWelcomedForTests();
});

describe("app", () => {
  it("renders the home page with the five destinations, Play in the centre", async () => {
    render(<App router={createTestRouter("/")} />);
    expect(await screen.findByRole("heading", { name: "Home" })).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Main" });
    // The five tabs are the buttons of the nav's item row (direction D: after the wordmark); the header's Balances section (its
    // Connect, its rows) comes after them.
    expect(nav.querySelectorAll(":scope > div > button")).toHaveLength(4);
    // #623: Home, Missions, Play, Vault, Settings; Play has no visible label.
    expect([...nav.querySelectorAll(":scope > div > button, :scope > div > div > button")].map((b) => b.getAttribute("aria-label"))).toEqual(["Home", "Missions", "Play", "Vault", "Settings"]);
    expect(within(nav).getByRole("button", { name: "Play" })).toHaveTextContent("");
    expect(screen.queryByRole("button", { name: "Ranks" })).not.toBeInTheDocument();
  });

  it("keeps the section 6.1 route map: 23 pages, each path once", () => {
    expect(PAGES).toHaveLength(23);
    expect(new Set(PAGES.map((p) => p.path)).size).toBe(PAGES.length);
  });

  // The wired pages bring their own scene (welcome: P1; training and its end: P3, `training-route.test.tsx`; the
  // Challenge board: P5, `challenge-route.test.tsx`; home and play: P6, `home-play.test.tsx`; Story mode: #546,
  // `story-route.test.tsx`; quests and achievements: P9, `quests-route.test.tsx`; the leaderboard and the player: P8,
  // `leaderboard-route.test.tsx`; the purchase and the Cobble packs: P7b and #621, `purchase-route.test.tsx`; the theme: P11b, `theme-route.test.tsx`; the Challenge's end: P7a, `over-route.test.tsx`; the vault and the referral: P10,
  // `vault-route.test.tsx`, `referral-route.test.tsx`; settings: P11a, `settings-route.test.tsx`; the avatar creator: #626,
  // `avatar-route.test.tsx`; the village: #646, `village-route.test.tsx`).
  const WIRED = ["welcome", "", "play", "play/challenge", "cobbles", "training", "story", "story/:campaign/:level", "training/over", "game/:gameId", "game/:gameId/over", "missions/:day?", "missions/lifetime", "settings", "settings/theme", "settings/theme/:theme", "settings/tiles", "settings/credits", "vault", "referral", "avatar", "village", "village/:player"];
  it.each(PAGES.filter((p) => !WIRED.includes(p.path)).map((p) => [p.path || "/", p] as const))(
    "renders %s in the layout of its route",
    async (_path, page) => {
      render(<App router={createTestRouter(concrete(page.path))} />);
      // The board's page module brings the renderer (three.js): its first import takes longer than findBy's 1 s in jsdom.
      expect(await screen.findByRole("heading", { level: 1, name: page.title }, { timeout: slow(5000) })).toBeInTheDocument();
      expect(screen.getByTestId("page")).toHaveAttribute("data-path", page.path || "/");
      // Tab pages carry the navigation, full-screen flows the top bar's Back: never both, never neither.
      expect(screen.queryByRole("navigation", { name: "Main" }) !== null).toBe(page.nav !== null);
      expect(screen.queryByRole("button", { name: "Back" }) !== null).toBe(page.nav === null);
    },
  );

  it("renders the welcome scene on /welcome for a first visit", async () => {
    firstVisit();
    render(<App router={createTestRouter("/welcome")} />);
    expect(await screen.findByRole("heading", { name: "Welcome to Paved" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
  });

  it("shows the loading scene as the boot screen, until the entry route has loaded", () => {
    render(<App router={createTestRouter("/")} />);
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
  });
});
