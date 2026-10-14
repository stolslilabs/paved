import type { EconomyCodecs, EconomyContractName } from "../abis";
import { sameAddress, toHex, type Encodable } from "../codec";
import type { GameViews, PriceView } from "../views";
import { WriteError, revertNames, type Call, type PavedWriter, type WriteResult } from "../writer";
import { ADDRESS_BOUND, DEFAULT_SLIPPAGE_BPS, MAX_SLIPPAGE_BPS, PAVED_DECIMALS, PAVED_LABEL, expiresAt, formatUnits, impliedPaved, isStake, minOutFor, priceOf, quoteBelowFloor, settlesAfter, swapInputOf } from "./amounts";
import { POOL_CANNOT_FILL, POOL_QUOTE_UNAVAILABLE, isQuoteRevert, rateProblem, routerProblem, type PoolQuoter } from "./pool";
import type { EconomyDeployment } from "./deployment";
import type { EconomyViews, QuoteView, TermsView } from "./views";

/** The price of the purchase at send is not the one the player confirmed: nothing was sent. */
export class PurchasePriceChangedError extends Error {
  constructor(readonly confirmed: bigint, readonly current: bigint) {
    super("The price changed: confirm again");
    this.name = "PurchasePriceChangedError";
  }
}

/**
 * The purchase was sent and its receipt arrived, but it carries no `GameSpawned`: the outcome is unknown, not a
 * failure. The hash is kept; the screen says so and never invites a second purchase.
 */
export class PurchaseOutcomeUnknownError extends WriteError {
  constructor(transactionHash: string) {
    super(`Purchase sent (${transactionHash}), outcome unknown: check your games before buying again`, transactionHash);
    this.name = "PurchaseOutcomeUnknownError";
  }
}

const SPAWN_PAUSED = "Challenge: spawn paused";
/** What the player reads while new Challenge games are paused (the card, the dialog and the typed error). */
export const SPAWN_PAUSED_TEXT = "New Challenge games are paused for now. Games already started can still be played.";

/**
 * New Challenge games are paused (G4: the guardian or the owner called `pause_spawn`). Raised before any call is built when
 * `spawn_paused()` reads true, and when a `'Challenge: spawn paused'` revert comes back after a race. Nothing moved: the
 * revert is before any token transfer. Games already bought keep playing; the network fee of a reverted send is still paid.
 */
export class SpawnPausedError extends WriteError {
  constructor(transactionHash?: string) {
    super(SPAWN_PAUSED_TEXT, transactionHash, transactionHash !== undefined);
    this.name = "SpawnPausedError";
  }
}

const BELOW_MIN_OUT = "Economy: swap below min_out";
const TOO_EARLY = "Economy: day cannot close yet";

/**
 * The purchase reverted because the swap paid less than `min_out`: the pool's price moved between the quote and the
 * block. A revert moves no funds (the approve, the transfers and the swap are one transaction), so the USDC was not
 * spent; the network fee of the reverted transaction is still paid, which is why the message does not say "nothing was
 * charged". The player can confirm again at the new price.
 */
export class SwapBelowMinOutError extends WriteError {
  constructor(transactionHash?: string) {
    super("The price moved before your purchase went through: your USDC was not spent. Try again.", transactionHash, transactionHash !== undefined);
    this.name = "SwapBelowMinOutError";
  }
}

/** Settle refused by the contract: the game's day cannot be settled yet (it settles after the next day ends). */
export class SettleTooEarlyError extends WriteError {
  constructor(transactionHash?: string) {
    super("This day cannot be settled yet: try again after the next day ends.", transactionHash, transactionHash !== undefined);
    this.name = "SettleTooEarlyError";
  }
}

/** A known revert of the Economy as its clear state; any other error unchanged. */
function economyRevert(error: unknown): unknown {
  // A revert of the receipt, or the node refusing at fee estimation before anything is sent.
  if (!(error instanceof WriteError)) return error;
  if (revertNames(error.message, SPAWN_PAUSED)) return new SpawnPausedError(error.transactionHash);
  if (revertNames(error.message, BELOW_MIN_OUT)) return new SwapBelowMinOutError(error.transactionHash);
  if (revertNames(error.message, TOO_EARLY)) return new SettleTooEarlyError(error.transactionHash);
  return error;
}

