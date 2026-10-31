// A player name's length (owner, 2026-10-31, on #928): at most 19 characters, guarded where a name is made: the mock's
// `setName` refuses a longer one and `playerName` never draws one. A module of its own, so a reader of the limit does not
// take the name lists of `player-names.ts`.

/** The most characters a player name has. */
export const PLAYER_NAME_MAX = 19;
