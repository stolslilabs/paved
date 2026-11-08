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
  it("renders the home page as the village with its overlays and the dock (#763, HOME-DOCK)", async () => {
    render(<App router={createTestRouter("/")} />);
    expect(await screen.findByRole("heading", { name: "Home" })).toBeInTheDocument();
    // The edges' buttons are a chunk of their own (HOME-EDGES): they may come after the heading.
    expect(await screen.findByRole("navigation", { name: "Village" }, { timeout: slow(5000) })).toBeInTheDocument();
    const nav = await screen.findByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("button", { name: "Play" })).toBeInTheDocument();
    // No item of the dock is current on the home; the home draws it at every width (HOME-DOCK).
    expect(within(nav).queryByRole("button", { current: "page" })).toBeNull();
    expect(nav.className).not.toContain("desktop:hidden");
  });

  it("gives the home the dock's five items, Play in the centre; no page carries it (DOCK-UNDER-PAGES)", async () => {
    // The last page of its own (VAULT-PAGE: the Vault is the HUD's drawer over the home, as Settings and the others).
    const { unmount } = render(<App router={createTestRouter("/referral")} />);
    expect(await screen.findByRole("heading", { level: 1, name: "Referral" }, { timeout: slow(5000) })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
    unmount();
    render(<App router={createTestRouter("/")} />);
    const nav = await screen.findByRole("navigation", { name: "Main" }, { timeout: slow(5000) });
    // The items are the buttons of the dock's band (`:scope > div > div`); Play sits in a column of its own.
    expect(nav.querySelectorAll(":scope > div > div > button")).toHaveLength(4);
    // #763, HOME-DOCK: the dock's Shop, Ranking (END-CHEST: in the Chests' place, no page yet), Play, Guild, Settings.
    expect([...nav.querySelectorAll(":scope > div > div > button, :scope > div > div > div > button")].map((b) => b.getAttribute("aria-label"))).toEqual(["Shop", "Ranking", "Play", "Guild", "Settings"]);
    // The medallion: the swords and PLAY on it.
    expect(within(nav).getByRole("button", { name: "Play" })).toHaveTextContent("Play");
    expect(screen.queryByRole("button", { name: "Ranks" })).not.toBeInTheDocument();
  });

  // 28 since BACK-RULE (#783): the defence log is a section of the League, no longer a page; 29 with a match's page (#786); 28 since Missions is one page (#832); 29 with the Social page (#952); 31 with Chat, Guild and Friends in its place (#973); 33 with the chat's tab and private conversation paths (#973); 30 without the Chests (END-CHEST: chests open where they are won).
  // 29 without the welcome (NO-GUEST: every player has an account, none is asked to connect; its old link lands on the home); 30 with the Leaderboard (LEADERBOARD-PAGE).
  // 34 with the Puzzle (Play's Limited mode): its view, a game, its end, and a mail of the chat's Inbox.
  it("keeps the section 6.1 route map: 34 pages, each path once (SHOP-PAGE: the packs' page and a theme's shop became the Shop's tabs)", () => {
    expect(PAGES).toHaveLength(34);
    expect(new Set(PAGES.map((p) => p.path)).size).toBe(PAGES.length);
  });

  // The wired pages bring their own scene (welcome: P1; training and its end: P3, `training-route.test.tsx`; the
  // Challenge board: P5, `challenge-route.test.tsx`; home and play: P6, `home-play.test.tsx`; Story mode: #546,
  // `story-route.test.tsx`; quests and achievements: P9, `quests-route.test.tsx`; the leaderboard and the player: P8,
  // `leaderboard-route.test.tsx`; the purchase and the Cobble packs: P7b and #621, `purchase-route.test.tsx`; the theme: P11b, `theme-route.test.tsx`; the Challenge's end: P7a, `over-route.test.tsx`; the vault and the referral: P10,
  // `vault-route.test.tsx`, `referral-route.test.tsx`; settings: P11a, `settings-route.test.tsx`; the avatar creator: #626,
  // `avatar-route.test.tsx`; the village: #646, `village-route.test.tsx`; the PvP flow: #647, `pvp-route.test.tsx`; a match:
  // #786, `pvp-match-route.test.tsx`; the social pages: #973, `social-pages.test.tsx`; the Puzzle and the Inbox's mail: `puzzle-route.test.tsx`).
  const WIRED = ["", "play", "play/challenge", "cobbles", "training", "story", "story/:campaign/:level", "training/over", "game/:gameId", "game/:gameId/over", "missions", "tiles", "settings", "settings/theme", "settings/theme/:theme", "settings/credits", "vault", "referral", "avatar", "village/:player", "village/shop", "pvp", "pvp/result/:id", "pvp/replay/:attacker/:id", "pvp/match/:id", "pvp/league", "chat", "chat/private/:player", "chat/mail/:mail", "chat/:tab", "guild", "friends", "ranking", "play/puzzle", "puzzle/:gameId", "puzzle/:gameId/over"];
  it.each(PAGES.filter((p) => !WIRED.includes(p.path)).map((p) => [p.path || "/", p] as const))(
    "renders %s in the layout of its route",
    async (_path, page) => {
      render(<App router={createTestRouter(concrete(page.path))} />);
      // The board's page module brings the renderer (three.js): its first import takes longer than findBy's 1 s in jsdom.
      expect(await screen.findByRole("heading", { level: 1, name: page.title }, { timeout: slow(5000) })).toBeInTheDocument();
      expect(screen.getByTestId("page")).toHaveAttribute("data-path", page.path || "/");
      // No page carries the dock (DOCK-UNDER-PAGES): Back is every page's way out.
      expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
      expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
    },
  );

  it("has no welcome (NO-GUEST): a first visit opens the village, and the welcome's old link lands there", async () => {
    firstVisit();
    const router = createTestRouter("/welcome?ref=0x5f1");
    render(<App router={router} />);
    expect(await screen.findByRole("heading", { name: "Home" }, { timeout: slow(5000) })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/");
    expect(router.state.location.search).toBe("?ref=0x5f1");
  });

  it("shows the loading scene as the boot screen, until the entry route has loaded", () => {
    render(<App router={createTestRouter("/")} />);
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
  });
});
