// Another player's public profile (#952) is the URL's `?player=<id>` (`player-profile.tsx`). The router and the home's host
// write the literal, so that this module stays out of the first load.

/** The search parameter that holds the player whose profile is open. */
export const PLAYER_PARAM = "player";

/**
 * What an opening leaves in the history entry: Close then goes Back, so the entry before is not left twice. `views`
 * (DRAWER-NAV-IN-PLACE, #1064): how many pages the app opened in a row (a profile, its guild, a member...), so that the drawer they
 * share when none was open leaves them all at once.
 */
export interface PlayerSheetState {
  playerSheet?: true;
  views?: number;
}

/** The pages opened in a row before this entry's (`PlayerSheetState.views`). */
export const viewsOf = (state: unknown): number => (state as PlayerSheetState | null)?.views ?? 0;
