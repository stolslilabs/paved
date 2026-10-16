import type { ComponentType } from "react";

/** A page's module: what `lazy` and the prefetch both call. The browser fetches a module once, so calling it twice is free. */
export type PageLoader = () => Promise<{ default: ComponentType }>;

/**
 * One loader per page path of `pages.ts`: a page's code is fetched when its route is first visited (or earlier, by
 * `prefetch.ts`), so none of it is in the first bundle. Paths that share a scene share the loader. A wiring PR changes the
 * module's body, not this table.
 */
const board: PageLoader = () => import("./pages/board");
const over: PageLoader = () => import("./pages/over");

export const PAGE_LOADERS: Record<string, PageLoader> = {
  welcome: () => import("./pages/welcome"),
  "": () => import("./pages/home"),
  play: () => import("./pages/play"),
  "play/challenge": () => import("./pages/purchase"),
  "game/:gameId": board,
  training: board,
  tutorial: board,
  "game/:gameId/over": over,
  "training/over": over,
  "leaderboard/:day?": () => import("./pages/leaderboard"),
  "player/:id": () => import("./pages/player"),
  "quests/:day?": () => import("./pages/quests"),
  achievements: () => import("./pages/achievements"),
  vault: () => import("./pages/vault"),
  referral: () => import("./pages/referral"),
  "settings/theme": () => import("./pages/theme"),
  settings: () => import("./pages/settings"),
};
