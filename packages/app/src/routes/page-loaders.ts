import type { ComponentType } from "react";
import { RENDERER_ASSETS, manifestBody } from "../data/renderer-manifest";

/** A page's module: what `lazy` and the prefetch both call. The browser fetches a module once, so calling it twice is free. */
export type PageLoader = () => Promise<{ default: ComponentType }>;

/**
 * One loader per page path of `pages.ts`: a page's code is fetched when its route is first visited (or earlier, by
 * `prefetch.ts`), so none of it is in the first bundle. Paths that share a scene share the loader. A wiring PR changes the
 * module's body, not this table.
 */
// The board's manifest is asked for with the board's code, so the scene finds it in (`renderer-manifest.ts`, LOAD-FAST).
const board: PageLoader = () => {
  void manifestBody(RENDERER_ASSETS).catch(() => {});
  return import("./pages/board");
};
const over: PageLoader = () => import("./pages/over");

export const PAGE_LOADERS: Record<string, PageLoader> = {
  welcome: () => import("./pages/welcome"),
  "": () => import("./pages/home"),
  play: () => import("./pages/play"),
  "play/challenge": () => import("./pages/purchase"),
  "game/:gameId": board,
  training: board,
  story: () => import("./pages/story"),
  // A Story level is its own chunk (#546), with the board's manifest asked for as the board's.
  "story/:campaign/:level": () => {
    void manifestBody(RENDERER_ASSETS).catch(() => {});
    return import("./pages/story-board");
  },
  "game/:gameId/over": over,
  "training/over": over,
  "leaderboard/:day?": () => import("./pages/leaderboard"),
  "player/:id": () => import("./pages/player"),
  "missions/:day?": () => import("./pages/quests"),
  "missions/lifetime": () => import("./pages/achievements"),
  vault: () => import("./pages/vault"),
  referral: () => import("./pages/referral"),
  "settings/theme": () => import("./pages/theme"),
  "settings/theme/:theme": () => import("./pages/theme-shop"),
  "settings/tiles": () => import("./pages/my-tiles"),
  "settings/credits": () => import("./pages/credits"),
  settings: () => import("./pages/settings"),
};
