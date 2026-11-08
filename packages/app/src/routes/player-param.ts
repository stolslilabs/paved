// Another player's public profile (#952) is the URL's `?player=<id>` (`player-profile.tsx`). The router and the home's host
// write the literal, so that this module stays out of the first load.

/** The search parameter that holds the player whose profile is open. */
export const PLAYER_PARAM = "player";

/**
 * A page of a chain (DRAWER-NAV-IN-PLACE, #1064): a player's profile (`?player=`) or a guild's page (`?guild=`). The URL names the
 * one on top; the history entry keeps those it covers (`PageViewsState.below`), each kept mounted under it as it was.
 */
export interface PageView {
  kind: "player" | "guild";
  id: string;
}

/**
 * What an opening leaves in the history entry: Close then goes Back, so the entry before is not left twice. `views`: how many pages
 * the app opened in a row, so that the drawer they share when none was open leaves them all at once. `below`: the pages the one on
 * top covers, oldest first.
 */
export interface PlayerSheetState {
  playerSheet?: true;
  guildSheet?: true;
  views?: number;
  below?: PageView[];
}

export type PageViewsState = PlayerSheetState;

/** The pages opened in a row before this entry's (`PlayerSheetState.views`). */
export const viewsOf = (state: unknown): number => (state as PlayerSheetState | null)?.views ?? 0;
