/**
 * The route map of `docs/client/v2-architecture.md` section 6.1: one empty placeholder page per route.
 * `nav` is the bottom-navigation tab a route belongs to; `null` is a full-screen flow (a top bar with Back,
 * no tabs).
 */
/**
 * The navigation's five destinations (#623): Home, Missions, Play, Vault, Settings. `play` opens the mode choice, a
 * full-screen flow (`nav: null`), so no page shows it as the current one; the four others are tabs of pages.
 */
export type Tab = "home" | "quests" | "play" | "vault" | "settings";

export interface PageDef {
  /** The route path, relative to the root. */
  path: string;
  title: string;
  /** The tab shown as active, or `null` for a full-screen flow. */
  nav: Tab | null;
}

export const PAGES: readonly PageDef[] = [
  { path: "welcome", title: "Welcome", nav: null },
  { path: "", title: "Home", nav: "home" },
  { path: "play", title: "Play", nav: null },
  { path: "play/challenge", title: "Purchase", nav: null },
  { path: "cobbles", title: "Cobbles", nav: null },
  { path: "avatar", title: "Avatar", nav: null },
  { path: "village", title: "Village", nav: null },
  { path: "village/:player", title: "Village", nav: null },
  { path: "game/:gameId", title: "Board", nav: null },
  // The PvP flow (#647): the attack (search, scout, attack), its result, a replay, the defence log, the league.
  { path: "pvp", title: "Attack", nav: null },
  { path: "pvp/result/:id", title: "Result", nav: null },
  { path: "pvp/replay/:attacker/:id", title: "Replay", nav: null },
  { path: "pvp/defence", title: "Defence log", nav: null },
  { path: "pvp/league", title: "League", nav: null },
  { path: "training", title: "Training", nav: null },
  { path: "story", title: "Story", nav: null },
  { path: "story/:campaign/:level", title: "Story", nav: null },
  { path: "game/:gameId/over", title: "Game over", nav: null },
  { path: "training/over", title: "Game over", nav: null },
  // The static `missions/lifetime` first: `prefetch` matches in table order, and `:day?` would take "lifetime".
  { path: "missions/lifetime", title: "Missions", nav: "quests" },
  { path: "missions/:day?", title: "Missions", nav: "quests" },
  { path: "vault", title: "Vault", nav: "vault" },
  { path: "referral", title: "Referral", nav: "settings" },
  { path: "settings/theme", title: "Themes", nav: "settings" },
  { path: "settings/theme/:theme", title: "Theme", nav: "settings" },
  { path: "settings/tiles", title: "My tiles", nav: "settings" },
  { path: "settings/credits", title: "Credits", nav: "settings" },
  { path: "settings", title: "Settings", nav: "settings" },
] as const;

export const TABS: readonly { id: Tab; label: string; to: string }[] = [
  { id: "home", label: "Home", to: "/" },
  { id: "quests", label: "Missions", to: "/missions" },
  { id: "play", label: "Play", to: "/play" },
  { id: "vault", label: "Vault", to: "/vault" },
  { id: "settings", label: "Settings", to: "/settings" },
];
