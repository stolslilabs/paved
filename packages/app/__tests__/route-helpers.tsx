import { slow } from "../test-slow";
import type { ReactNode } from "react";
import type { RouteObject } from "react-router";
import { renderToStaticMarkup } from "react-dom/server";
import { LazyMotion, domMax } from "motion/react";
import { beforeAll } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { HOLD_MS } from "../src/components/elements/hold-button";

/**
 * The board a route opens, where the test asserts the route and not the board (`challenge-route.test.tsx`, `story-route.test.tsx`
 * and the board's own tests run the real one). The renderer and three are the largest share of a route's cold first load (1.1 to
 * 1.4 s on a quiet machine, several times that under load). Use it with
 * `vi.mock("../src/routes/pages/board", async () => (await import("./route-helpers")).boardStandInModule)`.
 */
export const boardStandInModule = { default: () => <h1>Board</h1> };

/**
 * The route of a page path in the route table, at any depth: the side panel's pages are the home's children (#762). The home
 * (`""`) is its layout route (`id: "home"`), which draws it; its index child (no welcome first since NO-GUEST).
 */
export function routeOf(routes: RouteObject[], path: string): RouteObject {
  for (const route of routes) {
    if (path === "" ? route.id === "home" : route.path === path) return route;
    const found = route.children && routeOrNull(route.children, path);
    if (found) return found;
  }
  throw new Error(`no route for "${path}"`);
}
const routeOrNull = (routes: RouteObject[], path: string): RouteObject | null => {
  try {
    return routeOf(routes, path);
  } catch {
    return null;
  }
};

const PAGES = {
  board: () => import("../src/routes/pages/board"),
  // Story's campaigns are a view of Play's drawer (STORY-PAGE): Play's chunk and its host come with them.
  story: () => Promise.all([import("../src/routes/pages/story"), import("../src/routes/pages/play"), import("../src/routes/home-hosts")]),
  "story-board": () => import("../src/routes/pages/story-board"),
  // The home and the chunks it draws on every visit: its stage (the editor, the engine, the village's stage and its Camera
  // button), the phone's bar and the League control. A file whose test ends before they are in left their
  // imports running past the environment's teardown, an unhandled error that failed the run (wallet-claims.test, 1 run in 4).
  // The drawers' pages' host (MISSIONS-PAGE) mounts with the home at every width.
  home: () =>
    Promise.all([
      import("../src/routes/pages/home"),
      import("../src/routes/home-hosts"),
      import("../src/routes/home-stage"),
      import("../src/components/containers/app-nav"),
      import("../src/components/containers/league-control"),
    ]),
  over: () => import("../src/routes/pages/over"),
  // Play is the HUD's drawer over the home (PLAY-PAGE): its host comes with it, and its views' chunks (the stake's `pages/purchase`,
  // Story's `pages/story`, STORY-PAGE), which the page fetches as soon as a pointer passes over it or a control takes the focus. Left
  // to the test, that import fell inside back-targets' wait for Story's levels on CI and outlasted it.
  play: () =>
    Promise.all([
      import("../src/routes/pages/play"),
      import("../src/routes/pages/purchase"),
      import("../src/routes/pages/story"),
      import("../src/routes/pages/puzzle"),
      import("../src/routes/pages/joust"),
      import("../src/routes/pages/expedition"),
      import("../src/routes/pages/fair"),
      import("../src/routes/home-hosts"),
    ]),
  "expedition-board": () => import("../src/routes/pages/expedition-board"),
  purchase: () => import("../src/routes/pages/purchase"),
  cobbles: () => import("../src/routes/pages/cobbles"),
  // Missions is the HUD's drawer over the home (MISSIONS-PAGE): its host comes with it.
  missions: () => Promise.all([import("../src/routes/pages/missions"), import("../src/routes/home-hosts")]),
  tiles: () => Promise.all([import("../src/routes/pages/tiles"), import("../src/routes/home-hosts")]),
  // The avatar editor is the HUD's drawer over the home (AVATAR-PAGE), opened from the Profile (its own chunk), which its Back opens again.
  avatar: () => Promise.all([import("../src/routes/pages/avatar"), import("../src/routes/home-hosts"), import("../src/components/containers/profile-sheet")]),
  referral: () => import("../src/routes/pages/referral"),
  // The Vault is the HUD's drawer over the home (VAULT-PAGE): its host comes with it.
  vault: () => Promise.all([import("../src/routes/pages/vault"), import("../src/routes/home-hosts")]),
  chat: () => Promise.all([import("../src/routes/pages/chat"), import("../src/routes/page-views-host")]),
  guild: () => Promise.all([import("../src/routes/pages/guild"), import("../src/routes/social/guild-view"), import("../src/routes/social/guild-view-host"), import("../src/routes/page-views-host"), import("../src/routes/home-hosts")]),
  friends: () => Promise.all([import("../src/routes/pages/friends"), import("../src/routes/page-views-host")]),
  // The Leaderboard is the HUD's drawer over the home (LEADERBOARD-PAGE): its host and the profiles' come with it.
  ranking: () => Promise.all([import("../src/routes/pages/ranking"), import("../src/routes/social/guild-view-host"), import("../src/routes/page-views-host"), import("../src/routes/home-hosts")]),
  // Settings is the HUD's drawer over the home (SETTINGS-PAGE), Credits and Themes its views: its host comes with it.
  settings: () => Promise.all([import("../src/routes/pages/settings"), import("../src/routes/home-hosts")]),
  theme: () => import("../src/routes/pages/theme"),
  // The Shop is the HUD's drawer over the home (SHOP-PAGE): its host comes with it.
  shop: () => Promise.all([import("../src/routes/pages/shop"), import("../src/routes/home-hosts")]),
  "pvp-league": () => import("../src/routes/pages/pvp-league"),
  // The hosts pages open in, their own chunks: the home's side panel (#762), a sheet over its page (BACK-RULE #783), the
  // Cobbles' sheet (#621), the search.
  "home-panel": () => import("../src/routes/home-panel-host"),
  "page-sheets": () => Promise.all([import("../src/routes/page-sheets"), import("../src/routes/page-sheet-host")]),
  "cobbles-sheet": () => Promise.all([import("../src/routes/cobbles-sheet-host"), import("../src/routes/pages/cobbles")]),
  "pvp-v2": () => import("../src/routes/pvp-v2"),
};

