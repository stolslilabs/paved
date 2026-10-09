import { shortString } from "starknet";
import type { Codecs, ContractName } from "./abis";
import { sameAddress, type AbiCodec, type DecodedEvent, type Encodable, type RawEvent } from "./codec";
import type { Deployment } from "./deployment";
import { receiptEvents } from "./events";
import { rewardOf, type Rank } from "./prize";
import { gameContract, type GameKey, type GameMode, type PriceView, type TournamentView } from "./views";

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

/** The reward at send is not what the player confirmed: nothing was sent. */
export class RewardChangedError extends Error {
  constructor(readonly confirmed: bigint, readonly current: bigint) {
    super("The reward changed: confirm again");
    this.name = "RewardChangedError";
  }
}

/** The sponsored amount at send is not the one the player confirmed: nothing was sent. */
export class SponsorAmountChangedError extends Error {
  constructor(readonly confirmed: bigint, readonly current: bigint) {
    super("The sponsored amount changed: confirm again");
    this.name = "SponsorAmountChangedError";
  }
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

interface Receipt {
  execution_status?: string;
  revert_reason?: string;
  events?: RawEvent[];
}

/** A player name as a Cairo short string: at most 31 ASCII characters. */
function feltOfName(name: string): string {
  if (!/^[\x20-\x7e]{1,31}$/.test(name)) throw new WriteError("A name is 1 to 31 ASCII characters");
  return shortString.encodeShortString(name);
}

/**
 * The writes of the four contracts. Each one waits for its receipt and returns its decoded events.
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
      /** Tip per transaction; 0 on devnet, where starknet.js's tip estimate stalls. */
      tip?: bigint;
      /** Interval between two receipt requests while a write is pending. */
      receiptPollMs?: number;
      /** The Daily entry (`Daily.entry_price`): its token is the one a sponsorship is paid in. */
      entryPrice?: () => Promise<PriceView>;
      /** `Daily.tournament`, read before each claim. */
      tournament?: (id: number) => Promise<TournamentView>;
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

  /** Registers the account as a player; on the test token, mints its faucet amount first. */
  async createPlayer(name: string, options: { mintTestToken?: boolean } = {}): Promise<WriteResult> {
    const calls = [this.call("Account", "create", [feltOfName(name), this.address])];
    if (options.mintTestToken) calls.unshift(this.call("Token", "mint", []));
    return this.send("Account", calls);
  }

  /**
   * Spawns a free Tutorial game. A Daily game is bought, not spawned here: `Daily.spawn(stake, referrer, min_out)` takes
   * USDC and a swap floor (E3), which only `EconomyWriter.purchase` builds, after the player's confirm. Asked for a
   * Daily game this sends nothing.
   */
  async spawn(mode: GameMode): Promise<WriteResult & { gameId: number }> {
    if (mode === "daily") throw new WriteError("A Daily game is bought with the economy writer: nothing was sent");
    const result = await this.send("Tutorial", [this.call("Tutorial", "spawn", [])]);
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

  /**
   * Claims a rank of a closed tournament; the contract pays the reward out of the prize pool. The
   * tournament is read first: `confirmedReward` is what the player saw and confirmed, and a
   * different reward, a rank already claimed or a tournament not over sends nothing.
   */
  async claim(tournamentId: number, rank: Rank, options: { confirmedReward: bigint }): Promise<WriteResult> {
    if (!this.options.tournament) throw new WriteError("No tournament reader: cannot check the reward");
    let tournament: TournamentView;
    try {
      tournament = await this.options.tournament(tournamentId);
    } catch (error) {
      throw new WriteError(`Cannot read the tournament: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!tournament.over) throw new WriteError("The tournament is not over");
    if ([tournament.top1Claimed, tournament.top2Claimed, tournament.top3Claimed][rank - 1]) {
      throw new WriteError("This reward was already claimed");
    }
    const reward = rewardOf(tournament, rank);
    if (reward !== options.confirmedReward) throw new RewardChangedError(options.confirmedReward, reward);
    return this.send("Daily", [this.call("Daily", "claim", [tournamentId, rank])]);
  }

  /**
   * Adds `amount` to the current tournament's prize; approves exactly it in the same transaction.
   * `confirmedAmount` is what the player saw and confirmed: another amount sends nothing. An amount
   * of 0 is refused.
   */
  sponsor(amount: bigint, options: { confirmedAmount: bigint }): Promise<WriteResult> {
    if (amount <= 0n) return Promise.reject(new WriteError("A sponsored amount must be above 0"));
    if (options.confirmedAmount !== amount) {
      return Promise.reject(new SponsorAmountChangedError(options.confirmedAmount, amount));
    }
    return this.sendSponsor(amount);
  }

  private async sendSponsor(amount: bigint): Promise<WriteResult> {
    // The sponsorship is paid in the token Daily charges (USDC since E3), read from Daily, not assumed.
    if (!this.options.entryPrice) throw new WriteError("No entry price reader: cannot approve the sponsorship");
    let price: PriceView;
    try {
      price = await this.options.entryPrice();
    } catch (error) {
      throw new WriteError(`Cannot read the Daily entry token: ${error instanceof Error ? error.message : String(error)}`);
    }
    const approve = this.call("Token", "approve", [this.options.deployment.addresses.Daily, amount]);
    return this.send("Daily", [{ ...approve, contractAddress: price.token }, this.call("Daily", "sponsor", [amount])]);
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

  private send(contract: ContractName, calls: Call[]): Promise<WriteResult> {
    return this.serialised(() => this.sendNow(contract, calls));
  }

  /**
   * Sends calls built by another client of this account (the economy's, `economy/writer.ts`) in the same
   * serialisation as this writer's own: one write at a time across both. `prepare` runs inside it, so the reads
   * that check an amount happen after any earlier write has landed; it returns the calls and where the receipt's
   * events come from: one of the four contracts, or another contract's codec and address.
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
