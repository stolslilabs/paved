import { createEconomyCodecs, type EconomyCodecs } from "../abis";
import { WriteError } from "../writer";
import type { PavedClient } from "../paved-client";
import type { PavedWriter } from "../writer";
import type { EconomyDeployment } from "./deployment";
import { POOL_QUOTE_CONFIRMED, poolQuoterFor, type PoolQuoter } from "./pool";
import { RpcEconomyViews, type EconomyViews } from "./views";
import { EconomyWriter } from "./writer";

/**
 * The economy's reads and writes on top of the game's client: the same provider, and the same `PavedWriter`
 * for the account, so that every write of the account is serialised. Null when the economy is not deployed.
 */
export class EconomyClient {
  readonly views: EconomyViews;
  /** `Economy.quote_swap` on every network (`poolQuoterFor`); null when a test passes none: purchases are refused then. */
  readonly poolQuoter: PoolQuoter | null;

  constructor(
    readonly deployment: EconomyDeployment,
    readonly base: PavedClient,
    readonly codecs: EconomyCodecs = createEconomyCodecs(),
    views?: EconomyViews,
    poolQuoter?: PoolQuoter | null,
  ) {
    this.views = views ?? new RpcEconomyViews(base.provider, deployment, codecs);
    this.poolQuoter =
      poolQuoter !== undefined ? poolQuoter : POOL_QUOTE_CONFIRMED ? poolQuoterFor(deployment, base.provider, codecs.Economy) : null;
  }

  private chainChecked: Promise<void> | null = null;

  /**
   * Once per client, before any purchase (audit t-0116, note 1): the RPC's chain id must be the deployment file's
   * `chain_id`. Fails closed: a deployment without one, an RPC that cannot tell its own, or another chain refuses every
   * purchase (`ChainMismatchError`). A failed read is tried again next time; a match is kept.
   */
  checkChain(): Promise<void> {
    this.chainChecked ??= this.readChain().catch((error: unknown) => {
      if (!(error instanceof ChainMismatchError)) this.chainChecked = null;
      throw error;
    });
    return this.chainChecked;
  }

  private async readChain(): Promise<void> {
    const expected = this.deployment.base.chainId;
    const provider = this.base.provider as { getChainId?: () => Promise<string> } | undefined;
    if (!expected || !provider?.getChainId) throw new ChainMismatchError(CHAIN_UNKNOWN);
    let actual: string;
    try {
      actual = await provider.getChainId();
    } catch (error) {
      throw new WriteError(`Cannot read the network: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!sameChain(expected, actual)) throw new ChainMismatchError(CHAIN_MISMATCH);
  }

  /** The writer; "now" for the settlement is the latest block's timestamp when the provider can read it. */
  writer(writer: PavedWriter, options: { now?: () => number | Promise<number> } = {}): EconomyWriter {
    const provider = this.base.provider as { getBlock?: (id: "latest") => Promise<{ timestamp: number }> } | undefined;
    const blockTime = provider?.getBlock ? async () => Number((await provider.getBlock!("latest")).timestamp) : undefined;
    return new EconomyWriter({ writer, deployment: this.deployment, codecs: this.codecs, views: this.views, gameViews: this.base.views, poolQuoter: this.poolQuoter, now: options.now ?? blockTime, checkChain: () => this.checkChain() });
  }
}

/**
 * The economy client, or null when its contracts are not deployed (every network until CORE's E2/E3). `views` and
 * `poolQuoter` replace the contracts' in tests.
 */
export function createEconomyClient(
  deployment: EconomyDeployment,
  base: PavedClient | null,
  views?: EconomyViews,
  poolQuoter?: PoolQuoter | null,
): EconomyClient | null {
  if (!deployment.configured || !base) return null;
  return new EconomyClient(deployment, base, undefined, views, poolQuoter);
}

/** What the player reads when the deployment names no chain id, or the RPC cannot tell its own. */
export const CHAIN_UNKNOWN = "Purchases are off: the network cannot be confirmed.";
/** What the player reads when the RPC is on another chain than the deployment file's. */
export const CHAIN_MISMATCH = "Purchases are off: the RPC is on another network than this deployment.";

/** The RPC's chain is not the deployment's, or cannot be confirmed: every purchase is refused, nothing is sent. */
export class ChainMismatchError extends WriteError {
  constructor(text: string) {
    super(`${text} Nothing was sent.`);
    this.name = "ChainMismatchError";
  }
}

function sameChain(a: string, b: string): boolean {
  try {
    return BigInt(a) === BigInt(b);
  } catch {
    return false;
  }
}
