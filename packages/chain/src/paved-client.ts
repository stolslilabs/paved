import { RpcProvider, shortString } from "starknet";
import { createCodecs, type Codecs } from "./abis";
import type { Deployment } from "./deployment";
import { EventReader, type EventProvider } from "./events";
import { RpcGameViews, ViewError, toViewError, type CallProvider, type GameViews } from "./views";
import { PavedWriter, type ReceiptProvider, type WriteAccount } from "./writer";

export type PavedRpc = CallProvider & EventProvider & ReceiptProvider;

export interface PlayerRecord {
  id: string;
  name: string;
  master: string;
}

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

  /** The player registered for an address, or null when it has not called `Account.create`. */
  async player(address: string): Promise<PlayerRecord | null> {
    const raw = (await this.read("Account", "player", [address])) as { id: string; name: string; master: string };
    if (BigInt(raw.name) === 0n) return null;
    return { id: raw.id, name: shortString.decodeShortString(raw.name), master: raw.master };
  }

  /** Balance of the entry token, in its base unit. */
  async balance(address: string): Promise<bigint> {
    return (await this.read("Token", "balance_of", [address])) as bigint;
  }

  writer(account: WriteAccount, options: { tip?: bigint } = {}): PavedWriter {
    return new PavedWriter({
      account,
      provider: this.provider,
      deployment: this.deployment,
      codecs: this.codecs,
      entryPrice: () => this.views.entryPrice(),
      onEvents: (contract, events) => this.events.remember(contract, events),
      ...options,
    });
  }

  private async read(contract: "Account" | "Token", entrypoint: string, args: string[]): Promise<unknown> {
    const contractAddress = this.deployment.addresses[contract];
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
