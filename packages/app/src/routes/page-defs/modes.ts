import type { PageDef } from "../pages";

/** The other modes (Training, Story, the Puzzle) and the games' ends. A run of `PAGES` (`routes/pages.ts`), which keeps the table's order. */
export const MODE_PAGES: readonly PageDef[] = [
  { path: "training", title: "Training", nav: null },
  // Story's campaigns (STORY-PAGE): a view of Play's drawer, as the stake (one loader), its Back up to the modes; a level is a full-screen flow.
  { path: "story", title: "Story", nav: null, parent: "/play", panel: true, drawer: true },
  { path: "story/:campaign/:level", title: "Story", nav: null },
  // The Puzzle (Play's Limited mode): a view of Play's drawer, as Story's campaigns (one loader), its Back up to the modes; a game is a
  // full-screen flow, its end too.
  { path: "play/puzzle", title: "Puzzle", nav: null, parent: "/play", panel: true, drawer: true },
  { path: "puzzle/:gameId", title: "Puzzle", nav: null },
  { path: "puzzle/:gameId/over", title: "Game over", nav: null },
  { path: "game/:gameId/over", title: "Game over", nav: null },
  { path: "training/over", title: "Game over", nav: null },
];