/**
 * `Economy.quote_swap` gave no usable quote for the purchase's burn: it reverted (`'Economy: partial fill'`, any other
 * revert of the router), the call failed, or it quoted 0. No quote is no slippage protection: nothing was sent (E-9).
 * `detail` keeps the cause for the logs; the player reads only `POOL_CANNOT_FILL`.
 */
export class PoolCannotFillError extends WriteError {
  constructor(readonly detail: string) {
    super(`${POOL_CANNOT_FILL} Nothing was sent.`);
    this.name = "PoolCannotFillError";
  }
}

/** The quote could not be read (an RPC error, a rate limit, a timeout): not a revert. Nothing was sent. */
export class PoolQuoteUnavailableError extends WriteError {
  constructor(readonly detail: string) {
    super(`${POOL_QUOTE_UNAVAILABLE} Nothing was sent.`);
    this.name = "PoolQuoteUnavailableError";
  }
}

/**
 * The fresh quote at send gives a `min_out` below the one the player confirmed: the pool's price moved down. Nothing was
 * sent; a `min_out` below the confirmed one is never sent.
 */
export class PoolPriceMovedError extends Error {
  constructor(readonly confirmed: bigint, readonly current: bigint) {
    super("The pool price moved: confirm again");
    this.name = "PoolPriceMovedError";
  }
}

/**
 * `Economy.router()` is not the pinned router (E-9b, ruling 2), or the network has none: purchases are off. Nothing was
 * sent and the pool was not quoted.
 */
export class RouterNotPinnedError extends WriteError {
  constructor(readonly router: string, readonly expected: string, text: string) {
    super(`${text} Nothing was sent.`);
    this.name = "RouterNotPinnedError";
  }
}

/** On mainnet, `Economy.rate()` is 0, which only an unexpected upgrade can cause (E-9c): nothing sent, the pool not quoted. */
export class RateUnavailableError extends WriteError {
  constructor(text: string) {
    super(`${text}. Nothing was sent.`);
    this.name = "RateUnavailableError";
  }
}

/**
 * The referrer is one the contract would not pay (D-25 (E)): the payer's own address, or the deployment's Challenge or Economy.
 * One plain message for all three; `who` says which. Nothing was sent.
 */
export class RefusedReferrerError extends WriteError {
  constructor(readonly who: RefusedReferrer) {
    super("This address cannot be your referrer. Nothing was sent.");
    this.name = "RefusedReferrerError";
  }
}

/**
 * The fresh pool quote at send is below 90 % of the guard-rate value (E-9b, ruling 1) and the player did not accept such a
 * quote at the confirm: nothing was sent. The player confirms again and sees the warning with both figures.
 */
export class PoolQuoteBelowFloorError extends Error {
  constructor(readonly quote: bigint, readonly implied: bigint) {
    super("The pool quote is far below the guard rate: confirm again");
    this.name = "PoolQuoteBelowFloorError";
  }
}

/** A Vault amount at send is not the one the player confirmed: nothing was sent. */
export class VaultAmountChangedError extends Error {
  constructor(readonly confirmed: bigint, readonly current: bigint) {
    super("The amount changed: confirm again");
    this.name = "VaultAmountChangedError";
  }
}

const ZERO_SHARES = "Vault: zero shares";
const OVER_MAX_WITHDRAW = "ERC4626: exceeds max withdraw";
const OVER_MAX_REDEEM = "ERC4626: exceeds max redeem";
const NO_ALLOWANCE = "ERC20: insufficient allowance";

/**
 * A deposit too small to mint one vPAVED at the current rate (`preview_deposit` gives 0; the contract reverts with
 * `'Vault: zero shares'`, the inflation defence). Raised before sending when the preview reads 0, and from that revert.
 */
export class VaultZeroSharesError extends WriteError {
  constructor(transactionHash?: string) {
    super("This amount is too small to get any vPAVED: deposit more. Your PAVED was not moved.", transactionHash, transactionHash !== undefined);
    this.name = "VaultZeroSharesError";
  }
}

