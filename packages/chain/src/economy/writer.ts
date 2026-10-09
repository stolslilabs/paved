import type { EconomyCodecs, EconomyContractName } from "../abis";
import { sameAddress, toHex, type Encodable } from "../codec";
import type { GameViews, PriceView } from "../views";
import { WriteError, type Call, type PavedWriter, type WriteResult } from "../writer";
import { DEFAULT_SLIPPAGE_BPS, dayOver, isStake, minOutFor, priceOf } from "./amounts";
import type { EconomyDeployment } from "./deployment";
import type { EconomyViews, QuoteView, TermsView } from "./views";

/** The price of the purchase at send is not the one the player confirmed: nothing was sent. */
export class PurchasePriceChangedError extends Error {
  constructor(readonly confirmed: bigint, readonly current: bigint) {
    super("The price changed: confirm again");
    this.name = "PurchasePriceChangedError";
  }
}

/** A Vault amount at send is not the one the player confirmed: nothing was sent. */
export class VaultAmountChangedError extends Error {
  constructor(readonly confirmed: bigint, readonly current: bigint) {
    super("The amount changed: confirm again");
    this.name = "VaultAmountChangedError";
  }
}

export interface PurchaseRequest {
  /** `k`, 1 to 10. */
  stake: number;
  /** The price the player saw and confirmed, USDC base units. Another price at send sends nothing. */
  confirmedPrice: bigint;
  /** The referrer from the link, or null. It changes no amount the player pays. */
  referrer: string | null;
  /** Bps under the quote that the burn swap may return; 1 % by default. */
  slippageBps?: bigint;
}

/** A purchase's calls and the figures they were built from, before anything is sent (for the tests and the docs). */
export interface PurchasePlan {
  calls: Call[];
  price: bigint;
  minOut: bigint;
  referrer: string;
  quote: QuoteView;
}

/**
 * The economy's writes for one account: the paid Daily purchase, the settlement of a bought game (the player's
 * claim of PAVED), and the Vault's stake, unstake and dividends. Each one reads what it pays or receives again
 * just before sending and refuses an amount the player did not confirm, or any failed read, sending nothing. The
 * writes go through the account's `PavedWriter`, so they are serialised with the game's writes.
 *
 * `Economy`, the paid `Daily.spawn` and USDC are on STUB ABIs until E2/E3 (`stub-abi.ts`).
 */
export class EconomyWriter {
  constructor(
    private readonly options: {
      writer: PavedWriter;
      deployment: EconomyDeployment;
      codecs: EconomyCodecs;
      views: EconomyViews;
      /** The game views of the same deployment: `entry_price` and `game` of `Daily`. */
      gameViews: Pick<GameViews, "entryPrice" | "game">;
      /** Seconds since the epoch; the settlement checks that the day is over. */
      now?: () => number;
    },
  ) {
    if (!options.deployment.configured) throw new WriteError(`Economy not deployed: ${options.deployment.missing.join(", ")} missing`);
  }

  get address(): string {
    return this.options.writer.address;
  }

  /**
   * Buys a Daily game of stake `k`: approves `Daily` on USDC for exactly the price, then
   * `Daily.spawn(stake, referrer, min_out)`, in one multicall. The entry unit and the quote are read again first;
   * the price must be `k x entry_price().amount` and the one the player confirmed. A self-referral is sent as no
   * referrer (the contract pays none either).
   */
  async purchase(request: PurchaseRequest): Promise<WriteResult & { gameId: number }> {
    const result = await this.options.writer.sendCalls(async () => ({ calls: (await this.planPurchase(request)).calls, events: "Daily" }));
    const spawned = result.events.find((e) => e.name === "GameSpawned");
    if (!spawned) throw new WriteError("No GameSpawned event in the receipt", result.transactionHash);
    return { ...result, gameId: Number(spawned.fields.gameId) };
  }

  /** The calls `purchase` would send, after the same reads and checks; sends nothing. */
  async planPurchase(request: PurchaseRequest): Promise<PurchasePlan> {
    const { deployment, views, gameViews } = this.options;
    if (!isStake(request.stake)) throw new WriteError(`A stake is 1 to 10, got ${String(request.stake)}`);
    let entry: PriceView;
    let quote: QuoteView;
    try {
      [entry, quote] = await Promise.all([gameViews.entryPrice(), views.quote(request.stake)]);
    } catch (error) {
      throw new WriteError(`Cannot read the price: ${message(error)}`);
    }
    if (!sameAddress(entry.token, deployment.addresses.USDC)) throw new WriteError("Unknown entry token: the Daily entry is not paid in USDC");
    const price = priceOf(entry.amount, request.stake);
    if (price === 0n) throw new WriteError("The Daily entry has no price: nothing to buy");
    if (quote.price !== price) throw new WriteError("The quote disagrees with the entry price: nothing was sent");
    if (request.confirmedPrice !== price) throw new PurchasePriceChangedError(request.confirmedPrice, price);
    const referrer = request.referrer && BigInt(request.referrer) !== 0n && !sameAddress(request.referrer, this.address) ? toHex(request.referrer) : "0x0";
    const minOut = minOutFor(quote.minOutHint, request.slippageBps ?? DEFAULT_SLIPPAGE_BPS);
    const calls = [
      this.call("USDC", "approve", [deployment.base.addresses.Daily, price]),
      this.call("DailyPaid", "spawn", [request.stake, referrer, minOut]),
    ];
    return { calls, price, minOut, referrer, quote };
  }

