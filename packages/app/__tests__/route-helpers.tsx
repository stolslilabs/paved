import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LazyMotion, domMax } from "motion/react";
import { beforeAll } from "vitest";

/**
 * The board a route opens, where the test asserts the route and not the board (`challenge-route.test.tsx`, `tutorial-route.test.tsx`
 * and the board's own tests run the real one). The renderer and three are the largest share of a route's cold first load (1.1 to
 * 1.4 s on a quiet machine, several times that under load). Use it with
 * `vi.mock("../src/routes/pages/board", async () => (await import("./route-helpers")).boardStandInModule)`.
 */
export const boardStandInModule = { default: () => <h1>Board</h1> };

const PAGES = {
  board: () => import("../src/routes/pages/board"),
  home: () => import("../src/routes/pages/home"),
  leaderboard: () => import("../src/routes/pages/leaderboard"),
  over: () => import("../src/routes/pages/over"),
  play: () => import("../src/routes/pages/play"),
  player: () => import("../src/routes/pages/player"),
  purchase: () => import("../src/routes/pages/purchase"),
  quests: () => import("../src/routes/pages/quests"),
  achievements: () => import("../src/routes/pages/achievements"),
  theme: () => import("../src/routes/pages/theme"),
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
