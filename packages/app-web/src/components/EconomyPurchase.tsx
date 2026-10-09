import { useState } from "react";
import { DEFAULT_SLIPPAGE_BPS, MAX_SLIPPAGE_BPS, PAID_GAME_TTL_SECONDS, STAKES, boostBps, formatBps, formatUnits, priceOf, referralOf, sameAddress, useAsyncRead } from "@paved/chain";
import type { EconomyClient } from "@paved/chain";
import { CLIFF_TEXT, points, usdc } from "../utils/economy-view";
import { shortAddress } from "../utils/landing-helpers";
import { alert, button, confirmButton, warning } from "./EconomyStyles";

/**
 * The paid Daily: the stake picker with its price `P = 2k` USDC (read from the chain) and the boost, then a confirm
 * that shows the amount and the referrer. Only "Confirm purchase" calls `onConfirm`, with the price shown; the
 * purchase itself is sent by the game page from the history state, and re-checked there.
 */
export function EconomyPurchase({
  client,
  address,
  ready,
  referrer,
  onConfirm,
}: {
  client: EconomyClient;
  address: string | null;
  /** A writer is ready. */
  ready: boolean;
  /** From the link, or null. */
  referrer: string | null;
  onConfirm: (stake: number, price: bigint, referrer: string | null) => void;
}) {
  const [stake, setStake] = useState(1);
  const [asking, setAsking] = useState(false);
  const entry = useAsyncRead(() => client.base.views.entryPrice(), [client], { onVisible: true });
  const quote = useAsyncRead(() => client.views.quote(stake), [client, stake], { onVisible: true });
  const self = referrer !== null && address !== null && sameAddress(referrer, address);
  // A referrer must be a registered player: one that is not is shown and not sent.
  const referrerPlayer = useAsyncRead(referrer && !self ? () => client.base.player(referrer) : null, [client, referrer, self]);
  const usedReferrer = referrer && !self && referrerPlayer.data ? referrer : null;

  const unit = entry.data && sameAddress(entry.data.token, client.deployment.addresses.USDC) ? entry.data.amount : null;
  const price = unit !== null && unit > 0n && quote.data && quote.data.price === priceOf(unit, stake) ? quote.data.price : null;
  const readFailed = entry.error ?? quote.error ?? referrerPlayer.error;
  const priceProblem =
    readFailed !== null
      ? `Price unavailable: ${readFailed}`
      : entry.data && unit === null
        ? "Unknown entry token: not USDC"
        : quote.data && unit !== null && price === null
          ? "Price unavailable: the quote disagrees with the entry price"
          : null;
  const referrerLoading = referrer !== null && !self && referrerPlayer.loading;
  // No pool quote, no safe `min_out`: the purchase is refused (P-35), so it is not offered.
  const noPool = client.poolQuoter === null;
  const canBuy = ready && price !== null && !referrerLoading && priceProblem === null && !noPool;

  return (
    <div aria-label="Purchase" style={{ display: "flex", flexDirection: "column", gap: 8, color: "#f5f5f5", fontSize: 13 }}>
      <strong>Stake</strong>
      <div role="radiogroup" aria-label="Stake" style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {STAKES.map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={k === stake}
            disabled={asking}
            onClick={() => setStake(k)}
            style={{ ...button, background: k === stake ? "#f59e0b" : button.background, color: k === stake ? "#0a0a0a" : "#fff" }}
          >
            {k}
          </button>
        ))}
      </div>
      <span>{`Price: ${price !== null ? usdc(price) : "…"}`}</span>
      <span>{`Reward boost: x${formatBps(boostBps(stake))}`}</span>
      {referrer && (
        <span>
          {self
            ? "Referral link: your own address, ignored"
            : referrerPlayer.data === null && referrerPlayer.loaded
              ? `Referrer ${shortAddress(referrer)} is not a registered player: ignored`
              : `Referrer: ${shortAddress(referrer)}`}
        </span>
      )}
      <span>{`Slippage on the burn swap: ${formatUnits(DEFAULT_SLIPPAGE_BPS, 2)} % (at most ${formatUnits(MAX_SLIPPAGE_BPS, 2)} %)`}</span>
      <span>{`A paid game expires ${PAID_GAME_TTL_SECONDS / 3600} h after its purchase; an expired game gets no reward.`}</span>
      {quote.data && (
        <span>{`Current reference: mean ${points(quote.data.mean)} points, threshold ${points(quote.data.threshold)} points; the day's own mean is known only at settlement.`}</span>
      )}
      <span style={warning}>{CLIFF_TEXT}</span>
      {priceProblem && <span role="alert" style={alert}>{priceProblem}</span>}
      {noPool && <span role="alert" style={alert}>No pool quote: purchase unavailable</span>}
      {!asking ? (
        <button type="button" style={confirmButton} disabled={!canBuy} onClick={() => setAsking(true)}>
          {!ready ? "Not connected" : noPool ? "No pool quote" : price !== null ? `Buy for ${usdc(price)}` : "Price unavailable"}
        </button>
      ) : (
        price !== null && (
          <div role="dialog" aria-label="Confirm purchase" style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid #444", paddingTop: 8 }}>
            <span>{`Pay ${usdc(price)} (approve USDC, then buy) for a Daily game at stake ${stake}?`}</span>
            {usedReferrer && (
              <span>{`Referrer ${shortAddress(usedReferrer)} gets ${usdc(referralOf(price))} out of the stakers' margin: you pay the same ${usdc(price)}.`}</span>
            )}
            <span style={warning}>{CLIFF_TEXT} The reward, if any, is computed by the contract after the day.</span>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                style={confirmButton}
                disabled={!canBuy}
                onClick={() => {
                  setAsking(false);
                  onConfirm(stake, price, usedReferrer);
                }}
              >
                Confirm purchase
              </button>
              <button type="button" style={button} onClick={() => setAsking(false)}>
                Cancel
              </button>
            </div>
          </div>
        )
      )}
    </div>
  );
}