  /**
   * Settles bought Daily games once their day is over: the contract mints each one's reward to its player (`R x
   * h(score / mean)`, 0 below the day's shifted mean). This is the player's claim of PAVED; anyone may settle. A
   * game not bought, not over, already settled or whose day is running sends nothing.
   */
  settle(gameIds: number[]): Promise<WriteResult> {
    return this.options.writer.sendCalls(async () => {
      if (gameIds.length === 0) throw new WriteError("No game to settle");
      const now = this.options.now?.() ?? Math.floor(Date.now() / 1000);
      let checked: Array<{ terms: TermsView; over: boolean }>;
      try {
        checked = await Promise.all(
          gameIds.map(async (gameId) => {
            const [terms, game] = await Promise.all([this.options.views.terms(gameId), this.options.gameViews.game({ mode: "daily", gameId })]);
            return { terms, over: game.over };
          }),
        );
      } catch (error) {
        throw new WriteError(`Cannot read the game: ${message(error)}`);
      }
      checked.forEach(({ terms, over }, i) => {
        const id = gameIds[i];
        if (terms.stake === 0) throw new WriteError(`Game ${id} was not bought: nothing to settle`);
        if (terms.settled) throw new WriteError(`Game ${id} is already settled`);
        if (!over) throw new WriteError(`Game ${id} is not over`);
        if (!dayOver(terms.day, now)) throw new WriteError(`The day of game ${id} is not over`);
      });
      // `Span<u32>` by hand (the codec encodes no arrays): the length, then each id.
      const calldata = [toHex(gameIds.length), ...gameIds.map((id) => this.u32(id))];
      const call: Call = { contractAddress: this.options.deployment.addresses.Economy, entrypoint: "settle", calldata };
      return { calls: [call], events: { codec: this.options.codecs.Economy, address: this.options.deployment.addresses.Economy } };
    });
  }

  /** Stakes PAVED in the Vault: approves exactly `amount`, then `stake`, in one multicall. */
  stake(amount: bigint, options: { confirmedAmount: bigint }): Promise<WriteResult> {
    return this.options.writer.sendCalls(async () => {
      this.checkAmount(amount, options.confirmedAmount);
      const balance = await this.read(() => this.options.views.pavedBalance(this.address), "PAVED balance");
      if (balance < amount) throw new WriteError("Not enough PAVED");
      const { Vault } = this.options.deployment.addresses;
      return { calls: [this.call("PavedToken", "approve", [Vault, amount]), this.call("Vault", "stake", [amount])], events: this.vaultEvents() };
    });
  }

  /** Takes PAVED back out of the Vault (the pending dividends are paid with it). */
  unstake(amount: bigint, options: { confirmedAmount: bigint }): Promise<WriteResult> {
    return this.options.writer.sendCalls(async () => {
      this.checkAmount(amount, options.confirmedAmount);
      const position = await this.read(() => this.options.views.vault(this.address), "Vault position");
      if (position.staked < amount) throw new WriteError("More than is staked");
      return { calls: [this.call("Vault", "unstake", [amount])], events: this.vaultEvents() };
    });
  }

  /** Pays the pending USDC dividends. `confirmedAmount` is what the player saw: another amount sends nothing. */
  claimDividends(options: { confirmedAmount: bigint }): Promise<WriteResult> {
    return this.options.writer.sendCalls(async () => {
      const position = await this.read(() => this.options.views.vault(this.address), "dividends");
      if (position.pending === 0n) throw new WriteError("No dividends to claim");
      if (position.pending !== options.confirmedAmount) throw new VaultAmountChangedError(options.confirmedAmount, position.pending);
      return { calls: [this.call("Vault", "claim", [])], events: this.vaultEvents() };
    });
  }

  private checkAmount(amount: bigint, confirmed: bigint): void {
    if (amount <= 0n) throw new WriteError("An amount must be above 0");
    if (amount !== confirmed) throw new VaultAmountChangedError(confirmed, amount);
  }

  private async read<T>(read: () => Promise<T>, what: string): Promise<T> {
    try {
      return await read();
    } catch (error) {
      throw new WriteError(`Cannot read the ${what}: ${message(error)}`);
    }
  }

  private vaultEvents() {
    return { codec: this.options.codecs.Vault, address: this.options.deployment.addresses.Vault };
  }

  private u32(id: number): string {
    if (!Number.isInteger(id) || id < 0 || id >= 2 ** 32) throw new WriteError(`Not a game id: ${String(id)}`);
    return toHex(id);
  }

  private call(contract: EconomyContractName, entrypoint: string, args: Encodable[]): Call {
    const { addresses, base } = this.options.deployment;
    return {
      contractAddress: contract === "DailyPaid" ? base.addresses.Daily : addresses[contract],
      entrypoint,
      calldata: this.options.codecs[contract].encodeCall(entrypoint, args),
    };
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
