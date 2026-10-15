import { shortString } from "starknet";
import { FAUCET_USDC_AMOUNT, FAUCET_ABI, type Codecs, type ContractName } from "./abis";
import { AbiCodec as Codec, sameAddress, type AbiCodec, type DecodedEvent, type Encodable, type RawEvent } from "./codec";
import type { CobbleClaim } from "./cobbles";
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
export const GAME_EXPIRED_TEXT = "This game has expired: its 24 hours are over. Surrender to close it: its score is recorded, but an expired game earns no reward.";

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

const INVALID_POSITION = "Challenge: invalid position";
/** What the player reads when a build names a square that cannot be on the board (CORE #391). */
export const INVALID_POSITION_TEXT = "This square is outside the board: choose a lit slot next to your tiles.";

/**
 * `Challenge.build` refused the position before any read (CORE #391): `x` or `y` is 0 or `u32::MAX`, a square no board
 * reaches. The client sends only slots next to its tiles, so this means a client bug; nothing moved.
 */
export class InvalidPositionError extends WriteError {
  constructor(transactionHash?: string) {
    super(INVALID_POSITION_TEXT, transactionHash, transactionHash !== undefined);
    this.name = "InvalidPositionError";
  }
}

/** `'Game: expired'` and `'Challenge: invalid position'` as their typed errors, from the fee estimation or the receipt; any other error unchanged. */
function expiredRevert(error: unknown): never {
  if (error instanceof WriteError && revertNames(error.message, GAME_EXPIRED)) throw new GameExpiredError(error.transactionHash);
  if (error instanceof WriteError && revertNames(error.message, INVALID_POSITION)) throw new InvalidPositionError(error.transactionHash);
  throw error;
}

/** A known revert of `Faucet.mint` as its clear state; any other error unchanged. */
function faucetRevert(error: unknown): unknown {
  if (!(error instanceof WriteError)) return error;
  if (OVER_ADDRESS_CAPS.some((reason) => revertNames(error.message, reason))) return new FaucetCapError("address", error.transactionHash);
  if (OVER_CALL_CAPS.some((reason) => revertNames(error.message, reason))) return new FaucetCapError("call", error.transactionHash);
  return error;
}

/** Why `Setup` refused a Cobbles claim, by its revert (`setup.cairo`, `errors`). */
export type ClaimRefusal = "no-cobbles" | "not-live" | "not-completed" | "claimed" | "no-live-quest" | "credit-claimed";

/** Each refusal's revert reason; `credit claimed` first, so it is never read as `claimed`. */
const CLAIM_REVERTS: Array<[string, ClaimRefusal]> = [
  ["Setup: credit claimed", "credit-claimed"],
  ["Setup: no live quest", "no-live-quest"],
  ["Setup: no cobbles", "no-cobbles"],
  ["Setup: not live", "not-live"],
  ["Setup: not completed", "not-completed"],
  ["Setup: claimed", "claimed"],
];

/** What the player reads for each refusal. */
export const CLAIM_REFUSAL_TEXT: Record<ClaimRefusal, string> = {
  "no-cobbles": "This quest or achievement gives no Cobbles.",
  "not-live": "This quest was not live in that period: there is nothing to claim for it.",
  "not-completed": "Not completed yet: the chain has not counted every game it needs.",
  claimed: "Already claimed.",
  "no-live-quest": "No quest with Cobbles was live in that period: there is no free game to claim.",
  "credit-claimed": "This free game is already claimed.",
};

/**
 * `Setup` refused a claim (`claim_quest`, `claim_achievement`, `claim_daily_credit`, `claim_weekly_credit`): nothing was
 * credited. In a multicall (`PavedWriter.claim`) one refusal reverts every claim of the transaction. `claimed` and
 * `credit-claimed` mean an earlier claim landed: the page reads the ledger again.
 */
export class ClaimRefusedError extends WriteError {
  constructor(readonly reason: ClaimRefusal, transactionHash?: string) {
    super(CLAIM_REFUSAL_TEXT[reason], transactionHash, transactionHash !== undefined);
    this.name = "ClaimRefusedError";
  }
}

/** A known revert of a claim as its `ClaimRefusedError`; any other error unchanged. */
function claimRevert(error: unknown): never {
  if (error instanceof WriteError) {
    const known = CLAIM_REVERTS.find(([reason]) => revertNames(error.message, reason));
    if (known) throw new ClaimRefusedError(known[1], error.transactionHash);
  }
  throw error;
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

  /** `Setup.claim_quest(quest_id, period)`: a quest's Cobbles for its day (daily) or week (weekly) number. */
  claimQuest(questId: number, period: number): Promise<WriteResult> {
    return this.claim([{ kind: "quest", questId, period }]);
  }

  /** `Setup.claim_achievement(achievement_id)`. */
  claimAchievement(achievementId: number): Promise<WriteResult> {
    return this.claim([{ kind: "achievement", achievementId }]);
  }

  /** `Setup.claim_daily_credit(day)`: the day's free game, once every daily with Cobbles live that day is done. */
  claimDailyCredit(day: number): Promise<WriteResult> {
    return this.claim([{ kind: "credit", credit: "daily", period: day }]);
  }

  /** `Setup.claim_weekly_credit(week)`: the same for the weeklies and a week number (`weekOfDay`). */
  claimWeeklyCredit(week: number): Promise<WriteResult> {
    return this.claim([{ kind: "credit", credit: "weekly", period: week }]);
  }

  /**
   * Several claims in one transaction (Claim all): one call each to `Setup`, in the order given, so one signature and one
   * receipt. The multicall is atomic: one refusal (`ClaimRefusedError`) reverts all of them. Its receipt holds one
   * `CobblesClaimed` or `CreditClaimed` per claim. Without a Setup address, or with no claim, nothing is sent.
   */
  claim(claims: readonly CobbleClaim[]): Promise<WriteResult> {
    if (!this.options.deployment.addresses.Setup) {
      return Promise.reject(new WriteError("No Setup contract in this deployment: nothing can be claimed"));
    }
    if (claims.length === 0) return Promise.reject(new WriteError("Nothing to claim"));
    const calls = claims.map((c) =>
      c.kind === "quest"
        ? this.call("Setup", "claim_quest", [c.questId, c.period])
        : c.kind === "achievement"
          ? this.call("Setup", "claim_achievement", [c.achievementId])
          : this.call("Setup", c.credit === "daily" ? "claim_daily_credit" : "claim_weekly_credit", [c.period]),
    );
    return this.send("Setup", calls).catch(claimRevert);
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
