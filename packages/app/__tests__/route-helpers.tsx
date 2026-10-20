import type { ReactNode } from "react";
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

const PAGES = {
  board: () => import("../src/routes/pages/board"),
  story: () => import("../src/routes/pages/story"),
  "story-board": () => import("../src/routes/pages/story-board"),
  home: () => import("../src/routes/pages/home"),
  leaderboard: () => import("../src/routes/pages/leaderboard"),
  over: () => import("../src/routes/pages/over"),
  play: () => import("../src/routes/pages/play"),
  player: () => import("../src/routes/pages/player"),
  purchase: () => import("../src/routes/pages/purchase"),
  quests: () => import("../src/routes/pages/quests"),
  referral: () => import("../src/routes/pages/referral"),
  settings: () => import("../src/routes/pages/settings"),
  achievements: () => import("../src/routes/pages/achievements"),
  theme: () => import("../src/routes/pages/theme"),
  "theme-shop": () => import("../src/routes/pages/theme-shop"),
  "my-tiles": () => import("../src/routes/pages/my-tiles"),
  credits: () => import("../src/routes/pages/credits"),
  welcome: () => import("../src/routes/pages/welcome"),
};

/**
 * The lazy route modules a file reaches, loaded once before its first test: the router imports a page on its first visit, which
 * a file's first test paid inside its own timeout (0.3 to 1.5 s per page, several times that under load).
 */
export function preloadPages(...names: (keyof typeof PAGES)[]) {
  beforeAll(async () => {
    await Promise.all(names.map((name) => PAGES[name]()));
  }, 60_000);
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
const BUBBLE_WAIT_MS = 5000;

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
