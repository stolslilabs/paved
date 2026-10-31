// A player name's length (owner, 2026-10-31: 19 on #928, then 15 for the badge's name plate): at most 15 characters, guarded
// where a name is made: the mock's
// `setName` refuses a longer one and `playerName` never draws one. A module of its own, so a reader of the limit does not
// take the name lists of `player-names.ts`.

/** The most characters a player name has. */
export const PLAYER_NAME_MAX = 15;
