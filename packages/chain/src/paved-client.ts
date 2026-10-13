import { RpcProvider } from "starknet";
import { createCodecs, type Codecs } from "./abis";
import type { Deployment } from "./deployment";
import { EventReader, type EventProvider } from "./events";
import { RpcGameViews, ViewError, toViewError, type CallProvider, type GameViews } from "./views";
import { PavedWriter, type ReceiptProvider, type WriteAccount } from "./writer";

export type PavedRpc = CallProvider & EventProvider & ReceiptProvider;

/** Reads and writes of the native contracts for one deployment. */
export class PavedClient {
  readonly views: GameViews;
  readonly events: EventReader;

  constructor(
    readonly deployment: Deployment,
    readonly provider: PavedRpc,
    readonly codecs: Codecs = createCodecs(),
    views?: GameViews,
  ) {
    this.views = views ?? new RpcGameViews(provider, deployment, codecs);
    this.events = new EventReader(provider, deployment, codecs);
  }

  /** Balance of the entry token (USDC since E3), in its base unit: the token `Daily.entry_price` names. */
  async balance(address: string): Promise<bigint> {
    const { token } = await this.views.entryPrice();
    return (await this.read("Token", "balance_of", [address], token)) as bigint;
  }

  writer(account: WriteAccount, options: { tip?: bigint } = {}): PavedWriter {
    return new PavedWriter({
      account,
      provider: this.provider,
      deployment: this.deployment,
      codecs: this.codecs,
      onEvents: (contract, events) => this.events.remember(contract, events),
      ...options,
    });
  }

  private async read(contract: "Token", entrypoint: string, args: string[], at?: string): Promise<unknown> {
    const contractAddress = at ?? this.deployment.addresses[contract];
    if (!contractAddress) throw new ViewError("not-configured", `${contract} address is not configured`);
    const codec = this.codecs[contract];
    try {
      const felts = await this.provider.callContract({ contractAddress, entrypoint, calldata: codec.encodeCall(entrypoint, args) });
      return codec.decodeResult(entrypoint, felts);
    } catch (error) {
      throw toViewError(error);
    }
  }
}

/**
 * A client on starknet.js's `RpcProvider` for the deployment's RPC URL. Refused when the deployment
 * is not configured: an empty URL would make starknet.js fall back to a public node.
 */
export function createPavedClient(deployment: Deployment): PavedClient {
  if (!deployment.configured) throw new ViewError("not-configured", `Not connected: ${deployment.missing.join(", ")} missing`);
  const provider = new RpcProvider({ nodeUrl: deployment.rpcUrl });
  return new PavedClient(deployment, provider as unknown as PavedRpc);
}
