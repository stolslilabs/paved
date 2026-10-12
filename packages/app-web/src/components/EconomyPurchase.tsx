import { useEffect, useState } from "react";
import {
  BPS,
  DEFAULT_SLIPPAGE_BPS,
  MAX_SLIPPAGE_BPS,
  PAID_GAME_TTL_SECONDS,
  POOL_CANNOT_FILL,
  POOL_QUOTE_UNAVAILABLE,
  SANITY_FLOOR_BPS,
  STAKES,
  boostBps,
  formatBps,
  formatUnits,
  impliedPaved,
  isQuoteRevert,
  launchProblem,
  minOutFor,
  priceOf,
  quoteBelowFloor,
  referralOf,
  routerProblem,
  sameAddress,
  useAsyncRead,
} from "@paved/chain";
import type { EconomyClient } from "@paved/chain";
import { CLIFF_TEXT, paved, points, usdc } from "../utils/economy-view";
import { shortAddress } from "../utils/landing-helpers";
import { alert, button, confirmButton, warning } from "./EconomyStyles";

/**
 * The paid Daily: the stake picker with its price `P = 2k` USDC (read from the chain) and the boost, then a confirm
 * that shows the amount and the referrer. Only "Confirm purchase" calls `onConfirm`, with the price shown; the
 * purchase itself is sent by the game page from the history state, and re-checked there. The pool's quote of the burn
 * (`Economy.quote_swap(burn_quote)`, E-9) is shown as the least PAVED bought; the purchase quotes again at send and
 * takes `min_out` from that quote only. A quote that reverts or fails offers no purchase and shows no figure.
 *
 * The two mainnet gates (E-9b, economy.md "For CLIENT"): `Economy.router()` must be the pinned router, else nothing is
 * quoted nor offered; and a pool quote below 90 % of the guard-rate value (`burn_quote x rate / RATE_SCALE`) is shown
 * next to that value and needs an explicit extra confirmation, never a refusal. The burn share is labelled "at today's
 * terms": `burn_bps` may change by an owner act before the transaction (CORE's ruling, 2026-10-12).
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
  /**
   * `minOut` is the least PAVED the confirm showed: the send refuses any `min_out` below it. `acceptedLowQuote` is true
   * only when the confirm showed the sanity warning and the player accepted it.
   */
  onConfirm: (stake: number, price: bigint, referrer: string | null, minOut: bigint, acceptedLowQuote: boolean) => void;
}) {
  const [stake, setStake] = useState(1);
  const [asking, setAsking] = useState(false);
  const [acceptLow, setAcceptLow] = useState(false);
  const entry = useAsyncRead(() => client.base.views.entryPrice(), [client], { onVisible: true });
  const quote = useAsyncRead(() => client.views.quote(stake), [client, stake], { onVisible: true });
  // The router pin and the guard's rate, read with the quote (the send reads both again in its own prepare).
  // The RPC must be on the deployment's chain (checked once per client); nothing else is read for a purchase before.
  const chain = useAsyncRead(() => client.checkChain(), [client]);
  const chainOk = chain.loaded && chain.error === null;
  const chainProblem = chain.error !== null ? chain.error.replace(/ Nothing was sent\.$/, "") : null;
  const gate = useAsyncRead(chainOk ? () => Promise.all([client.views.router(), client.views.guardRate()]) : null, [client, stake, chainOk], {
    onVisible: true,
  });
  const routerRefusal = gate.data ? routerProblem(client.deployment, gate.data[0]) : null;
  const rate = gate.data && gate.error === null ? gate.data[1] : null;
  // Mainnet at a rate of 0: not launched yet (E-9c); nothing is quoted nor offered.
  const launchRefusal = rate !== null && routerRefusal === null ? launchProblem(client.deployment, rate) : null;
  const self = referrer !== null && address !== null && sameAddress(referrer, address);
  // A referrer must be a registered player: one that is not is shown and not sent.
  const referrerPlayer = useAsyncRead(referrer && !self ? () => client.base.player(referrer) : null, [client, referrer, self]);
  const usedReferrer = referrer && !self && referrerPlayer.data ? referrer : null;

  const unit = entry.data && sameAddress(entry.data.token, client.deployment.addresses.USDC) ? entry.data.amount : null;
  const price = unit !== null && unit > 0n && quote.data && quote.data.price === priceOf(unit, stake) ? quote.data.price : null;
  const readFailed = entry.error ?? quote.error ?? referrerPlayer.error ?? gate.error;
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
  // The quote of the exact USDC the purchase swaps (the burn part), for the price shown only.
  const burn = price !== null && quote.data ? quote.data.burnQuote : null;
  // No quote through a router that is not the pinned one (ruling 2): it is not read at all.
  const quotable = client.poolQuoter !== null && burn !== null && gate.data !== null && routerRefusal === null && launchRefusal === null;
  const poolQuote = useAsyncRead(quotable ? () => client.poolQuoter!.quoteSwap(burn!) : null, [client, stake, burn, quotable], {
    onVisible: true,
  });
  // A figure only from an answer for these inputs that is not being read again, never next to an error (no stale quote).
  const minPaved = poolQuote.data !== null && poolQuote.error === null && !poolQuote.loading ? minOutFor(poolQuote.data, DEFAULT_SLIPPAGE_BPS) : null;
  // Only the contract's revert means the pool cannot fill; a call that failed (RPC, rate limit, timeout) is unread.
  const unreadable = poolQuote.error !== null && !isQuoteRevert(poolQuote.cause);
  const cannotFill = (poolQuote.error !== null && !unreadable) || minPaved === 0n;
  // The sanity floor (ruling 1): both figures shown, and an explicit extra confirmation; never a refusal.
  const implied = burn !== null && rate !== null ? impliedPaved(burn, rate) : null;
  const lowQuote = minPaved !== null && burn !== null && rate !== null && quoteBelowFloor(poolQuote.data!, burn, rate);
  const canBuy =
    ready &&
    chainOk &&
    price !== null &&
    !referrerLoading &&
    priceProblem === null &&
    !noPool &&
    routerRefusal === null &&
    launchRefusal === null &&
    rate !== null &&
    minPaved !== null &&
    minPaved > 0n;
  // An acceptance is for the quote it was given on: a quote read again, or no longer low, needs a fresh tick.
  const shownQuote = poolQuote.data;
  useEffect(() => setAcceptLow(false), [shownQuote, lowQuote]);
  // The burn share of the price, at today's `burn_bps`: an owner act may change it before the transaction.
  const burnShare = price !== null && burn !== null ? `${usdc(burn)} of the price (${formatUnits((burn * BPS) / price, 2)} %), at today's terms` : null;

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
            onClick={() => {
              setStake(k);
              setAcceptLow(false);
            }}
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
      {burnShare && <span>{`Swapped for PAVED and burned: ${burnShare}`}</span>}
      {minPaved !== null && minPaved > 0n && <span>{`PAVED bought and burned: at least ${paved(minPaved)} (quoted again when sent)`}</span>}
      {lowQuote && implied !== null && <span role="alert" style={alert}>{lowQuoteText(poolQuote.data!, implied)}</span>}
      <span>{`Slippage on the burn swap: ${formatUnits(DEFAULT_SLIPPAGE_BPS, 2)} % (at most ${formatUnits(MAX_SLIPPAGE_BPS, 2)} %)`}</span>
      <span>{`A paid game expires ${PAID_GAME_TTL_SECONDS / 3600} h after its purchase; an expired game gets no reward.`}</span>
      {quote.data && (
        <span>{`Current reference: mean ${points(quote.data.mean)} points, threshold ${points(quote.data.threshold)} points; the day's own mean is known only at settlement.`}</span>
      )}
      <span style={warning}>{CLIFF_TEXT}</span>
      {priceProblem && <span role="alert" style={alert}>{priceProblem}</span>}
      {noPool && <span role="alert" style={alert}>No pool quote: purchase unavailable</span>}
      {chainProblem && <span role="alert" style={alert}>{chainProblem}</span>}
      {routerRefusal && <span role="alert" style={alert}>{routerRefusal}</span>}
      {launchRefusal && <span role="alert" style={alert}>{launchRefusal}</span>}
      {!noPool && cannotFill && <span role="alert" style={alert}>{POOL_CANNOT_FILL}</span>}
      {!noPool && unreadable && <span role="alert" style={alert}>{POOL_QUOTE_UNAVAILABLE}</span>}
      {!asking ? (
        <button
          type="button"
          style={confirmButton}
          disabled={!canBuy}
          onClick={() => {
            setAcceptLow(false);
            setAsking(true);
          }}
        >
          {!ready ? "Not connected" : noPool ? "No pool quote" : chainProblem || routerRefusal ? "Purchases are off" : launchRefusal ? "Not launched" : cannotFill ? "Pool cannot fill" : unreadable ? "Pool quote unavailable" : price !== null ? `Buy for ${usdc(price)}` : "Price unavailable"}
        </button>
      ) : (
        price !== null && (
          <div role="dialog" aria-label="Confirm purchase" style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid #444", paddingTop: 8 }}>
            <span>{`Pay ${usdc(price)} (approve USDC, then buy) for a Daily game at stake ${stake}?`}</span>
            {burnShare && <span>{`Swapped for PAVED and burned: ${burnShare}.`}</span>}
            {minPaved !== null && minPaved > 0n && (
              <span>{`At least ${paved(minPaved)} bought and burned: if the pool moved down by the time it is sent, nothing is sent and you confirm again.`}</span>
            )}
            {usedReferrer && (
              <span>{`Referrer ${shortAddress(usedReferrer)} gets ${usdc(referralOf(price))} out of the stakers' margin: you pay the same ${usdc(price)}.`}</span>
            )}
            <span style={warning}>{CLIFF_TEXT} The reward, if any, is computed by the contract after the day.</span>
            {lowQuote && implied !== null && (
              <label style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                <input type="checkbox" checked={acceptLow} onChange={(e) => setAcceptLow(e.target.checked)} />
                <span>{`${lowQuoteText(poolQuote.data!, implied)} I understand and buy anyway.`}</span>
              </label>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                style={confirmButton}
                disabled={!canBuy || (lowQuote && !acceptLow)}
                onClick={() => {
                  // `canBuy` holds a quote above 0; checked again so that no floor of 0 is ever confirmed.
                  if (minPaved === null || minPaved <= 0n) return;
                  if (lowQuote && !acceptLow) return;
                  setAsking(false);
                  onConfirm(stake, price, usedReferrer, minPaved, lowQuote && acceptLow);
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

/** The sanity warning: the pool's quote of the burn and the guard-rate value, both in PAVED. */
function lowQuoteText(quote: bigint, implied: bigint): string {
  return `The pool quotes ${paved(quote)} for the burn, below ${formatUnits(SANITY_FLOOR_BPS / 100n, 0)} % of the ${paved(implied)} the guard rate implies: the pool may have been pushed.`;
}
