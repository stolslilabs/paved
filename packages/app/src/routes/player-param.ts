// Another player's public profile (#952) is the URL's `?player=<id>` (`player-profile.tsx`). The router and the home's host
// write the literal, so that this module stays out of the first load.

/** The search parameter that holds the player whose profile is open. */
export const PLAYER_PARAM = "player";

/** What an opening leaves in the history entry: Close then goes Back, so the entry before is not left twice. */
export interface PlayerSheetState {
  playerSheet?: true;
}
