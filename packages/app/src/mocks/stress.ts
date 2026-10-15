import type { IndexedGame, LeaderboardEntry, VaultPosition } from "@paved/chain";
import { PLAYER_GAMES } from "./leaderboard";
import { LEADERBOARD_TODAY } from "./players";
import { VAULT_HELD } from "./vault";

/**
 * WRAP360's stress text: what a screen gets at its worst, for the `Stress` stories. Each text-showing component has
 * one, so `scripts/wrap-sweep.ts` sees it at 360 and 320 px.
 */

/** A long sentence: a description, a hint, a notice. */
export const LONG_SENTENCE =
  "This sentence is far longer than any label the design planned for, so it has to wrap over several lines on a phone without pushing anything off screen.";

/** A long label: a title, a name of a mode, a quest. */
export const LONG_LABEL = "An unusually long label that does not fit on one line";

/** A full Starknet address: 0x and 64 hex digits, 66 characters with no break opportunity. */
export const LONG_ADDRESS = "0x07a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f";

/** A German-style compound: one long word with no break opportunity. */
export const LONG_WORD = "Donaudampfschifffahrtsgesellschaftskapitänskajütenschlüssel";

/** A Cartridge username at its longest (31 characters). */
export const LONG_NAME = "stonemaster_of_the_long_roads31";

/** Large figures: a score, a count, a token amount in 18 decimals ($TILE, vPAVED), one in 6 (USDC). */
export const BIG_NUMBER = 987_654_321;
/** A score beyond any real game (six digits): the HUD, the ranking and the over screen. */
export const BIG_SCORE = 999_999;
export const BIG_AMOUNT_18 = 123_456_789_012_345_678_901_234_567n;
export const BIG_AMOUNT_6 = 98_765_432_109_876n;

/** Ranked rows at their widest: the longest username, a player with no username (a full address), large figures. */
export const STRESS_ENTRIES: LeaderboardEntry[] = [
  { ...LEADERBOARD_TODAY.entries[0], name: LONG_NAME, bestScore: BIG_SCORE },
  { ...LEADERBOARD_TODAY.entries[1], playerId: LONG_ADDRESS, name: null, bestScore: BIG_SCORE, gamesPlayed: 999 },
  { ...LEADERBOARD_TODAY.entries[2], name: LONG_WORD, bestScore: BIG_SCORE, rank: 3 },
  { ...LEADERBOARD_TODAY.entries[2], playerId: `${LONG_ADDRESS.slice(0, -1)}0`, name: LONG_NAME, bestScore: BIG_SCORE, rank: 99_999, gamesPlayed: 999 },
];

/** A player's games with the widest ids and scores. */
export const STRESS_GAMES: IndexedGame[] = PLAYER_GAMES.map((g) => ({ ...g, gameId: BIG_NUMBER - g.gameId, score: g.over ? BIG_SCORE : 0 }));

/** A Vault position with the largest amounts. */
export const STRESS_VAULT: VaultPosition = { ...VAULT_HELD, shares: BIG_AMOUNT_18, value: BIG_AMOUNT_18, maxWithdraw: BIG_AMOUNT_18, totalAssets: BIG_AMOUNT_18 * 10n };