/**
 * A withdraw above `max_withdraw` (the most PAVED that leaves now, the exit fee taken), or a redeem above the vPAVED held.
 * Raised before sending from a fresh read, and from the ERC4626 revert after a race. `max` is null when only the revert says so.
 */
export class VaultOverMaxWithdrawError extends WriteError {
  constructor(readonly max: bigint | null, transactionHash?: string) {
    super(
      max === null
        ? "More than you can withdraw now. Your PAVED was not moved."
        : `More than you can withdraw: at most ${formatUnits(max, PAVED_DECIMALS, 4)} ${PAVED_LABEL} now, the exit fee taken. Nothing was sent.`,
      transactionHash,
      transactionHash !== undefined,
    );
    this.name = "VaultOverMaxWithdrawError";
  }
}

/**
 * The Vault could not pull the PAVED of a deposit: the allowance was missing or too small (`'ERC20: insufficient
 * allowance'`). The deposit approves exactly its amount in the same multicall, so only a changed approval in between
 * meets it. The revert moved nothing.
 */
export class VaultAllowanceError extends WriteError {
  constructor(transactionHash?: string) {
    super("The Vault was not allowed to take your PAVED: deposit again. Your PAVED was not moved.", transactionHash, transactionHash !== undefined);
    this.name = "VaultAllowanceError";
  }
}

/** A known revert of the Vault as its clear state; any other error unchanged. */
function vaultRevert(error: unknown): unknown {
  if (!(error instanceof WriteError) || error instanceof VaultOverMaxWithdrawError || error instanceof VaultZeroSharesError) return error;
  if (revertNames(error.message, ZERO_SHARES)) return new VaultZeroSharesError(error.transactionHash);
  if (revertNames(error.message, OVER_MAX_WITHDRAW) || revertNames(error.message, OVER_MAX_REDEEM)) return new VaultOverMaxWithdrawError(null, error.transactionHash);
  if (revertNames(error.message, NO_ALLOWANCE)) return new VaultAllowanceError(error.transactionHash);
  return error;
}

export interface PurchaseRequest {
  /** `k`, 1 to 10. */
  stake: number;
  /** The price the player saw and confirmed, USDC base units. Another price at send sends nothing. */
  confirmedPrice: bigint;
  /**
   * The least PAVED the player saw and confirmed (the confirm's `min_out`, at the default slippage), above 0. A fresh
   * `min_out` below it at send sends nothing (`PoolPriceMovedError`).
   */
  confirmedMinOut: bigint;
  /** The referrer from the link, or null. It changes no amount the player pays. */
  referrer: string | null;
  /** Taken off the pool quote for `min_out`: 1 % by default, at most 5 % (P-35). */
  slippageBps?: bigint;
  /**
   * The player saw the sanity warning (a pool quote below 90 % of the guard-rate value) and confirmed anyway. Without it, a
   * quote below the floor at send sends nothing (`PoolQuoteBelowFloorError`). It never lowers `confirmedMinOut`.
   */
  acceptedLowQuote?: boolean;
}

/** A purchase's calls and the figures they were built from, before anything is sent (for the tests and the docs). */
export interface PurchasePlan {
  calls: Call[];
  price: bigint;
  minOut: bigint;
  /** The USDC the purchase swaps in one swap (P-56): the burn quote plus the margin, the referral taken (`swapInputOf`). */
  swapIn: bigint;
  /** The pool's PAVED for `swapIn`, fee included, before the slippage. */
  poolOut: bigint;
  /** `swapIn`'s PAVED at the guard's rate (`impliedPaved`), null at a rate of 0. */
  implied: bigint | null;
  /** `Economy.router()`, read in this prepare and checked against the pin. */
  router: string;
  referrer: string;
  quote: QuoteView;
}

/**
 * The economy's writes for one account: the paid Challenge purchase, the settlement of a bought game (the player's
 * claim of PAVED), and the Vault's deposit and withdraw (vPAVED, P-56; no claim: the rate is the only reward). Each one reads what it pays or receives again
 * just before sending and refuses an amount the player did not confirm, or any failed read, sending nothing. The
 * writes go through the account's `PavedWriter`, so they are serialised with the game's writes.
 */
