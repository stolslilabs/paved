import { shortString } from "starknet";
import type { Codecs, ContractName } from "./abis";
import type { DecodedEvent, Encodable, RawEvent } from "./codec";
import type { Deployment } from "./deployment";
import { receiptEvents } from "./events";
import { gameContract, type GameKey, type GameMode } from "./views";

/** Entry price of a Daily game: `DAILY_TOURNAMENT_PRICE` of `contracts/src/constants.cairo`. */
export const DAILY_PRICE = 10n ** 18n;

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
  role: number;
  spot: number;
}

/** A write that the chain refused; the message is the revert reason. */
export class WriteError extends Error {
  constructor(message: string, readonly transactionHash?: string) {
    super(message);
    this.name = "WriteError";
  }
}

interface Receipt {
  execution_status?: string;
  revert_reason?: string;
  events?: RawEvent[];
}

function feltOfName(name: string): string {
  return /^0x[0-9a-f]+$/i.test(name) ? name : shortString.encodeShortString(name);
}

/** The writes of the four contracts. Each one waits for its receipt and returns its decoded events. */
export class PavedWriter {
  constructor(
    private readonly options: {
      account: WriteAccount;
      provider: ReceiptProvider;
      deployment: Deployment;
      codecs: Codecs;
      /** Tip per transaction; 0 on devnet, where starknet.js's tip estimate stalls. */
      tip?: bigint;
      /** Interval between two receipt requests while a write is pending. */
      receiptPollMs?: number;
    },
  ) {
    if (!options.deployment.configured) {
      throw new WriteError(`Not connected: ${options.deployment.missing.join(", ")} missing`);
    }
  }

  get address(): string {
    return this.options.account.address;
  }

  /** Registers the account as a player; on the test token, mints its faucet amount first. */
  createPlayer(name: string, options: { mintTestToken?: boolean } = {}): Promise<WriteResult> {
    const calls = [this.call("Account", "create", [feltOfName(name), this.address])];
    if (options.mintTestToken) calls.unshift(this.call("Token", "mint", []));
    return this.send("Account", calls);
  }

  /** Spawns a game; Daily approves the entry price in the same transaction. */
  async spawn(mode: GameMode): Promise<WriteResult & { gameId: number }> {
    const contract = gameContract(mode);
    const calls = [this.call(contract, "spawn", [])];
    if (mode === "daily") {
      calls.unshift(this.call("Token", "approve", [this.options.deployment.addresses.Daily, DAILY_PRICE]));
    }
    const result = await this.send(contract, calls);
    const spawned = result.events.find((e) => e.name === "GameSpawned");
    if (!spawned) throw new WriteError("No GameSpawned event in the receipt", result.transactionHash);
    return { ...result, gameId: Number(spawned.fields.gameId) };
  }

  /** Places the tile in hand. Tutorial games take the move from their script: only the game id. */
  build(key: GameKey, move: BuildMove): Promise<WriteResult> {
    const contract = gameContract(key.mode);
    const args: Encodable[] =
      key.mode === "tutorial"
        ? [key.gameId]
        : [key.gameId, move.orientation, move.x, move.y, move.role, move.spot];
    return this.send(contract, [this.call(contract, "build", args)]);
  }

  discard(key: GameKey): Promise<WriteResult> {
    const contract = gameContract(key.mode);
    return this.send(contract, [this.call(contract, "discard", [key.gameId])]);
  }

  surrender(key: GameKey): Promise<WriteResult> {
    const contract = gameContract(key.mode);
    return this.send(contract, [this.call(contract, "surrender", [key.gameId])]);
  }

  claim(tournamentId: number, rank: number): Promise<WriteResult> {
    return this.send("Daily", [this.call("Daily", "claim", [tournamentId, rank])]);
  }

  /** Adds `amount` to the current tournament's prize; approves it in the same transaction. */
  sponsor(amount: bigint): Promise<WriteResult> {
    return this.send("Daily", [
      this.call("Token", "approve", [this.options.deployment.addresses.Daily, amount]),
      this.call("Daily", "sponsor", [amount]),
    ]);
  }

  /** The test token's faucet (devnet only: the mock is never deployed elsewhere). */
  mint(): Promise<WriteResult> {
    return this.send("Token", [this.call("Token", "mint", [])]);
  }

  private call(contract: ContractName, entrypoint: string, args: Encodable[]): Call {
    return {
      contractAddress: this.options.deployment.addresses[contract],
      entrypoint,
      calldata: this.options.codecs[contract].encodeCall(entrypoint, args),
    };
  }

  private async send(contract: ContractName, calls: Call[]): Promise<WriteResult> {
    const { account, provider, codecs, deployment, tip, receiptPollMs = RECEIPT_POLL_MS } = this.options;
    const { transaction_hash } = await account.execute(calls, tip === undefined ? undefined : { tip });
    let receipt: Receipt;
    try {
      receipt = (await provider.waitForTransaction(transaction_hash, { retryInterval: receiptPollMs })) as Receipt;
    } catch (error) {
      throw new WriteError(error instanceof Error ? error.message : String(error), transaction_hash);
    }
    if (receipt.execution_status === "REVERTED") {
      throw new WriteError(receipt.revert_reason ?? "Transaction reverted", transaction_hash);
    }
    return {
      transactionHash: transaction_hash,
      events: receiptEvents(receipt, codecs, contract, deployment.addresses[contract]),
    };
  }
}
