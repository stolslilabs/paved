import { sameAddress, type AbiCodec } from "../codec";
import { toViewError, ViewError, type CallProvider } from "../views";
import type { EconomyDeployment } from "./deployment";

/**
 * The pool's quote for the burn swap: PAVED out for `usdcIn` USDC in, the pool fee included. `min_out` is computed
 * from it, never from `Quote.min_out_hint` (CORE, P-35).
 */
export interface PoolQuoter {
  quoteSwap(usdcIn: bigint): Promise<bigint>;
}

/**
 * `Economy.quote_swap` is in the committed ABI (E2, #262): the client has a pool quoter, and the paid `Daily.spawn`
 * (E3) takes its `min_out`. A missing quoter refuses the purchase with "No pool quote: nothing was sent".
 */
export const POOL_QUOTE_CONFIRMED = true;

/**
 * What the player reads when `Economy.quote_swap` gives no usable quote: it reverted (`'Economy: partial fill'`, or
 * any revert of the router), the call failed, or it quoted 0. Nothing is sent then (E-9).
 */
export const POOL_CANNOT_FILL = "The pool cannot fill this purchase right now. Try a smaller stake or later.";

/** What the player reads when the quote could not be read at all (an RPC error, a rate limit, a timeout): not a revert. */
export const POOL_QUOTE_UNAVAILABLE = "Cannot read the pool quote right now; try again.";

/** What the player reads when the network has no known router to pin (a mock network whose file has no `MockRouter`). */
export const ROUTER_UNKNOWN = "Purchases are off: no known swap router on this network.";

/** What the player reads when `Economy.router()` is not the pinned one (E-9b, CORE's ruling 2). */
export const ROUTER_NOT_PINNED = "Purchases are off: the economy swaps through an unexpected router.";

/**
 * The router pin (E-9b, ruling 2): null when `Economy.router()` is the deployment's `expectedRouter` (`MAINNET_ROUTER` on
 * mainnet, the file's `MockRouter` on devnet and Sepolia), else what the player reads. No quote is shown and nothing is
 * sent otherwise.
 */
export function routerProblem(deployment: Pick<EconomyDeployment, "expectedRouter">, router: string): string | null {
  if (!deployment.expectedRouter) return ROUTER_UNKNOWN;
  try {
    return sameAddress(router, deployment.expectedRouter) ? null : ROUTER_NOT_PINNED;
  } catch {
    return ROUTER_NOT_PINNED;
  }
}

/** What the player reads on mainnet if `Economy.rate()` is 0, which only an unexpected upgrade can cause (E-9c, ruling 3). */
export const RATE_UNAVAILABLE = "Price rate unavailable; purchases are paused";

/**
 * A guard against an unexpected upgrade (E-9c, ruling 3): the constructor refuses a rate of 0 (`'Economy: zero rate'`), so
 * on mainnet a 0 can only come from an odd upgrade, and every purchase is refused then. Devnet and Sepolia proceed at a rate
 * of 0 (no warning). Null when a purchase may proceed.
 */
export function rateProblem(deployment: Pick<EconomyDeployment, "mainnet">, rate: bigint): string | null {
  return deployment.mainnet && rate === 0n ? RATE_UNAVAILABLE : null;
}

/** The Economy's own refusals of `quote_swap` (E-9: F1, F2, the `u128` bound). */
const QUOTE_REVERTS = ["Economy: partial fill", "Economy: wrong delta", "Economy: amount too large"];

/**
 * Whether a failed quote is the contract's answer (a revert of `quote_swap`, the Economy's or its router's) rather than a
 * failure to reach it. A node reports a revert of a view as `CONTRACT_ERROR` (JSON-RPC code 40) with a `revert_error`;
 * anything else (a transport error, a rate limit -32011 or 429, a timeout, a malformed answer) is not one.
 */
export function isQuoteRevert(error: unknown): boolean {
  const seen = new Set<unknown>();
  for (let e: unknown = error; e && !seen.has(e); e = (e as { cause?: unknown }).cause) {
    seen.add(e);
    if ((e as { code?: unknown }).code === 40) return true;
    const text = e instanceof Error ? e.message : String(e);
    if (/revert_error|Contract error|ENTRYPOINT_FAILED|execution reverted/i.test(text)) return true;
    if (QUOTE_REVERTS.some((reason) => text.includes(reason))) return true;
  }
  return false;
}

/**
 * `Economy.quote_swap(usdc_in) -> paved_out` on every network (E-9): the Economy asks its router's own `quote_swap`
 * through the node `purchase` swaps through (its pool key and price limit, one hop), so the quote is the purchase's
 * own route. Ekubo's router on mainnet, the MockRouter on devnet and Sepolia. The client never calls a router, nor
 * any quoter API, itself.
 */
export class EconomyPoolQuoter implements PoolQuoter {
  constructor(
    private readonly provider: CallProvider,
    private readonly deployment: EconomyDeployment,
    private readonly codec: AbiCodec,
  ) {}

  async quoteSwap(usdcIn: bigint): Promise<bigint> {
    if (!this.deployment.configured) throw new ViewError("not-configured", "Economy not deployed");
    try {
      const felts = await this.provider.callContract({
        contractAddress: this.deployment.addresses.Economy,
        entrypoint: "quote_swap",
        calldata: this.codec.encodeCall("quote_swap", [usdcIn]),
      });
      return this.codec.decodeResult("quote_swap", felts) as bigint;
    } catch (error) {
      throw toViewError(error);
    }
  }
}

/**
 * The pool quoter of a deployment: `Economy.quote_swap` on every network (devnet, sepolia, mainnet), or null when the
 * economy is not deployed (every purchase is refused then).
 */
export function poolQuoterFor(deployment: EconomyDeployment, provider: CallProvider, codec: AbiCodec): PoolQuoter | null {
  return deployment.configured ? new EconomyPoolQuoter(provider, deployment, codec) : null;
}
