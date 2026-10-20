import type { VaultPosition } from "@paved/chain";
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

/** Large figures: a score, a count, a token amount in 18 decimals (PAVED, vPAVED), one in 6 (USDC). */
export const BIG_NUMBER = 987_654_321;
/** A score beyond any real game (six digits): the HUD and the over screen. */
export const BIG_SCORE = 999_999;
export const BIG_AMOUNT_18 = 123_456_789_012_345_678_901_234_567n;
export const BIG_AMOUNT_6 = 98_765_432_109_876n;

/** A Vault position with the largest amounts. */
export const STRESS_VAULT: VaultPosition = { ...VAULT_HELD, shares: BIG_AMOUNT_18, value: BIG_AMOUNT_18, maxWithdraw: BIG_AMOUNT_18, totalAssets: BIG_AMOUNT_18 * 10n };
