import { shortString } from "starknet";
import { FAUCET_USDC_AMOUNT, FAUCET_ABI, type Codecs, type ContractName } from "./abis";
import { AbiCodec as Codec, sameAddress, type AbiCodec, type DecodedEvent, type Encodable, type RawEvent } from "./codec";
import type { Deployment } from "./deployment";
import { receiptEvents } from "./events";
import { gameContract, type GameKey } from "./views";

export interface Call {
  contractAddress: string;
  entrypoint: string;
  calldata: string[];
}

/** What the writer needs from a starknet.js `Account` (or a session wallet with the same shape). */
export interface WriteAccount {
  address: string;
  execute(calls: Call[], details?: { tip?: bigint }): Promise<{ transaction_hash: string }>;
}

export interface ReceiptProvider {
  waitForTransaction(hash: string, options?: { retryInterval?: number }): Promise<unknown>;
}

/** How often the writer asks the node for a receipt it waits for (starknet.js's default is 5 s). */
export const RECEIPT_POLL_MS = 250;

export interface WriteResult {
  transactionHash: string;
  /** Events of the receipt from the contract written to, decoded. */
  events: DecodedEvent[];
}

export interface BuildMove {
  orientation: number;
  x: number;
  y: number;
}

/**
 * A write that the chain refused; the message is the revert reason. With a `transactionHash` the write was sent:
 * `reverted` says the receipt is a known revert; otherwise its receipt could not be read (timeout, RPC drop).
 */
export class WriteError extends Error {
  constructor(message: string, readonly transactionHash?: string, readonly reverted = false) {
    super(message);
    this.name = "WriteError";
  }
}

/** True when a revert reason names `reason`: as text, or as the hex of the short string the node may return. */
export function revertNames(revert: string, reason: string): boolean {
  return revert.includes(reason) || revert.toLowerCase().includes(shortString.encodeShortString(reason).toLowerCase());
}

// The Faucet's reasons, and the old MockUSDC's, which stays deployed on Sepolia until the fresh deployment (P-53).
const OVER_CALL_CAPS = ["Faucet: over the call cap", "MockUSDC: over the call cap"];
const OVER_ADDRESS_CAPS = ["Faucet: over the address cap", "MockUSDC: over the address cap"];

/**
 * The faucet's contract refused a mint (the Faucet's caps, D-16): `call` is the cap of one call, `address` the total an
 * address may receive from the faucet. Nothing moved; the message is for the player.
 */
export class FaucetCapError extends WriteError {
  constructor(readonly cap: "call" | "address", transactionHash?: string) {
    super(
      cap === "address"
        ? "The test USDC faucet is empty for this account: it has received everything the faucet gives to one address."
        : "The test USDC faucet refused this amount: it is over what one request may mint.",
      transactionHash,
      transactionHash !== undefined,
    );
    this.name = "FaucetCapError";
  }
}

const GAME_EXPIRED = "Game: expired";
/** What the player reads when a game's 24 hours are over (the card and the typed error). */
export const GAME_EXPIRED_TEXT = "This game has expired: its 24 hours are over. Surrender to close it; it still counts for its score.";

/**
 * The game's 24 hours are over (S1): `build` and `discard` are refused, `surrender` is not. Raised before any call is
 * sent when the game view says so, and when a `'Game: expired'` revert comes back after a race. A move that reverts
 * moved nothing.
 */
export class GameExpiredError extends WriteError {
  constructor(transactionHash?: string) {
    super(GAME_EXPIRED_TEXT, transactionHash, transactionHash !== undefined);
    this.name = "GameExpiredError";
  }
}

/** `'Game: expired'` as its typed error, from the fee estimation or the receipt; any other error unchanged. */
function expiredRevert(error: unknown): never {
  if (error instanceof WriteError && revertNames(error.message, GAME_EXPIRED)) throw new GameExpiredError(error.transactionHash);
  throw error;
}

/** A known revert of `Faucet.mint` as its clear state; any other error unchanged. */
function faucetRevert(error: unknown): unknown {
  if (!(error instanceof WriteError)) return error;
  if (OVER_ADDRESS_CAPS.some((reason) => revertNames(error.message, reason))) return new FaucetCapError("address", error.transactionHash);
  if (OVER_CALL_CAPS.some((reason) => revertNames(error.message, reason))) return new FaucetCapError("call", error.transactionHash);
  return error;
}

interface Receipt {
  execution_status?: string;
  revert_reason?: string;
  events?: RawEvent[];
}

/**
 * The writes of the game's contracts. Each one waits for its receipt and returns its decoded events.
 * Writes are serialised: while one is pending, another is refused (`WriteError`), so a double click
 * never sends two transactions from the account.
 */
export class PavedWriter {
  private pending = false;

  constructor(
    private readonly options: {
      account: WriteAccount;
      provider: ReceiptProvider;
      deployment: Deployment;
      codecs: Codecs;
      /** Tip per transaction; 0 on devnet, where starknet.js's tip estimate stalls. Unset elsewhere (Sepolia included): the account's own estimate. */
      tip?: bigint;
      /** Interval between two receipt requests while a write is pending. */
      receiptPollMs?: number;
      /** Called with the decoded events of every successful write (the event reader keeps them). */
      onEvents?: (contract: ContractName, events: DecodedEvent[]) => void;
    },
  ) {
    if (!options.deployment.configured) {
      throw new WriteError(`Not connected: ${options.deployment.missing.join(", ")} missing`);
    }
  }

