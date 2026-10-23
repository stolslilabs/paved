import type { GameView, GameViews, TermsView } from "@paved/chain";
import type { RewardCurve } from "../components/containers/reward-estimate";
import { BOARD_38, CLOSINGS_38 } from "./board";
import { DAY, HOUR, MOCK_NOW } from "./clock";
import { PLAYER_ID, TODAY } from "./players";

/** Points x 1,000, as `QuoteView.threshold` and `TermsView` carry them. */
export const THRESHOLD_MILLI = 1_150_000;

const SCORE = CLOSINGS_38.reduce((sum, c) => sum + c.points, 0);
const BOUGHT_AT = MOCK_NOW - 5 * HOUR;

/** A Challenge game in play on the 38-tile board (`Challenge.game(id)`): 37 placed after the starter, 2 discarded. */
export const GAME_PLAYING: GameView = {
  id: 1_042,
  playerId: PLAYER_ID,
  mode: 1,
  seed: "0x00c0ffee",
  score: SCORE,
  over: false,
  tileCount: 40,
  placedCount: 37,
  discardedCount: 2,
  tileId: BOARD_38.next.id,
  plan: BOARD_38.next.plan,
  remainingCount: 12,
  deckSize: 52,
  startTime: BOUGHT_AT,
  endTime: 0,
  dayId: TODAY,
  expiresAt: BOUGHT_AT + DAY,
};

/** `Challenge.initial_seed(id)` (S1): the seed before any draw; `GameView.seed` is the current one. */
export const INITIAL_SEED: Awaited<ReturnType<GameViews["initialSeed"]>> = "0x00c0ffee00000000000000000000000000000000000000000000000000000001";

/** Started more than 24 h ago and not finished: past `expiresAt`, `build` and `discard` revert, `surrender` closes it. */
export const GAME_EXPIRED: GameView = { ...GAME_PLAYING, startTime: MOCK_NOW - DAY - 20 * 60, expiresAt: MOCK_NOW - 20 * 60, dayId: TODAY - 1 };

/** The same game once its deck ran out. */
export const GAME_OVER: GameView = { ...GAME_PLAYING, over: true, remainingCount: 0, tileId: 0, plan: 0, endTime: MOCK_NOW - 10 * 60 };

/** Its frozen terms (`Economy.terms(id)`), bought at stake 3, before the day closes: recorded, not settled. */
export const TERMS_PLAYING: TermsView = {
  player: PLAYER_ID,
  time: BOUGHT_AT,
  day: TODAY,
  stake: 3,
  reference: 4_200_000_000_000_000_000n,
  sigmaBps: 0,
  // The chain's defaults (`economy.cairo`, `DEFAULT_CONFIG`): `c` 1.222, `H` 5.
  slopeBps: 12_220,
  cap: 5,
  score: 0,
  recorded: false,
  expired: false,
  settled: false,
  reward: 0n,
};

/** Its reward curve (#705): its terms against the day's threshold, as the HUD and the over page read them (`curveOf`). */
export const CURVE_PLAYING: RewardCurve = { reference: TERMS_PLAYING.reference, threshold: THRESHOLD_MILLI, slopeBps: TERMS_PLAYING.slopeBps, cap: TERMS_PLAYING.cap };

/** Bought more than 24 h ago and never finished: no reward any more (P-34). */
export const TERMS_EXPIRED: TermsView = { ...TERMS_PLAYING, time: MOCK_NOW - DAY - 20 * 60, day: TODAY - 1, expired: true };

/** Over above the threshold, settled after its day: the reward minted. */
export const TERMS_REWARDED: TermsView = { ...TERMS_PLAYING, score: SCORE, recorded: true, settled: true, reward: 8_420_000_000_000_000_000n };

/** Over and recorded, its day still open: settled once the day closes. */
export const TERMS_AWAITING: TermsView = { ...TERMS_PLAYING, score: SCORE, recorded: true };

/** Over below the threshold: settled at 0, the stake lost. */
export const TERMS_BELOW: TermsView = { ...TERMS_PLAYING, score: 940, recorded: true, settled: true, reward: 0n };
