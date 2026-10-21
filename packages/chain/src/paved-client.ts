import { RpcProvider } from "starknet";
import { FAUCET_ABI, createCodecs, type Codecs } from "./abis";
import { AbiCodec } from "./codec";
import type { Deployment } from "./deployment";
import { EventReader, type EventProvider } from "./events";
import { RpcGameViews, ViewError, hasDrawViews, toViewError, type CallProvider, type GameViews } from "./views";
import { PavedWriter, type ReceiptProvider, type WriteAccount } from "./writer";

/** The ERC20 view of the entry token: the Faucet's ABI (`balance_of`, `allowance`, `approve`) is the USDC's interface. */
const ERC20_CODEC = new AbiCodec(FAUCET_ABI);

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

  /** Balance of the entry token (USDC since E3), in its base unit: the token `Challenge.entry_price` names. */
  async balance(address: string): Promise<bigint> {
    const { token } = await this.views.entryPrice();
    return (await this.read("balance_of", [address], token)) as bigint;
  }

  writer(account: WriteAccount, options: { tip?: bigint } = {}): PavedWriter {
    return new PavedWriter({
      account,
      provider: this.provider,
      deployment: this.deployment,
      codecs: this.codecs,
      onEvents: (contract, events) => this.events.remember(contract, events),
      // The VRF reads (#645), where the views have them: a drawing write requests its draw
      ...(hasDrawViews(this.views) ? { draws: this.views } : {}),
      ...options,
    });
  }

  /** An ERC20 view on the entry token (the Faucet's ABI exposes `balance_of`): `at` is the address `Challenge.entry_price` names. */
  private async read(entrypoint: string, args: string[], at: string): Promise<unknown> {
    const contractAddress = at;
    if (!contractAddress) throw new ViewError("not-configured", "entry token address is not configured");
    const codec = ERC20_CODEC;
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