  get address(): string {
    return this.options.account.address;
  }

  /**
   * The tutorial claim (D-21, P-49): one call to `Setup.claim_tutorial()`, which credits First Stone (task 10) to the
   * caller. It is idempotent and unchecked on chain: a second call has no effect, no revert and no event, so the receipt
   * cannot tell "claimed" from "already claimed". Without a Setup address (a deployment from before step D) nothing is sent.
   */
  claimTutorial(): Promise<WriteResult> {
    if (!this.options.deployment.addresses.Setup) {
      return Promise.reject(new WriteError("No Setup contract in this deployment: the tutorial cannot be claimed"));
    }
    return this.send("Setup", [this.call("Setup", "claim_tutorial", [])]);
  }

  /** Places the tile in hand. A Challenge game is bought, not spawned here: `EconomyWriter.purchase` sends `Challenge.spawn`. */
  build(key: GameKey, move: BuildMove): Promise<WriteResult> {
    const contract = gameContract(key.mode);
    return this.send(contract, [this.call(contract, "build", [key.gameId, move.orientation, move.x, move.y])]).catch(expiredRevert);
  }

  discard(key: GameKey): Promise<WriteResult> {
    const contract = gameContract(key.mode);
    return this.send(contract, [this.call(contract, "discard", [key.gameId])]).catch(expiredRevert);
  }

  surrender(key: GameKey): Promise<WriteResult> {
    const contract = gameContract(key.mode);
    return this.send(contract, [this.call(contract, "surrender", [key.gameId])]);
  }

  /**
   * The faucet: `Faucet.mint(self, FAUCET_USDC_AMOUNT)` at `deployment.faucet` (devnet and Sepolia; the mock is never
   * resolved on mainnet). Without that address nothing is sent. On devnet the burner signs it; on Sepolia the controller
   * does, with `mint` in its session policies. A cap the contract enforces is a `FaucetCapError`.
   */
  mint(): Promise<WriteResult> {
    return this.serialised(async () => {
      const call = this.faucetCall();
      try {
        return await this.sendNow({ codec: new Codec(FAUCET_ABI), address: call.contractAddress }, [call]);
      } catch (error) {
        throw faucetRevert(error);
      }
    });
  }

  private faucetCall(): Call {
    const { faucet } = this.options.deployment;
    if (!faucet) throw new WriteError("No faucet: this deployment has no Faucet");
    return {
      contractAddress: faucet,
      entrypoint: "mint",
      calldata: new Codec(FAUCET_ABI).encodeCall("mint", [this.address, FAUCET_USDC_AMOUNT]),
    };
  }

  private call(contract: ContractName, entrypoint: string, args: Encodable[]): Call {
    return {
      contractAddress: this.options.deployment.addresses[contract],
      entrypoint,
      calldata: this.options.codecs[contract].encodeCall(entrypoint, args),
    };
  }

  private send(contract: ContractName, calls: Call[]): Promise<WriteResult> {
    return this.serialised(() => this.sendNow(contract, calls));
  }

  /**
   * Sends calls built by another client of this account (the economy's, `economy/writer.ts`) in the same
   * serialisation as this writer's own: one write at a time across both. `prepare` runs inside it, so the reads
   * that check an amount happen after any earlier write has landed; it returns the calls and where the receipt's
   * events come from: one of the contracts of `ContractName`, or another contract's codec and address.
   */
  sendCalls(prepare: () => Promise<{ calls: Call[]; events: ContractName | { codec: AbiCodec; address: string } }>): Promise<WriteResult> {
    return this.serialised(async () => {
      const { calls, events } = await prepare();
      return this.sendNow(events, calls);
    });
  }

  private async serialised<T>(run: () => Promise<T>): Promise<T> {
    if (this.pending) throw new WriteError("Another write is pending");
    this.pending = true;
    try {
      return await run();
    } finally {
      this.pending = false;
    }
  }

  private async sendNow(contract: ContractName | { codec: AbiCodec; address: string }, calls: Call[]): Promise<WriteResult> {
    const { account, provider, codecs, deployment, tip, receiptPollMs = RECEIPT_POLL_MS, onEvents } = this.options;
    let transaction_hash: string;
    try {
      // Rejected before sending: fee estimation, or a contract assert found by the simulation.
      ({ transaction_hash } = await account.execute(calls, tip === undefined ? undefined : { tip }));
    } catch (error) {
      throw new WriteError(error instanceof Error ? error.message : String(error));
    }
    let receipt: Receipt;
    try {
      receipt = (await provider.waitForTransaction(transaction_hash, { retryInterval: receiptPollMs })) as Receipt;
    } catch (error) {
      throw new WriteError(error instanceof Error ? error.message : String(error), transaction_hash);
    }
    if (receipt.execution_status === "REVERTED") {
      throw new WriteError(receipt.revert_reason ?? "Transaction reverted", transaction_hash, true);
    }
    if (typeof contract !== "string") {
      const events = (receipt.events ?? []).flatMap((raw) =>
        raw.from_address && sameAddress(raw.from_address, contract.address) ? (contract.codec.decodeEvent(raw) ?? []) : [],
      );
      return { transactionHash: transaction_hash, events };
    }
    const events = receiptEvents(receipt, codecs, contract, deployment.addresses[contract]);
    onEvents?.(contract, events);
    return { transactionHash: transaction_hash, events };
  }

}
