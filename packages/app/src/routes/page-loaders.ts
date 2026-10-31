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
const village: PageLoader = () => {
  void manifestBody(RENDERER_ASSETS).catch(() => {});
  return import("./pages/village");
};

const pvp: PageLoader = () => {
  void manifestBody(RENDERER_ASSETS).catch(() => {});
  return import("./pages/pvp");
};

export const PAGE_LOADERS: Record<string, PageLoader> = {
  welcome: () => import("./pages/welcome"),
  "": () => import("./pages/home"),
  play: () => import("./pages/play"),
  "play/challenge": () => import("./pages/purchase"),
  cobbles: () => import("./pages/cobbles"),
  // The avatar creator (#626 PR 2), its own chunk; its 3D preview and stills are the renderer's avatar chunk, loaded by the page.
  avatar: () => import("./pages/avatar"),
  // A visit to a village (#646 PR 2), its own chunk; its tile art reads the renderer's manifest, asked for with the code. The own
  // village is the home (#753).
  "village/:player": village,
  // The v2 village's chests and daily shop (#739), a chunk each; their tile cards read the renderer's manifest too.
  "village/chests": () => {
    void manifestBody(RENDERER_ASSETS).catch(() => {});
    return import("./pages/village-chests");
  },
  "village/shop": () => {
    void manifestBody(RENDERER_ASSETS).catch(() => {});
    return import("./pages/village-shop");
  },
  // The PvP flow (#647 PR 2), its own chunks: the attack (its board's tile art reads the renderer's manifest, asked for with
  // the code), the result, a replay, a match, the league.
  pvp: pvp,
  "pvp/result/:id": () => import("./pages/pvp-result"),
  "pvp/replay/:attacker/:id": () => import("./pages/pvp-replay"),
  // A match (#786), its own chunk; its board's tile art reads the renderer's manifest, asked for with the code.
  "pvp/match/:id": () => {
    void manifestBody(RENDERER_ASSETS).catch(() => {});
    return import("./pages/pvp-match");
  },
  "pvp/league": () => import("./pages/pvp-league"),
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
  missions: () => import("./pages/missions"),
  vault: () => import("./pages/vault"),
  // The Social page (#952), its own chunk; each of its tabs is a chunk of its own, loaded by the page.
  social: () => import("./pages/social"),
  referral: () => import("./pages/referral"),
  "settings/theme": () => import("./pages/theme"),
  "settings/theme/:theme": () => import("./pages/theme-shop"),
  "settings/tiles": () => import("./pages/my-tiles"),
  "settings/credits": () => import("./pages/credits"),
  settings: () => import("./pages/settings"),
};