export class EconomyWriter {
  constructor(
    private readonly options: {
      writer: PavedWriter;
      deployment: EconomyDeployment;
      codecs: EconomyCodecs;
      views: EconomyViews;
      /** The game views of the same deployment: `Challenge.entry_price`. */
      gameViews: Pick<GameViews, "entryPrice" | "spawnPaused">;
      /** The pool's quote for the purchase's swap; null until CORE confirms `quote_swap` (every purchase is refused then). */
      poolQuoter: PoolQuoter | null;
      /**
       * Seconds since the epoch, compared with the day view's `settles_at`: the latest block's timestamp when the
       * client gives one (`EconomyClient.writer`), the device clock otherwise.
       */
      now?: () => number | Promise<number>;
      /** The chain check before any purchase (`EconomyClient.checkChain`); without it every purchase is refused. */
      checkChain?: () => Promise<void>;
    },
  ) {
    if (!options.deployment.configured) throw new WriteError(`Economy not deployed: ${options.deployment.missing.join(", ")} missing`);
  }

  get address(): string {
    return this.options.writer.address;
  }

  /**
   * Buys a Challenge game of stake `k`: approves `Challenge` on USDC for exactly the price, then
   * `Challenge.spawn(stake, referrer, min_out)`, in one multicall. The entry unit and the quote are read again first;
   * the price must be `k x entry_price().amount` and the one the player confirmed. The payer's own address as the
   * referrer, or the deployment's Challenge or Economy, is refused (`RefusedReferrerError`): the contract would not pay it.
   */
  async purchase(request: PurchaseRequest): Promise<WriteResult & { gameId: number }> {
    let result: WriteResult;
    try {
      result = await this.options.writer.sendCalls(async () => ({ calls: (await this.planPurchase(request)).calls, events: "Challenge" }));
    } catch (error) {
      // Sent, but its receipt could not be read (timeout, RPC drop): the USDC may have moved. Not a failure, unlike a
      // revert, which is a known one.
      if (error instanceof WriteError && error.transactionHash && !error.reverted) throw new PurchaseOutcomeUnknownError(error.transactionHash);
      throw economyRevert(error);
    }
    const spawned = result.events.find((e) => e.name === "GameSpawned");
    if (!spawned) throw new PurchaseOutcomeUnknownError(result.transactionHash);
    return { ...result, gameId: Number(spawned.fields.gameId) };
  }

