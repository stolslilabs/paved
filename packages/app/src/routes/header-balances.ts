import type { PageDef } from "./pages";

/** Which balances a page's header shows: the home's (`home`, the same on every page) or none (`none`, the game scenes). */
export type HeaderBalances = "home" | "none";

/**
 * HEADER-BALANCES (#720), revised by ONE-HEADER (#781, the owner's decisions of 2026-10-26): every page shows the home's balances
 * in the home's format, the Cobbles' pill below `desktop` and every balance's rail from it, in its header's row (`PageHeader`). The
 * game scenes show none: the boards, the ends of a game, the PvP attack's flow (`pvp`: the search, the scout, the attack), its
 * result and a replay (#647). The one place that says it, by route.
 */
export const HEADER_BALANCES: Record<PageDef["path"], HeaderBalances> = {
  welcome: "home",
  "": "home",
  play: "home",
  "play/challenge": "home",
  cobbles: "home",
  avatar: "home",
  "village/:player": "home",
  "village/chests": "home",
  "village/shop": "home",
  "game/:gameId": "none",
  training: "none",
  story: "home",
  "story/:campaign/:level": "none",
  "game/:gameId/over": "none",
  "training/over": "none",
  "missions/lifetime": "home",
  "missions/:day?": "home",
  vault: "home",
  referral: "home",
  "settings/theme": "home",
  "settings/theme/:theme": "home",
  "settings/tiles": "home",
  "settings/credits": "home",
  settings: "home",
  pvp: "none",
  "pvp/result/:id": "none",
  "pvp/replay/:attacker/:id": "none",
  "pvp/match/:id": "none",
  "pvp/league": "home",
};

/** Whether a page shows no balance at all, so the shell reads none for it; "not found" (no page) shows the home's. */
export const showsNoBalance = (page: PageDef | null): boolean => page !== null && HEADER_BALANCES[page.path] === "none";
