// Where the reads are served from (#549, MOCK-FIRST): the one switch of the mock layer (`data/mock/`). No chain code here: the
// first bundle reads it (the shell's "Mock" mark). What each source serves, and the rule that picks one: `source-of.ts`.

import { dataSourceOf, type DataSourceName } from "./source-of";

export { MOCK_BY_DEFAULT, dataSourceOf, type DataSourceName } from "./source-of";

/** This build's source: `VITE_DATA_SOURCE`, else the default of `VITE_NETWORK` (the dev server without one is devnet: `chain`). */
export const DATA_SOURCE: DataSourceName = dataSourceOf({
  source: import.meta.env.VITE_DATA_SOURCE,
  network: import.meta.env.VITE_NETWORK || (import.meta.env.DEV ? "devnet" : ""),
});

/** The mock serves this build's data: the pages show the "Mock" mark. */
export const MOCKED = DATA_SOURCE === "mock";

/**
 * The pages that read mocked data when the source is `mock` (their header shows the mark): every page of the route map
 * (`routes/pages.ts`) since #927, the leaderboard's, the players' and the game-over pages' indexer included. The mark's text
 * says so (`MOCK_MARK_TEXT`). Listed here, not read from the route map: this module is the first bundle's, and the test checks
 * the two agree.
 */
export const MOCKED_PAGES: ReadonlySet<string> = new Set(["welcome", "", "play", "play/challenge", "cobbles", "avatar", "village/chests", "village/shop", "village/:player", "game/:gameId", "pvp", "pvp/result/:id", "pvp/replay/:attacker/:id", "pvp/match/:id", "pvp/league", "training", "story", "story/:campaign/:level", "game/:gameId/over", "training/over", "missions", "vault", "referral", "settings/theme", "settings/theme/:theme", "settings/tiles", "settings/credits", "settings"]);