  /** The calls `purchase` would send, after the same reads and checks; sends nothing. */
  async planPurchase(request: PurchaseRequest): Promise<PurchasePlan> {
    const { deployment, views, gameViews } = this.options;
    if (!isStake(request.stake)) throw new WriteError(`A stake is 1 to 10, got ${String(request.stake)}`);
    // The RPC's chain must be the deployment's before anything is read for a purchase (fails closed).
    if (!this.options.checkChain) throw new WriteError("Purchases are off: the network cannot be confirmed. Nothing was sent.");
    await this.options.checkChain();
    // Spawn paused (G4) before any quote or call is built. A failed read keeps today's behaviour: the contract's own revert
    // (`economyRevert`) is the guard then.
    if (await this.spawnPaused()) throw new SpawnPausedError();
    let entry: PriceView;
    let quote: QuoteView;
    let rate: bigint;
    let router: string;
    try {
      // The router and the guard's rate in the same prepare as the quote: fresh at every send, never the confirm's.
      [entry, quote, rate, router] = await Promise.all([gameViews.entryPrice(), views.quote(request.stake), views.guardRate(), views.router()]);
    } catch (error) {
      throw new WriteError(`Cannot read the price: ${message(error)}`);
    }
    // The router pin (E-9b, ruling 2) before anything else: an unexpected router is not quoted, and nothing is sent.
    const routerRefusal = routerProblem(deployment, router);
    if (routerRefusal) throw new RouterNotPinnedError(router, deployment.expectedRouter, routerRefusal);
    // On mainnet a rate of 0 is unexpected (the constructor refuses it, E-9c): purchases are paused, the pool not quoted.
    const rateRefusal = rateProblem(deployment, rate);
    if (rateRefusal) throw new RateUnavailableError(rateRefusal);
    if (!sameAddress(entry.token, deployment.addresses.USDC)) throw new WriteError("Unknown entry token: the Challenge entry is not paid in USDC");
    const price = priceOf(entry.amount, request.stake);
    if (price === 0n) throw new WriteError("The Challenge entry has no price: nothing to buy");
    if (quote.price !== price) throw new WriteError("The quote disagrees with the entry price: nothing was sent");
    if (request.confirmedPrice !== price) throw new PurchasePriceChangedError(request.confirmedPrice, price);
    if (typeof request.confirmedMinOut !== "bigint" || request.confirmedMinOut <= 0n) throw new WriteError("No confirmed minimum PAVED: confirm again");
    const referrer = referrerOf(request.referrer, this.address, { challenge: deployment.base.addresses.Challenge, economy: deployment.addresses.Economy });
    // `min_out` from the pool's quote (fee included) less the slippage; never from `min_out_hint`, which leaves the
    // fee out and would make the purchase revert (P-35). No quote, or a 0 one, is no slippage protection: refused.
    const slippage = request.slippageBps ?? DEFAULT_SLIPPAGE_BPS;
    if (typeof slippage !== "bigint" || slippage < 0n || slippage > MAX_SLIPPAGE_BPS) throw new WriteError(`Slippage is 0 to ${MAX_SLIPPAGE_BPS} bps`);
    if (!this.options.poolQuoter) throw new WriteError("No pool quote: nothing was sent");
    // A burn part outside (0, price], or a referral above the margin, is not this purchase's quote.
    if (quote.burnQuote <= 0n || quote.burnQuote > price) throw new WriteError("The quote's burn part is not within the price: nothing was sent");
    if (quote.referral < 0n || quote.referral > price - quote.burnQuote) throw new WriteError("The quote's referral is not within the margin: nothing was sent");
    // One swap of the burn quote and the margin (P-56): the price less the referral, which is paid only with a referrer.
    const swapIn = swapInputOf(quote, referrer !== "0x0");
    // A fresh quote at every send, taken here just before the account executes: never one shown earlier, nor cached.
    let poolOut: bigint;
    try {
      // The quote is for exactly the USDC the purchase swaps: `swapIn`, the burn quote and the margin (P-56).
      poolOut = await this.options.poolQuoter.quoteSwap(swapIn);
    } catch (error) {
      // No quote, no slippage protection: nothing is sent. Only the contract's revert (`'Economy: partial fill'`, any
      // router revert) means the pool cannot fill; a call that failed is a quote that could not be read.
      if (isQuoteRevert(error)) throw new PoolCannotFillError(message(error));
      throw new PoolQuoteUnavailableError(message(error));
    }
    const minOut = minOutFor(poolOut, slippage);
    if (minOut === 0n) throw new PoolCannotFillError(`the quote leaves a min_out of 0 (quote ${poolOut})`);
    // Never a `min_out` below what the player confirmed: a pool that moved down since the confirm sends nothing.
    if (minOut < request.confirmedMinOut) throw new PoolPriceMovedError(request.confirmedMinOut, minOut);
    // The sanity floor (E-9b, ruling 1): a quote below 90 % of the guard-rate value is a warning the player must have
    // accepted at the confirm; never a refusal on its own. A confirm without the warning sends nothing if it appears now.
    const implied = impliedPaved(swapIn, rate);
    if (implied !== null && quoteBelowFloor(poolOut, swapIn, rate) && request.acceptedLowQuote !== true) {
      throw new PoolQuoteBelowFloorError(poolOut, implied);
    }
    const calls = [
      this.call("USDC", "approve", [deployment.base.addresses.Challenge, price]),
      this.call("Challenge", "spawn", [request.stake, referrer, minOut]),
    ];
    return { calls, price, minOut, swapIn, poolOut, implied, router, referrer, quote };
  }

