import { HOME_PAGES } from "./page-defs/home";
import { PVP_PAGES } from "./page-defs/pvp";
import { MODE_PAGES } from "./page-defs/modes";
import { DRAWER_PAGES } from "./page-defs/drawers";
import { SOCIAL_PAGES } from "./page-defs/social";
import { SETTINGS_PAGES } from "./page-defs/settings";

/**
 * The route map of `docs/client/v2-architecture.md` section 6.1: one empty placeholder page per route.
 * `nav` is the bottom-navigation tab a route belongs to; `null` is a full-screen flow (a top bar with Back,
 * no tabs).
 */
/**
 * The navigation's destinations. The dock holds Shop, Ranking, Play, Guild, Settings (`NAV_TABS` of `containers/app-nav.tsx`, #763,
 * HOME-DOCK), on the home alone (DOCK-UNDER-PAGES, the owner's ask of 2026-11-04: no page carries it). `play` opens the mode choice
 * (`nav: null`); Ranking opens the Leaderboard (LEADERBOARD-PAGE); the others are tabs of pages. The home, Missions, the Vault, League, Chat and Friends are not in the dock: the home's
 * overlay leads to them, the pages' Back to the home (#760).
 */
export type Tab = "home" | "quests" | "vault" | "shop" | "ranking" | "play" | "league" | "settings" | "chat" | "guild" | "friends";

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
  /**
   * MISSIONS-PAGE (the owner's pattern of 2026-11-02, the profile's: a page is a side panel on a large screen and a full page with
   * Back on a phone): the page is the HUD's drawer over the home at every width (`containers/hud-drawer.tsx`, `routes/home-hosts.tsx`),
   * the home's village kept under it: a full page sliding in on a phone, a side panel docked at the edge of its HUD control from
   * `tablet` (Missions at the right, the League at the left, LEAGUE-PAGE: the scene names its side). Its route is a child of the
   * home's (`panel`), never in the desktop's panel.
   */
  drawer?: true;
}

/**
 * The route table, in its order (`prefetch` matches in table order; the panels' and drawers' lists follow it): one run of pages
 * per area, each in its own file (`routes/page-defs/`).
 */
export const PAGES: readonly PageDef[] = [
  ...HOME_PAGES,
  ...PVP_PAGES,
  ...MODE_PAGES,
  ...DRAWER_PAGES,
  ...SOCIAL_PAGES,
  ...SETTINGS_PAGES,
] as const;

export const TABS: readonly { id: Tab; label: string; to: string }[] = [
  { id: "home", label: "Home", to: "/" },
  { id: "quests", label: "Missions", to: "/missions" },
  { id: "vault", label: "Vault", to: "/vault" },
  { id: "shop", label: "Shop", to: "/village/shop" },
  { id: "play", label: "Play", to: "/play" },
  { id: "league", label: "League", to: "/pvp/league" },
  { id: "settings", label: "Settings", to: "/settings" },
  { id: "chat", label: "Chat", to: "/chat" },
  { id: "guild", label: "Allegiance", to: "/guild" },
  { id: "friends", label: "Friends", to: "/friends" },
  { id: "ranking", label: "Ranking", to: "/ranking" },
];

