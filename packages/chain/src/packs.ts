import { sameAddress } from "./codec";
import { BPS, DEFAULT_SLIPPAGE_BPS, MAX_SLIPPAGE_BPS, impliedPaved, minOutFor, quoteBelowFloor } from "./economy/amounts";
import type { EconomyClient } from "./economy/client";
import type { EconomyDeployment } from "./economy/deployment";
import { isQuoteRevert, rateProblem, routerProblem, type PoolQuoter } from "./economy/pool";
import type { EconomyViews, SplitView } from "./economy/views";
import { PoolCannotFillError, PoolPriceMovedError, PoolQuoteBelowFloorError, PoolQuoteUnavailableError, RateUnavailableError, RouterNotPinnedError, referrerOf } from "./economy/writer";
import { MAX_PACK_ID, type PackView, type PackViews } from "./views";
import { WriteError, type PackBought, type PavedWriter, type WriteResult } from "./writer";

// The packs of Cobbles (cobbles v1, part 2, CORE #453): the packs on sale, read from `Setup.pack`, and their purchase
// (`PavedWriter.buyPack`) after the same fresh reads and checks as a game's purchase (`EconomyWriter.planPurchase`).

/** Every pack id `Setup` may hold, 1 to `MAX_PACK_ID`. */
export const PACK_IDS: readonly number[] = Array.from({ length: MAX_PACK_ID }, (_, i) => i + 1);

/** A pack that can be bought: on sale, with Cobbles and a price (its price per Cobble and its discount divide by them). */
export const onSale = (pack: PackView): boolean => pack.active && pack.cobbles > 0 && pack.price > 0n;

/** The packs on sale, cheapest first: `Setup.pack` of every id, in parallel. A failed read fails the whole list. */
export async function readPacks(views: PackViews, ids: readonly number[] = PACK_IDS): Promise<PackView[]> {
  const packs = await Promise.all(ids.map((id) => views.pack(id)));
  return packs.filter(onSale).sort((a, b) => (a.price < b.price ? -1 : a.price > b.price ? 1 : a.packId - b.packId));
}

/**
 * The USDC a pack's one swap takes (`Economy.pay`): the price, less the referral when a referrer counts. The referral is
 * `price x referral_bps / 10,000`, as `curve::split`.
 */
export function packSwapInput(price: bigint, split: Pick<SplitView, "referral">, referred: boolean): bigint {
  return referred ? price - (price * BigInt(split.referral)) / BPS : price;
}

/** A pack's purchase as the player confirmed it. */
export interface PackPurchaseRequest {
  packId: number;
  /** The price the player saw and confirmed, USDC base units. Another price at send sends nothing. */
  confirmedPrice: bigint;
  /** The least PAVED the player saw (the confirm's `min_out`), above 0. A fresh `min_out` below it sends nothing (`PoolPriceMovedError`). */
  confirmedMinOut: bigint;
  /** The referrer from the link, or null. It changes no amount the player pays. */
  referrer: string | null;
  /** Taken off the pool quote for `min_out`: 1 % by default, at most 5 %. */
  slippageBps?: bigint;
  /** The player saw the sanity warning (a quote below 90 % of the guard-rate value) and confirmed anyway. */
  acceptedLowQuote?: boolean;
}

/** What `PackBuyer.plan` read and would send. */
export interface PackPlan {
  pack: PackView;
  referrer: string;
  swapIn: bigint;
  poolOut: bigint;
  minOut: bigint;
  router: string;
}

/** The pack's price at send is not the one the player confirmed (the owner changed it): nothing was sent. */
export class PackPriceChangedError extends WriteError {
  constructor(readonly confirmed: bigint, readonly current: bigint) {
    super("This pack's price changed: confirm again. Nothing was sent.");
    this.name = "PackPriceChangedError";
  }
}

/** The pack is not on sale at send (`active` false, or never set): nothing was sent. */
export class PackNotOnSaleError extends WriteError {
  constructor(readonly packId: number) {
    super("This pack is not on sale any more. Nothing was sent.");
    this.name = "PackNotOnSaleError";
  }
}

export interface PackBuyerOptions {
  writer: Pick<PavedWriter, "address" | "buyPack">;
  /** `Setup.pack`. */
  packs: PackViews;
  /** The economy's split, guard rate and router. */
  economy: Pick<EconomyViews, "split" | "guardRate" | "router">;
  deployment: EconomyDeployment;
  /** `Economy.quote_swap`; null refuses every purchase. */
  poolQuoter: PoolQuoter | null;
  /** The chain check before any purchase (`EconomyClient.checkChain`); without it every purchase is refused. */
  checkChain?: () => Promise<void>;
}

/**
 * A pack's purchase for one account. Before sending it reads again what it pays and what protects it, as a game's purchase
 * does: the chain, the pack (on sale, at the confirmed price), the router pin, the guard's rate, the split and a fresh pool
 * quote for the pack's swap; a `min_out` below the confirmed one, or any failed read, sends nothing. Then
 * `PavedWriter.buyPack`: the approve of exactly the price and `Setup.buy_pack`, serialised with the account's other writes.
 */
