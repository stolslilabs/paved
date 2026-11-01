/**
 * The route map of `docs/client/v2-architecture.md` section 6.1: one empty placeholder page per route.
 * `nav` is the bottom-navigation tab a route belongs to; `null` is a full-screen flow (a top bar with Back,
 * no tabs).
 */
/**
 * The navigation's destinations. Below `desktop` the bar holds Shop, Chests, Play, League, Settings (`BAR_TABS`, #763); from it
 * the navigation is the home's overlay (DESK-PANELS, #762: no header, no bar). `play` opens the mode choice (`nav: null`), so no
 * page shows it as the current one; the others are tabs of pages. The home, Missions, the Vault, Chat, Guild and Friends are not
 * in the phone's bar: the home's overlay leads to them, the pages' Back to the home (#760).
 */
export type Tab = "home" | "quests" | "vault" | "shop" | "chests" | "play" | "league" | "settings" | "chat" | "guild" | "friends";

export interface PageDef {
  /** The route path, relative to the root. */
  path: string;
  title: string;
  /** The tab shown as active, or `null` for a full-screen flow. */
  nav: Tab | null;
  /**
   * Where Back leads (BACK-RULE #783, `useBack`): the page's parent, one level up; omitted, the home (`/`, the village). So Back
   * reaches the village in two steps at most. Only a sheet (`sheet`) or a flow names one.
   */
  parent?: string;
  /**
   * BACK-RULE (#783, the owner's decisions of 2026-10-26: no page opens another page): the page is a sheet over its parent
   * (`parent`), not a page of its own. Its URL stays, so a link opens it over the parent; its close goes up to the parent
   * (`routes/page-sheets.tsx`). A move from one sheet to another replaces the entry, so the close still lands on the parent.
   */
  sheet?: true;
  /**
   * DESK-PANELS (#762, the owner's decisions of 2026-10-25): from `desktop` the page opens in the side panel on the right, over the
   * home's village, which stays mounted (`routes/home-layout.tsx`): the overlay's pages and the pages reached from them. Below
   * `desktop` it is a full page, as the others. Its route is a child of the home's.
   */
  panel?: true;
  /**
   * The panel's side from `desktop`: `left` for the League (#829, the owner's decision of 2026-10-27), whose button is on the home's
   * left, as the profile's sheet; omitted, the right.
   */
  panelSide?: "left";
}

export const PAGES: readonly PageDef[] = [
  { path: "welcome", title: "Welcome", nav: null },
  { path: "", title: "Home", nav: "home" },
  { path: "play", title: "Play", nav: null, panel: true },
  // A flow opened from Play: Back goes up to it.
  { path: "play/challenge", title: "Purchase", nav: null, parent: "/play" },
  { path: "cobbles", title: "Cobbles", nav: null, panel: true },
  { path: "avatar", title: "Avatar", nav: null },
  // The v2 village's chests and daily shop (#739), before `village/:player`: `prefetch` matches in table order.
  { path: "village/chests", title: "Chests", nav: "chests", panel: true },
  { path: "village/shop", title: "Tile shop", nav: "shop", panel: true },
  { path: "village/:player", title: "Village", nav: null },
  { path: "game/:gameId", title: "Board", nav: null },
  // The PvP flow (#647): the attack (search, scout, attack), its result, a replay, a match (#786), the league. The defence log's
  // page is gone (BACK-RULE #783, then #786's cards in the league): its old link lands on the league (`router.tsx`).
  { path: "pvp", title: "Attack", nav: null },
  { path: "pvp/result/:id", title: "Result", nav: null },
  { path: "pvp/replay/:attacker/:id", title: "Replay", nav: null },
  // A match of the League's list (#786): the attacked village from its snapshot and the attack's build. Back goes up to the League.
  { path: "pvp/match/:id", title: "Match", nav: null, parent: "/pvp/league" },
  { path: "pvp/league", title: "League", nav: "league", panel: true, panelSide: "left" },
  { path: "training", title: "Training", nav: null },
  // Story's campaigns, a sheet over Play's mode choice (BACK-RULE #783); a level is a full-screen flow.
  { path: "story", title: "Story", nav: null, parent: "/play", sheet: true, panel: true },
  { path: "story/:campaign/:level", title: "Story", nav: null },
  { path: "game/:gameId/over", title: "Game over", nav: null },
  { path: "training/over", title: "Game over", nav: null },
  // Missions (#832): one page, today's limited missions and the lifetime ones; the old `/missions/lifetime` and `/missions/:day`
  // land on it (`router.tsx`).
  { path: "missions", title: "Missions", nav: "quests", panel: true },
  { path: "vault", title: "Vault", nav: "vault", panel: true },
  // The social features (#952), a page each since #973 in place of the Social page's tabs (its old links land on them, `router.tsx`):
  // the chat, the guild, the friends. The home's buttons open them, in the right panel from `desktop` (open point 2's default).
  { path: "chat", title: "Chat", nav: "chat", panel: true },
  { path: "guild", title: "Guild", nav: "guild", panel: true },
  { path: "friends", title: "Friends", nav: "friends", panel: true },
  // Settings' sheets (BACK-RULE #783): drawn over Settings, each closing to it, a theme's too.
  { path: "referral", title: "Referral", nav: "settings", parent: "/settings", sheet: true, panel: true },
  { path: "settings/theme", title: "Themes", nav: "settings", parent: "/settings", sheet: true, panel: true },
  { path: "settings/theme/:theme", title: "Theme", nav: "settings", parent: "/settings", sheet: true, panel: true },
  { path: "settings/tiles", title: "My tiles", nav: "settings", parent: "/settings", sheet: true, panel: true },
  { path: "settings/credits", title: "Credits", nav: "settings", parent: "/settings", sheet: true, panel: true },
  { path: "settings", title: "Settings", nav: "settings", panel: true },
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
  { id: "chat", label: "Chat", to: "/chat" },
  { id: "guild", label: "Guild", to: "/guild" },
  { id: "friends", label: "Friends", to: "/friends" },
];

/** The phone's bar, left to right (#763, the owner's decision of 2026-10-25): Play in the centre. The tab swipe follows it. */
export const BAR_TABS: readonly Tab[] = ["shop", "chests", "play", "league", "settings"];
