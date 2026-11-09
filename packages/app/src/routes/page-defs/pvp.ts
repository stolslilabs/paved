import type { PageDef } from "../pages";

/** The PvP flow. A run of `PAGES` (`routes/pages.ts`), which keeps the table's order. */
export const PVP_PAGES: readonly PageDef[] = [
  // The PvP flow (#647): the attack (search, scout, attack), its result, a replay, a match (#786), the league. The defence log's
  // page is gone (BACK-RULE #783, then #786's cards in the league): its old link lands on the league (`router.tsx`).
  { path: "pvp", title: "Attack", nav: null },
  { path: "pvp/result/:id", title: "Result", nav: null },
  { path: "pvp/replay/:attacker/:id", title: "Replay", nav: null },
  // A match of the League's list (#786): the attacked village from its snapshot and the attack's build. Back goes up to the League.
  // MATCH-PAGE: its scene draws its header, "Battle log" (the Paved UX Book's); this title, shown nowhere, stays short (first load).
  { path: "pvp/match/:id", title: "Match", nav: null, parent: "/pvp/league" },
  // The HUD's drawer at every width, docked at the left from `tablet`, under the HUD's crowns (LEAGUE-PAGE).
  { path: "pvp/league", title: "League", nav: "league", panel: true, panelSide: "left", drawer: true },
];