/**
 * The lazy route modules a file reaches, loaded once before its first test: the router imports a page on its first visit, which
 * a file's first test paid inside its own timeout (0.3 to 1.5 s per page, several times that under load).
 */
export function preloadPages(...names: (keyof typeof PAGES)[]) {
  beforeAll(async () => {
    await Promise.all(names.map((name) => PAGES[name]()));
  }, slow(60_000));
}

/**
 * The text of each error toast a spy on `toast.custom` saw (`toastError`, P-67): its `InlineError` rendered to markup, as
 * "Title: message" followed by its buttons' text.
 */
export function errorToastTexts(custom: { mock: { calls: unknown[][] } }): string[] {
  return custom.mock.calls.map(([render]) => {
    const html = renderToStaticMarkup(<LazyMotion features={domMax}>{(render as (id: string) => ReactNode)("toast")}</LazyMotion>);
    return html
      .replace(/<[^>]+>/g, "")
      .replace(/&#x27;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&");
  });
}

/** How long a test waits for the bubble after a slot is chosen: under load its render takes more than the default second. */
const BUBBLE_WAIT_MS = slow(5000);

/** The bubble's Validate (#568): held to place the tile. Null while no slot is chosen (no bubble). */
export const validateButton = () => screen.queryByRole("button", { name: "Hold to place the tile" });

/**
 * Places the tile as a player does since #568: the bubble's Validate pressed and held for its whole hold, then let go. It
 * waits for the bubble (its own chunk) to be there first.
 */
export async function holdToPlace(): Promise<void> {
  const button = await screen.findByRole("button", { name: "Hold to place the tile" }, { timeout: BUBBLE_WAIT_MS });
  await act(async () => {
    fireEvent.pointerDown(button, { button: 0, pointerId: 1 });
    await new Promise((resolve) => setTimeout(resolve, HOLD_MS + 50));
  });
  fireEvent.pointerUp(button, { button: 0, pointerId: 1 });
}

/**
 * Places the tile with the activation a screen reader sends (a click with no press before it), which the hold lets through
 * at once (`HoldButton`): for the tests that place many tiles. `holdToPlace` is the player's hold.
 */
export async function placeTile(): Promise<void> {
  fireEvent.click(await screen.findByRole("button", { name: "Hold to place the tile" }, { timeout: BUBBLE_WAIT_MS }));
}

/**
 * Discards the tile in hand from the tile stack (#606): its Discard is held, so the test activates it as a screen reader does
 * (a click with no press before it acts at once; `hold-button.test.tsx` covers the hold itself).
 */
export async function discardTile(): Promise<void> {
  const stack = await screen.findByRole("region", { name: "Your tile" }, { timeout: BUBBLE_WAIT_MS });
  const button = stack.querySelector<HTMLButtonElement>('button[aria-label^="Hold to discard the tile"]');
  if (!button) throw new Error("discardTile: the stack offers no Discard");
  fireEvent.click(button);
}

/**
 * The page shown in a drawer's place (DRAWER-NAV-IN-PLACE, #1064: a profile, another guild, a list), the last one opened, by its slot
 * (`public-profile`, `guild-sheet`...); null when the drawer shows its own page.
 */
export function shownView(slot?: string): HTMLElement | null {
  const views = [...document.querySelectorAll<HTMLElement>(slot ? `[data-hud-drawer-view="${slot}"]` : "[data-hud-drawer-view]")].filter((v) => !v.hasAttribute("inert"));
  return views.at(-1) ?? null;
}

/** The drawer's header Back (`hud-drawer-back`): one page back, from a page shown in its place too. */
export const drawerBack = (drawer: HTMLElement): HTMLElement => drawer.querySelector<HTMLElement>("[data-slot=hud-drawer-back]")!;
