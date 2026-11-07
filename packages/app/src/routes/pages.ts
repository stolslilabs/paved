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

export const PAGES: readonly PageDef[] = [
  { path: "", title: "Home", nav: "home" },
  // Play (PLAY-PAGE): the HUD's drawer at every width, docked at the right from `tablet`, as the Shop. Its stake is a view of the same page
  // (one loader, `page-loaders.ts`), its Back up to the modes.
  { path: "play", title: "Play", nav: null, panel: true, drawer: true },
  { path: "play/challenge", title: "Challenge", nav: null, parent: "/play", panel: true, drawer: true },
  // The avatar editor (AVATAR-PAGE, the Paved UX Book's "avatar-editor"), from the Profile's Avatar: the HUD's drawer docked at the left
  // from `tablet`, as the Profile; its Back returns to the Profile (`useBackToProfile`), its cross to the village.
  { path: "avatar", title: "Avatar", nav: null, panel: true, panelSide: "left", drawer: true },
  // The v2 village's daily shop (#739), before `village/:player`: `prefetch` matches in table order. Its chests open where they are
  // won (END-CHEST, the owner's ask of 2026-11-06: the Chests page gone).
  // The Shop (SHOP-PAGE): Tiles, Cobbles and Themes as tabs (`?tab=`), the HUD's drawer docked at the right from `tablet`.
  { path: "village/shop", title: "Shop", nav: "shop", panel: true, drawer: true },
  { path: "village/:player", title: "Village", nav: null },
  { path: "game/:gameId", title: "Board", nav: null },
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
  { path: "training", title: "Training", nav: null },
  // Story's campaigns, a sheet over Play's mode choice (BACK-RULE #783), Play's drawer kept under it (PLAY-PAGE); a level is a full-screen flow.
  { path: "story", title: "Story", nav: null, parent: "/play", sheet: true, panel: true, drawer: true },
  { path: "story/:campaign/:level", title: "Story", nav: null },
  { path: "game/:gameId/over", title: "Game over", nav: null },
  { path: "training/over", title: "Game over", nav: null },
  // Missions (#832): one page, today's limited missions and the lifetime ones; the old `/missions/lifetime` and `/missions/:day`
  // land on it (`router.tsx`). The HUD's drawer at every width, docked at the right from `tablet` (MISSIONS-PAGE).
  { path: "missions", title: "Missions", nav: "quests", panel: true, drawer: true },
  // Tiles (COLLECTION-PAGE, the book's Collection, named after the home's button): the skin each tile wears. The HUD's drawer at every
  // width, docked at the right from `tablet`, under the right column's Tiles; its old Settings sheet `/settings/tiles` lands on it.
  { path: "tiles", title: "Tiles", nav: null, panel: true, drawer: true },
  // The Vault (VAULT-PAGE): the HUD's drawer at every width, docked at the right from `tablet`, beside the home's right column's Vault; its
  // Deposit and Withdraw are the footer's tabs (`?tab=`).
  { path: "vault", title: "Vault", nav: "vault", panel: true, drawer: true },
  // The social features (#952), a page each since #973 in place of the Social page's tabs (its old links land on them, `router.tsx`):
  // the chat, the guild, the friends. The home's buttons open them, in the right panel from `desktop` (open point 2's default).
  // The chat's tabs (#973): `/chat` opens on the last one used, `/chat/<tab>` names one, `/chat/private/<player>` a private
  // conversation over the Private tab's list; one component (`page-loaders.ts`), so a move between them keeps the page.
  // CHAT-PAGE: the HUD's drawer at every width, docked at the left from `tablet`, beside the home's Chat tab (the League's rule).
  { path: "chat", title: "Chat", nav: "chat", panel: true, drawer: true },
  { path: "chat/private/:player", title: "Chat", nav: "chat", panel: true, drawer: true },
  { path: "chat/:tab", title: "Chat", nav: "chat", panel: true, drawer: true },
  // The Guild (GUILD-PAGE, the book's "Run my guild"): the HUD's drawer at every width, docked at the right from `tablet`, as the Shop.
  { path: "guild", title: "Guild", nav: "guild", panel: true, drawer: true },
  // FRIENDS-PAGE: the HUD's drawer at every width, docked at the right from `tablet`, as the home's Friends button.
  { path: "friends", title: "Friends", nav: "friends", panel: true, drawer: true },
  // The Leaderboard (LEADERBOARD-PAGE, the dock's Ranking): the HUD's drawer at every width, docked at the right from `tablet`, as the
  // dock's other pages. Its tabs (Players, Guilds) are the URL's `?tab=`.
  { path: "ranking", title: "Ranking", nav: "ranking", panel: true, drawer: true },
  // Referral (P10): the player's link, reached from the profile's Invite (the Paved UX Book's), no longer a sheet over Settings
  // (SETTINGS-PAGE): a page of its own, in the right panel from `desktop`, Back to the village.
  { path: "referral", title: "Referral", nav: "settings", panel: true },
  // Settings (SETTINGS-PAGE): the HUD's drawer at every width, docked at the right from `tablet` (the dock's right-most button). Its
  // Themes and Credits are views in it, each its own URL, one component (`page-loaders.ts`), so a move between them keeps the drawer.
  // A theme's tiles are the Shop's (SHOP-PAGE).
  { path: "settings/theme", title: "Themes", nav: "settings", panel: true, drawer: true },
  { path: "settings/credits", title: "Credits", nav: "settings", panel: true, drawer: true },
  { path: "settings", title: "Settings", nav: "settings", panel: true, drawer: true },
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
  { id: "guild", label: "Guild", to: "/guild" },
  { id: "friends", label: "Friends", to: "/friends" },
  { id: "ranking", label: "Ranking", to: "/ranking" },
];

