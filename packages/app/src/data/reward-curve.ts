import type { DayView, TermsView } from "@paved/chain";
import type { RewardCurve } from "../components/containers/reward-estimate";

// A bought game's reward curve (#705), for the board's HUD and the over page. Types only besides the arithmetic: the board's
// module is shared with Training, which must not bring the chain or the indexer.

/** The cliff in points x 1,000, `mean x (10,000 + sigma) / 10,000` (`curve::threshold`). */
export const thresholdOf = (mean: number, sigmaBps: number): number => Math.floor((mean * (10_000 + sigmaBps)) / 10_000);

/**
 * A bought game's reward curve: its terms' `R`, `c` and `H` against its day's threshold. The closed day's mean once it is
 * fixed (the reward is then the one a settle mints), else the day's prior, the EMA as of the day's first purchase: an
 * estimate, as the day's own scores move its mean until it closes. Null for a free, expired or settled game, or without its day.
 */
export function curveOf(terms: TermsView | null | undefined, day: DayView | null | undefined): RewardCurve | null {
  if (!terms || terms.stake === 0 || terms.expired || terms.settled || !day) return null;
  const mean = day.closed ? day.mean : day.prior;
  if (mean === 0) return null;
  return { reference: terms.reference, threshold: thresholdOf(mean, terms.sigmaBps), slopeBps: terms.slopeBps, cap: terms.cap };
}
