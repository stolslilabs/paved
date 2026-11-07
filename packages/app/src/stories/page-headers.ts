/**
 * HEADER-HEIGHT (#676): the stories of `Pages/Headers` (by story id, after `pages-headers--`) and the routes each renders.
 * Together they cover every route of the route map but the game scenes' (`routes/pages.ts`: the boards, and the ends of a game
 * whose bar is the board's HUD since #720, and the home, the village's game scene since #753; a match's page has the pages' header
 * since MATCH-PAGE); a test keeps them in step, and
 * `scripts/header-sweep.ts` fails on a page listed here without its story, or a story not listed.
 */
export const PAGE_HEADER_STORIES = {
  play: ["play"],
  purchase: ["play/challenge"],
  avatar: ["avatar"],
  village: ["village/:player"],
  "village-shop": ["village/shop"],
  "pvp-result": ["pvp/result/:id"],
  "pvp-league": ["pvp/league"],
  "pvp-match": ["pvp/match/:id"],
  "story-campaigns": ["story"],
  missions: ["missions"],
  tiles: ["tiles"],
  vault: ["vault"],
  chat: ["chat", "chat/private/:player", "chat/:tab"],
  guild: ["guild"],
  friends: ["friends"],
  referral: ["referral"],
  themes: ["settings/theme"],
  credits: ["settings/credits"],
  settings: ["settings"],
} as const satisfies Record<string, readonly string[]>;

/** The pages laid out as a hero (the board's render behind the wordmark): their content does not start after the header. */
export const HERO_PAGES: readonly string[] = [];

/**
 * The pages drawn as the HUD's drawer (MISSIONS-PAGE, `PageDef.drawer`): their header is the drawer's band (its title, the page's
 * balances at its end), not `PageHeader`, and its height is the band's own, not `--header-h`.
 */
export const DRAWER_PAGES: readonly string[] = ["avatar", "pvp-league", "missions", "village-shop", "tiles", "chat", "guild", "friends", "settings", "themes", "credits", "play", "purchase", "vault"];