export class PackBuyer {
  constructor(private readonly options: PackBuyerOptions) {
    if (!options.deployment.configured) throw new WriteError(`Economy not deployed: ${options.deployment.missing.join(", ")} missing`);
  }

  get address(): string {
    return this.options.writer.address;
  }

  async buy(request: PackPurchaseRequest): Promise<WriteResult & { bought: PackBought }> {
    const plan = await this.plan(request);
    return this.options.writer.buyPack({ packId: plan.pack.packId, referrer: plan.referrer, minOut: plan.minOut, price: plan.pack.price }, this.options.deployment.addresses.USDC);
  }

  /** The reads and checks of `buy`; sends nothing. */
  async plan(request: PackPurchaseRequest): Promise<PackPlan> {
    const { deployment, economy, packs } = this.options;
    if (!Number.isInteger(request.packId) || request.packId < 1 || request.packId > MAX_PACK_ID) throw new WriteError(`Not a pack id: ${String(request.packId)}`);
    if (!this.options.checkChain) throw new WriteError("Purchases are off: the network cannot be confirmed. Nothing was sent.");
    await this.options.checkChain();
    let pack: PackView;
    let split: SplitView;
    let rate: bigint;
    let router: string;
    try {
      [pack, split, rate, router] = await Promise.all([packs.pack(request.packId), economy.split(), economy.guardRate(), economy.router()]);
    } catch (error) {
      throw new WriteError(`Cannot read the price: ${message(error)}`);
    }
    const routerRefusal = routerProblem(deployment, router);
    if (routerRefusal) throw new RouterNotPinnedError(router, deployment.expectedRouter, routerRefusal);
    const rateRefusal = rateProblem(deployment, rate);
    if (rateRefusal) throw new RateUnavailableError(rateRefusal);
    if (!onSale(pack)) throw new PackNotOnSaleError(request.packId);
    if (request.confirmedPrice !== pack.price) throw new PackPriceChangedError(request.confirmedPrice, pack.price);
    if (typeof request.confirmedMinOut !== "bigint" || request.confirmedMinOut <= 0n) throw new WriteError("No confirmed minimum PAVED: confirm again");
    const referrer = packReferrer(request.referrer, this.address, deployment, router);
    const slippage = request.slippageBps ?? DEFAULT_SLIPPAGE_BPS;
    if (typeof slippage !== "bigint" || slippage < 0n || slippage > MAX_SLIPPAGE_BPS) throw new WriteError(`Slippage is 0 to ${MAX_SLIPPAGE_BPS} bps`);
    if (!this.options.poolQuoter) throw new WriteError("No pool quote: nothing was sent");
    const swapIn = packSwapInput(pack.price, split, referrer !== "0x0");
    let poolOut: bigint;
    try {
      poolOut = await this.options.poolQuoter.quoteSwap(swapIn);
    } catch (error) {
      if (isQuoteRevert(error)) throw new PoolCannotFillError(message(error));
      throw new PoolQuoteUnavailableError(message(error));
    }
    const minOut = minOutFor(poolOut, slippage);
    if (minOut === 0n) throw new PoolCannotFillError(`the quote leaves a min_out of 0 (quote ${poolOut})`);
    if (minOut < request.confirmedMinOut) throw new PoolPriceMovedError(request.confirmedMinOut, minOut);
    const implied = impliedPaved(swapIn, rate);
    if (implied !== null && quoteBelowFloor(poolOut, swapIn, rate) && request.acceptedLowQuote !== true) throw new PoolQuoteBelowFloorError(poolOut, implied);
    return { pack, referrer, swapIn, poolOut, minOut, router };
  }
}

/**
 * The referrer a pack's purchase sends. The payer, the Challenge and the Economy are refused as for a game
 * (`referrerOf`: `RefusedReferrerError`); `Setup`, the Vault and the router, which `Economy.pay` ignores, are sent as
 * "0x0", so the swap the client quotes is the one the contract runs.
 */
export function packReferrer(referrer: string | null, self: string, deployment: EconomyDeployment, router: string): string {
  const sent = referrerOf(referrer, self, { challenge: deployment.base.addresses.Challenge, economy: deployment.addresses.Economy });
  if (sent === "0x0") return sent;
  const ignored = [deployment.base.addresses.Setup, deployment.addresses.Vault, router].some((other) => {
    try {
      return !!other && BigInt(other) !== 0n && sameAddress(sent, other);
    } catch {
      return false;
    }
  });
  return ignored ? "0x0" : sent;
}

/** The pack buyer of an economy client and the account's writer: the same views, quoter and chain check as its purchases. */
export function packBuyerOf(client: EconomyClient, writer: PackBuyerOptions["writer"]): PackBuyer {
  return new PackBuyer({
    writer,
    packs: client.base.views as unknown as PackViews,
    economy: client.views,
    deployment: client.deployment,
    poolQuoter: client.poolQuoter,
    checkChain: () => client.checkChain(),
  });
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
