import type { ReferralEarnings } from "../components/scenes/referral-scene";
import { SPLIT_BPS } from "./economy";
import { PLAYER_ID } from "./players";

/** The mocks' origin: a page builds the link from its own (`location.origin`). */
export const MOCK_ORIGIN = "https://paved.example";

/** The player's link: the app's `?ref=` with their address, as the legacy client's `referralLink` wrote it (`0x` and the hex, no padding). */
export const REFERRAL_LINK = `${MOCK_ORIGIN}/?ref=0x${BigInt(PLAYER_ID).toString(16)}`;

/** The referral of a price in USDC base units, at the split's `referral` bps (`curve::split`, rounded down). */
const referralOf = (price: bigint) => (price * BigInt(SPLIT_BPS.referral)) / 10_000n;

/** Three games bought through the link (stakes 3, 1 and 10: 6, 2 and 20 USDC). */
const GAMES = [6_000_000n, 2_000_000n, 20_000_000n].map(referralOf);
/** One pack of 100 Cobbles ($9). */
const PACKS = [9_000_000n].map(referralOf);
const sum = (values: bigint[]) => values.reduce((a, b) => a + b, 0n);

/**
 * What the link earned, as the indexer's `/v1/players/:id/referrals` sums it (IX-COBBLES2): the games' referrals (1.40 USDC)
 * and the packs' (0.45 USDC), 1.85 USDC in all.
 */
export const REFERRAL_EARNINGS: ReferralEarnings = {
  total: sum(GAMES) + sum(PACKS),
  games: { count: GAMES.length, total: sum(GAMES) },
  packs: { count: PACKS.length, total: sum(PACKS) },
};

/** Nobody bought through the link yet: what the indexer answers for a player that referred nobody. */
export const REFERRAL_NONE: ReferralEarnings = { total: 0n, games: { count: 0, total: 0n }, packs: { count: 0, total: 0n } };
