/**
 * HEADER-HEIGHT (#676): the stories of `Pages/Headers` (by story id, after `pages-headers--`) and the routes each renders.
 * Together they cover every route of the route map but the game scenes' (`routes/pages.ts`: the boards, and the ends of a game
 * whose bar is the board's HUD since #720, and the home, the village's game scene since #753); a test keeps them in step, and
 * `scripts/header-sweep.ts` fails on a page listed here without its story, or a story not listed.
 */
export const PAGE_HEADER_STORIES = {
  welcome: ["welcome"],
  play: ["play"],
  purchase: ["play/challenge"],
  cobbles: ["cobbles"],
  avatar: ["avatar"],
  village: ["village/:player"],
  "village-chests": ["village/chests"],
  "village-shop": ["village/shop"],
  "pvp-result": ["pvp/result/:id"],
  "pvp-league": ["pvp/league"],
  "story-campaigns": ["story"],
  missions: ["missions"],
  vault: ["vault"],
  chat: ["chat"],
  guild: ["guild"],
  friends: ["friends"],
  referral: ["referral"],
  themes: ["settings/theme"],
  "theme-shop": ["settings/theme/:theme"],
  "my-tiles": ["settings/tiles"],
  credits: ["settings/credits"],
  settings: ["settings"],
} as const satisfies Record<string, readonly string[]>;

/** The pages laid out as a hero (the board's render behind the wordmark): their content does not start after the header. */
export const HERO_PAGES: readonly string[] = ["welcome"];