  /**
   * Settles bought Challenge games once their day may be settled, after the end of the next day (P-34): the contract
   * mints each one's reward to its player (`R x h(score / mean)`, 0 below the day's shifted mean). This is the
   * player's claim of PAVED; anyone may settle. It refuses what `Economy.settle` refuses (`contracts/src/systems/economy.cairo`,
   * `settle`): a game not bought (`'Economy: unknown game'`), not recorded (`'Economy: not recorded'`: not over, or never
   * recorded past its 24 h), or whose day cannot close yet (`'Economy: day cannot close yet'`, before `settlesAfter`, from
   * the chain's day id); and a game already settled, which the contract skips (`continue`), so sending it would only pay a
   * fee. A recorded expired game (P-34) is settled: the contract settles it for a reward of 0, and `noReward` lists it.
   */
  async settle(gameIds: number[]): Promise<WriteResult & { noReward: number[] }> {
    const noReward: number[] = [];
    try {
      return { ...(await this.sendSettle(gameIds, noReward)), noReward };
    } catch (error) {
      throw economyRevert(error);
    }
  }

  private sendSettle(gameIds: number[], noReward: number[]): Promise<WriteResult> {
    return this.options.writer.sendCalls(async () => {
      noReward.length = 0;
      gameIds = [...new Set(gameIds)];
      if (gameIds.length === 0) throw new WriteError("No game to settle");
      let now: number;
      try {
        now = await (this.options.now?.() ?? Math.floor(Date.now() / 1000));
      } catch (error) {
        throw new WriteError(`Cannot read the latest block: ${message(error)}`);
      }
      let checked: TermsView[];
      try {
        checked = await Promise.all(gameIds.map((gameId) => this.options.views.terms(gameId)));
      } catch (error) {
        throw new WriteError(`Cannot read the game: ${message(error)}`);
      }
      checked.forEach((terms, i) => {
        const id = gameIds[i];
        // `'Economy: unknown game'`: no player bought it.
        if (terms.stake === 0) throw new WriteError(`Game ${id} was not bought: nothing to settle`);
        // Skipped by the contract: a send would settle nothing and still pay the network fee.
        if (terms.settled) throw new WriteError(`Game ${id} is already settled`);
        // `'Economy: not recorded'`. Never recorded within its 24 h, it is expired too (P-34): no reward whenever it is
        // recorded; still refused until then, as the contract does.
        if (!terms.recorded && now >= expiresAt(terms.time)) throw new WriteError(`Game ${id} is expired: no reward`);
        if (!terms.recorded) throw new WriteError(`Game ${id} is not over yet`);
        // `'Economy: day cannot close yet'`: before the end of the next day, expired or not.
        const after = settlesAfter(terms.day);
        if (now < after) throw new WriteError(`Game ${id} settles after ${new Date(after * 1000).toISOString()}`);
        // Recorded expired (24 h or more after its purchase): the contract settles it for 0, outside the day's mean.
        if (terms.expired) noReward.push(id);
      });
      // `Span<u32>` by hand (the codec encodes no arrays): the length, then each id.
      const calldata = [toHex(gameIds.length), ...gameIds.map((id) => this.u32(id))];
      const call: Call = { contractAddress: this.options.deployment.addresses.Economy, entrypoint: "settle", calldata };
      return { calls: [call], events: { codec: this.options.codecs.Economy, address: this.options.deployment.addresses.Economy } };
    });
  }

  /**
   * Deposits PAVED in the Vault for vPAVED: approves exactly `amount`, then `deposit(amount, self)`, in one multicall. A
   * balance too small, or an amount too small to mint one vPAVED now (`preview_deposit` gives 0), sends nothing.
   */
  deposit(amount: bigint, options: { confirmedAmount: bigint }): Promise<WriteResult> {
    return this.sendVault(async () => {
      this.checkAmount(amount, options.confirmedAmount);
      const [balance, shares] = await Promise.all([
        this.read(() => this.options.views.pavedBalance(this.address), "PAVED balance"),
        this.read(() => this.options.views.previewDeposit(amount), "Vault rate"),
      ]);
      if (balance < amount) throw new WriteError("Not enough PAVED");
      if (shares === 0n) throw new VaultZeroSharesError();
      const { Vault } = this.options.deployment.addresses;
      return { calls: [this.call("PavedToken", "approve", [Vault, amount]), this.call("Vault", "deposit", [amount, this.address])], events: this.vaultEvents() };
    });
  }

