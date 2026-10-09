import type { AbiCodec } from "../codec";
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
 * (E3) takes its `min_out`. A missing, failed or zero quote refuses
 * the purchase with "No pool quote: nothing was sent".
 */
export const POOL_QUOTE_CONFIRMED = true;

/** `Economy.quote_swap(usdc_in) -> paved_out` (P-35; routed to the MockRouter on devnet). */
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
