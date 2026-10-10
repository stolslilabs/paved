import { shortString } from "starknet";
import { FAUCET_USDC_AMOUNT, LOBBY_ABI, MOCK_USDC_ABI, type Codecs, type ContractName } from "./abis";
import { AbiCodec as Codec, sameAddress, type AbiCodec, type DecodedEvent, type Encodable, type RawEvent } from "./codec";
import type { Deployment } from "./deployment";
import { receiptEvents } from "./events";
import { reclaimableAmount, rewardOf, type Rank } from "./prize";
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

/** True when a revert reason names `reason`: as text, or as the hex of the short string the node may return. */
export function revertNames(revert: string, reason: string): boolean {
  return revert.includes(reason) || revert.toLowerCase().includes(shortString.encodeShortString(reason).toLowerCase());
}

const NOT_FOUND = "Tournament: not found";
const NOTHING_TO_RECLAIM = "Tournament: nothing to reclaim";

/** A claim on a day that has no tournament: nobody sponsored it, so there is no prize and nothing to claim. */
export class NoPrizeDayError extends WriteError {
  constructor(transactionHash?: string) {
    super("This day has no prize: nobody sponsored it, so there is nothing to claim.", transactionHash, transactionHash !== undefined);
    this.name = "NoPrizeDayError";
  }
}

/**
 * A reclaim the contract refuses: the day was ranked (its prize goes to the ranks), the account sponsored nothing in
 * it, or it already took its part back. Nothing moved.
 */
export class NothingToReclaimError extends WriteError {
  constructor(message = "Nothing to reclaim: this day was ranked, or you sponsored nothing in it, or you already took it back.", transactionHash?: string) {
    super(message, transactionHash, transactionHash !== undefined);
    this.name = "NothingToReclaimError";
  }
}

/** The part a sponsor can reclaim at send is not the one they confirmed: nothing was sent. */
export class ReclaimAmountChangedError extends Error {
  constructor(readonly confirmed: bigint, readonly current: bigint) {
    super("The amount to reclaim changed: confirm again");
    this.name = "ReclaimAmountChangedError";
  }
}

/** A known revert of `Daily.claim` as its clear state; any other error unchanged. */
function claimRevert(error: unknown): unknown {
  // A revert of the receipt, or the node refusing at fee estimation before anything is sent: both name the reason.
  if (!(error instanceof WriteError)) return error;
  if (revertNames(error.message, NOT_FOUND)) return new NoPrizeDayError(error.transactionHash);
  if (revertNames(error.message, NOTHING_TO_RECLAIM)) return new NothingToReclaimError(undefined, error.transactionHash);
  return error;
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
      /**
       * What the account can still reclaim of a day's prize: its `Sponsored` events less its `Reclaimed` ones
       * (`EventReader.sponsorship`), read before each reclaim.
       */
      reclaimable?: (id: number, sponsor: string) => Promise<bigint>;
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

  /** Registers the account as a player; on devnet, mints its faucet USDC first (`mint`). */
  async createPlayer(name: string, options: { mintTestToken?: boolean } = {}): Promise<WriteResult> {
    const calls = [this.call("Account", "create", [feltOfName(name), this.address])];
    if (options.mintTestToken) calls.unshift(this.faucetCall());
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
    try {
      return await this.send("Daily", [this.call("Daily", "claim", [tournamentId, rank])]);
    } catch (error) {
      throw claimRevert(error);
    }
  }

  /**
   * A sponsor's reclaim (P-37): `claim(day, 0)`, sent by the sponsor, pays back their part of a prize nobody ranked for
   * (an empty top 3, or every score 0); rank rewards are not touched, and a ranked day has nothing to reclaim.
   * `confirmedAmount` is what the player saw and confirmed. Both the day and the amount are read again here, so a
   * ranked day, an amount that changed, a part already taken back, or a day not over sends nothing. The Reclaimed event
   * of the receipt (declared in Lobby's ABI, emitted from Daily) is in the result.
   */
  async reclaim(tournamentId: number, options: { confirmedAmount: bigint }): Promise<WriteResult> {
    const { tournament: readTournament, reclaimable: readReclaimable } = this.options;
    if (!readTournament || !readReclaimable) throw new WriteError("No tournament or sponsorship reader: cannot check the reclaim");
    let tournament: TournamentView;
    let amount: bigint;
    try {
      [tournament, amount] = await Promise.all([readTournament(tournamentId), readReclaimable(tournamentId, this.address)]);
    } catch (error) {
      throw new WriteError(`Cannot read the tournament: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!tournament.over) throw new WriteError("The tournament is not over");
    if (BigInt(tournament.top1PlayerId) !== 0n) {
      throw new NothingToReclaimError("This day was ranked: its prize goes to the ranks, so there is nothing to reclaim.");
    }
    amount = reclaimableAmount(tournament, amount);
    if (amount === 0n) throw new NothingToReclaimError("You sponsored nothing in this day, or already took it back.");
    if (amount !== options.confirmedAmount) throw new ReclaimAmountChangedError(options.confirmedAmount, amount);
    const call = this.call("Daily", "claim", [tournamentId, 0]);
    try {
      return await this.serialised(() => this.sendNow({ codec: new Codec(LOBBY_ABI), address: call.contractAddress }, [call]));
    } catch (error) {
      throw claimRevert(error);
    }
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

  /**
   * The devnet faucet: `MockUSDC.mint(self, FAUCET_USDC_AMOUNT)` at `deployment.mockUsdc` (the mock is never deployed
   * elsewhere). Without that address nothing is sent. Never in the controller's session: the burner signs it.
   */
  mint(): Promise<WriteResult> {
    return this.serialised(async () => {
      const call = this.faucetCall();
      return this.sendNow({ codec: new Codec(MOCK_USDC_ABI), address: call.contractAddress }, [call]);
    });
  }

  private faucetCall(): Call {
    const { mockUsdc } = this.options.deployment;
    if (!mockUsdc) throw new WriteError("No faucet: this deployment has no MockUSDC");
    return {
      contractAddress: mockUsdc,
      entrypoint: "mint",
      calldata: new Codec(MOCK_USDC_ABI).encodeCall("mint", [this.address, FAUCET_USDC_AMOUNT]),
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
