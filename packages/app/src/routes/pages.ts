/**
 * The route map of `docs/client/v2-architecture.md` section 6.1: one empty placeholder page per route.
 * `nav` is the bottom-navigation tab a route belongs to; `null` is a full-screen flow (a top bar with Back,
 * no tabs).
 */
/**
 * The navigation's destinations. Below `desktop` the bar holds Shop, Chests, Play, League, Settings (`BAR_TABS`, #763); from it
 * the header holds Home, Missions, Vault, Settings (`HEADER_TABS`, #623, #668) until #762. `play` opens the mode choice, a
 * full-screen flow (`nav: null`), so no page shows it as the current one; the others are tabs of pages. The home, Missions and
 * the Vault are not in the phone's bar: the home's overlay leads to the two, the pages' Back to the home (#760).
 */
export type Tab = "home" | "quests" | "vault" | "shop" | "chests" | "play" | "league" | "settings";

export interface PageDef {
  /** The route path, relative to the root. */
  path: string;
  title: string;
  /** The tab shown as active, or `null` for a full-screen flow. */
  nav: Tab | null;
  /**
   * Where Back leads when the page has no earlier in-app entry (a link, a reload; PAGE-HEADER, #760): the page's parent.
   * Omitted, the home (`/`, the village).
   */
  parent?: string;
}

export const PAGES: readonly PageDef[] = [
  { path: "welcome", title: "Welcome", nav: null },
  { path: "", title: "Home", nav: "home" },
  { path: "play", title: "Play", nav: null },
  { path: "play/challenge", title: "Purchase", nav: null },
  { path: "cobbles", title: "Cobbles", nav: null },
  { path: "avatar", title: "Avatar", nav: null },
  // The v2 village's chests and daily shop (#739), before `village/:player`: `prefetch` matches in table order.
  { path: "village/chests", title: "Chests", nav: "chests" },
  { path: "village/shop", title: "Tile shop", nav: "shop" },
  { path: "village/:player", title: "Village", nav: null },
  { path: "game/:gameId", title: "Board", nav: null },
  // The PvP flow (#647): the attack (search, scout, attack), its result, a replay, the defence log, the league.
  { path: "pvp", title: "Attack", nav: null },
  { path: "pvp/result/:id", title: "Result", nav: null },
  { path: "pvp/replay/:attacker/:id", title: "Replay", nav: null },
  // Under the League's tab (#763): the defence log is reached from the league page.
  { path: "pvp/defence", title: "Defence log", nav: "league" },
  { path: "pvp/league", title: "League", nav: "league" },
  { path: "training", title: "Training", nav: null },
  { path: "story", title: "Story", nav: null },
  { path: "story/:campaign/:level", title: "Story", nav: null },
  { path: "game/:gameId/over", title: "Game over", nav: null },
  { path: "training/over", title: "Game over", nav: null },
  // The static `missions/lifetime` first: `prefetch` matches in table order, and `:day?` would take "lifetime".
  { path: "missions/lifetime", title: "Missions", nav: "quests" },
  { path: "missions/:day?", title: "Missions", nav: "quests" },
  { path: "vault", title: "Vault", nav: "vault" },
  { path: "referral", title: "Referral", nav: "settings", parent: "/settings" },
  { path: "settings/theme", title: "Themes", nav: "settings", parent: "/settings" },
  { path: "settings/theme/:theme", title: "Theme", nav: "settings", parent: "/settings/theme" },
  { path: "settings/tiles", title: "My tiles", nav: "settings", parent: "/settings" },
  { path: "settings/credits", title: "Credits", nav: "settings", parent: "/settings" },
  { path: "settings", title: "Settings", nav: "settings" },
] as const;

export const TABS: readonly { id: Tab; label: string; to: string }[] = [
  { id: "home", label: "Home", to: "/" },
  { id: "quests", label: "Missions", to: "/missions" },
  { id: "vault", label: "Vault", to: "/vault" },
  { id: "shop", label: "Shop", to: "/village/shop" },
  { id: "chests", label: "Chests", to: "/village/chests" },
  { id: "play", label: "Play", to: "/play" },
  { id: "league", label: "League", to: "/pvp/league" },
  { id: "settings", label: "Settings", to: "/settings" },
];

/** The phone's bar, left to right (#763, the owner's decision of 2026-10-25): Play in the centre. The tab swipe follows it. */
export const BAR_TABS: readonly Tab[] = ["shop", "chests", "play", "league", "settings"];

/** The header's items from `desktop`, left to right (#668: no Play there), until the desktop's overlay navigation (#762). */
export const HEADER_TABS: readonly Tab[] = ["home", "quests", "vault", "settings"];
