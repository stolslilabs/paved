import { createEconomyCodecs, type EconomyCodecs } from "../abis";
import type { PavedClient } from "../paved-client";
import type { PavedWriter } from "../writer";
import type { EconomyDeployment } from "./deployment";
import { RpcEconomyViews, type EconomyViews } from "./views";
import { EconomyWriter } from "./writer";

/**
 * The economy's reads and writes on top of the game's client: the same provider, and the same `PavedWriter`
 * for the account, so that every write of the account is serialised. Null when the economy is not deployed.
 */
export class EconomyClient {
  readonly views: EconomyViews;

  constructor(
    readonly deployment: EconomyDeployment,
    readonly base: PavedClient,
    readonly codecs: EconomyCodecs = createEconomyCodecs(),
    views?: EconomyViews,
  ) {
    this.views = views ?? new RpcEconomyViews(base.provider, deployment, codecs);
  }

  /** The writer; "now" for the settlement is the latest block's timestamp when the provider can read it. */
  writer(writer: PavedWriter, options: { now?: () => number | Promise<number> } = {}): EconomyWriter {
    const provider = this.base.provider as { getBlock?: (id: "latest") => Promise<{ timestamp: number }> } | undefined;
    const blockTime = provider?.getBlock ? async () => Number((await provider.getBlock!("latest")).timestamp) : undefined;
    return new EconomyWriter({ writer, deployment: this.deployment, codecs: this.codecs, views: this.views, gameViews: this.base.views, now: options.now ?? blockTime });
  }
}

/** The economy client, or null when its contracts are not deployed (every network until CORE's E2/E3). */
export function createEconomyClient(deployment: EconomyDeployment, base: PavedClient | null, views?: EconomyViews): EconomyClient | null {
  if (!deployment.configured || !base) return null;
  return new EconomyClient(deployment, base, undefined, views);
}