  /**
   * Withdraws exactly `amount` PAVED: `withdraw(amount, self, self)`, which burns the vPAVED of `amount` plus the exit fee
   * (the fee stays in the Vault). Above `max_withdraw`, read just before, sends nothing (`VaultOverMaxWithdrawError`).
   */
  withdraw(amount: bigint, options: { confirmedAmount: bigint }): Promise<WriteResult> {
    return this.sendVault(async () => {
      this.checkAmount(amount, options.confirmedAmount);
      const position = await this.read(() => this.options.views.vault(this.address), "Vault position");
      if (amount > position.maxWithdraw) throw new VaultOverMaxWithdrawError(position.maxWithdraw);
      return { calls: [this.call("Vault", "withdraw", [amount, this.address, this.address])], events: this.vaultEvents() };
    });
  }

  /**
   * Withdraws everything: `redeem(shares, self, self)` of every vPAVED held, for their PAVED less the exit fee. The vPAVED
   * held at send must be the `confirmedShares` the player saw: another amount sends nothing (`VaultAmountChangedError`).
   */
  withdrawAll(options: { confirmedShares: bigint }): Promise<WriteResult> {
    return this.sendVault(async () => {
      const position = await this.read(() => this.options.views.vault(this.address), "Vault position");
      if (position.shares === 0n) throw new WriteError("No vPAVED to withdraw");
      if (position.shares !== options.confirmedShares) throw new VaultAmountChangedError(options.confirmedShares, position.shares);
      return { calls: [this.call("Vault", "redeem", [position.shares, this.address, this.address])], events: this.vaultEvents() };
    });
  }

  private async sendVault(prepare: () => Promise<{ calls: Call[]; events: ReturnType<EconomyWriter["vaultEvents"]> }>): Promise<WriteResult> {
    try {
      return await this.options.writer.sendCalls(prepare);
    } catch (error) {
      throw vaultRevert(error);
    }
  }

  private checkAmount(amount: bigint, confirmed: bigint): void {
    if (amount <= 0n) throw new WriteError("An amount must be above 0");
    if (amount !== confirmed) throw new VaultAmountChangedError(confirmed, amount);
  }

  private async spawnPaused(): Promise<boolean> {
    try {
      return await this.options.gameViews.spawnPaused();
    } catch {
      return false;
    }
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
      contractAddress: contract === "Challenge" ? base.addresses.Challenge : addresses[contract],
      entrypoint,
      calldata: this.options.codecs[contract].encodeCall(entrypoint, args),
    };
  }
}

/** Why a referrer is refused: the payer's own address, or one of the game's contracts that the contract never pays. */
export type RefusedReferrer = "payer" | "challenge" | "economy";

/** The contracts a referrer may not be (CORE's step E: the contract ignores them), from the deployment. */
export interface ReferrerContracts {
  challenge: string;
  economy: string;
}

/**
 * Which rule refuses `referrer` (any spelling, padded or not), or null when it may be sent. Since D-25 (E) a referrer is any
 * non-zero address other than the payer, the Challenge and the Economy, with no registration.
 */
export function refusedReferrer(referrer: string | bigint, self: string | null, contracts: ReferrerContracts): RefusedReferrer | null {
  const same = (other: string | null) => {
    try {
      return !!other && BigInt(other) !== 0n && sameAddress(referrer, other);
    } catch {
      return false;
    }
  };
  if (same(self)) return "payer";
  if (same(contracts.challenge)) return "challenge";
  if (same(contracts.economy)) return "economy";
  return null;
}

/**
 * The referrer to send: "0x0" for none (null or the zero address). A referrer `refusedReferrer` refuses is a
 * `RefusedReferrerError`, and nothing is sent. A malformed one is a `WriteError`, never a raw parse error.
 */
export function referrerOf(referrer: string | null, self: string, contracts: ReferrerContracts): string {
  if (!referrer) return "0x0";
  let value: bigint;
  try {
    value = BigInt(referrer);
  } catch {
    throw new WriteError(`Not a referrer address: ${referrer}`);
  }
  if (value < 0n || value >= ADDRESS_BOUND) throw new WriteError(`Not a referrer address: ${referrer}`);
  if (value === 0n) return "0x0";
  const refused = refusedReferrer(value, self, contracts);
  if (refused) throw new RefusedReferrerError(refused);
  return toHex(value);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
