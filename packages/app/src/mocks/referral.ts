import type { GameEconomy } from "../components/scenes/referral-scene";
import { DAY, HOUR, MOCK_NOW } from "./clock";
import { SPLIT_BPS } from "./economy";
import { PLAYER_ID } from "./players";

/** The mocks' origin: a page builds the link from its own (`location.origin`). */
export const MOCK_ORIGIN = "https://paved.example";

/** The player's link: the app's `?ref=` with their address, as app-web's `referralLink` writes it (`0x` and the hex, no padding). */
export const REFERRAL_LINK = `${MOCK_ORIGIN}/?ref=0x${BigInt(PLAYER_ID).toString(16)}`;

/** One purchase through the link: the indexer stores its `referrer` and `referral` on each paid game (`GameRow.economy`, E3). */
function purchase(stake: number, purchasedAt: number): GameEconomy {
  const price = BigInt(stake) * 2_000_000n;
  return {
    day: Math.floor(purchasedAt / DAY),
    stake,
    price: String(price),
    referrer: PLAYER_ID,
    referral: String((price * BigInt(SPLIT_BPS.referral)) / 10_000n),
    burned: "3120000000000000000",
    factor: 10_000,
    reference: "4200000000000000000",
    purchasedAt,
    recorded: false,
    expired: false,
    settled: false,
    threshold: null,
    reward: null,
  };
}

/** The purchases through the player's link, newest first (the indexer's referral route is CLIENT's to add, section 6.4). */
export const REFERRED_PURCHASES: GameEconomy[] = [
  purchase(3, MOCK_NOW - 2 * HOUR),
  purchase(1, MOCK_NOW - 7 * HOUR),
  purchase(10, MOCK_NOW - DAY - 4 * HOUR),
  purchase(2, MOCK_NOW - 2 * DAY - HOUR),
  purchase(5, MOCK_NOW - 4 * DAY),
];
