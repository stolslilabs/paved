import type { PageDef } from "../pages";

/** The social pages: the chat, the guild, the friends, the ranking. A run of `PAGES` (`routes/pages.ts`), which keeps the table's order. */
export const SOCIAL_PAGES: readonly PageDef[] = [
  // The social features (#952), a page each since #973 in place of the Social page's tabs (its old links land on them, `router.tsx`):
  // the chat, the guild, the friends. The home's buttons open them, in the right panel from `desktop` (open point 2's default).
  // The chat's tabs (#973): `/chat` opens on the last one used, `/chat/<tab>` names one, `/chat/private/<player>` a private
  // conversation over the Private tab's list; one component (`page-loaders.ts`), so a move between them keeps the page.
  // CHAT-PAGE: the HUD's drawer at every width, docked at the left from `tablet`, beside the home's Chat tab (the League's rule).
  { path: "chat", title: "Chat", nav: "chat", panel: true, drawer: true },
  { path: "chat/private/:player", title: "Chat", nav: "chat", panel: true, drawer: true },
  // A mail of the Inbox (the Private tab, the system's mail beside the DMs): a Puzzle prize's, over the tab's list.
  { path: "chat/mail/:mail", title: "Chat", nav: "chat", panel: true, drawer: true },
  { path: "chat/:tab", title: "Chat", nav: "chat", panel: true, drawer: true },
  // The Guild (GUILD-PAGE, the book's "Run my guild"): the HUD's drawer at every width, docked at the right from `tablet`, as the Shop.
  { path: "guild", title: "Allegiance", nav: "guild", panel: true, drawer: true },
  // FRIENDS-PAGE: the HUD's drawer at every width, docked at the right from `tablet`, as the home's Friends button.
  { path: "friends", title: "Friends", nav: "friends", panel: true, drawer: true },
  // The Leaderboard (LEADERBOARD-PAGE, the dock's Ranking): the HUD's drawer at every width, docked at the right from `tablet`, as the
  // dock's other pages. Its tabs (Players, Guilds) are the URL's `?tab=`.
  { path: "ranking", title: "Ranking", nav: "ranking", panel: true, drawer: true },
];
