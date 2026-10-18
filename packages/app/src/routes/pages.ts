/**
 * The route map of `docs/client/v2-architecture.md` section 6.1: one empty placeholder page per route.
 * `nav` is the bottom-navigation tab a route belongs to; `null` is a full-screen flow (a top bar with Back,
 * no tabs).
 */
export type Tab = "home" | "ranks" | "quests" | "vault" | "settings";

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
  { path: "game/:gameId", title: "Board", nav: null },
  { path: "training", title: "Training", nav: null },
  { path: "tutorial", title: "Tutorial", nav: null },
  { path: "game/:gameId/over", title: "Game over", nav: null },
  { path: "training/over", title: "Game over", nav: null },
  { path: "leaderboard/:day?", title: "Leaderboard", nav: "ranks" },
  { path: "player/:id", title: "Player", nav: "ranks" },
  // The static `missions/lifetime` first: `prefetch` matches in table order, and `:day?` would take "lifetime".
  { path: "missions/lifetime", title: "Missions", nav: "quests" },
  { path: "missions/:day?", title: "Missions", nav: "quests" },
  { path: "vault", title: "Vault", nav: "vault" },
  { path: "referral", title: "Referral", nav: "settings" },
  { path: "settings/theme", title: "Theme", nav: "settings" },
  { path: "settings/credits", title: "Credits", nav: "settings" },
  { path: "settings", title: "Settings", nav: "settings" },
] as const;

export const TABS: readonly { id: Tab; label: string; to: string }[] = [
  { id: "home", label: "Home", to: "/" },
  { id: "ranks", label: "Ranks", to: "/leaderboard" },
  { id: "quests", label: "Missions", to: "/missions" },
  { id: "vault", label: "Vault", to: "/vault" },
  { id: "settings", label: "Settings", to: "/settings" },
];
