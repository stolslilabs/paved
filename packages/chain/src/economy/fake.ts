// FOR UNIT TESTS ONLY. Not exported from `@paved/chain`: tests import it from `@paved/chain/testing`, the entry for
// test doubles. No app code may import it.
import { ViewError } from "../views";
import { BPS, RATE_SCALE, isStake, minOutFor, priceOf, swapInputOf } from "./amounts";
import type { PoolQuoter } from "./pool";
import type { DayView, EconomyViews, QuoteView, SplitView, TermsView, VaultPosition } from "./views";

/** USDC's base units of 2 USDC: the `Mode::Challenge` unit price of economy.md. */
export const FAKE_UNIT = 2_000_000n;

/** The fake `Economy.router()`: tests put it in the deployment file as `MockRouter` (`FAKE_ROUTER_FILE`). */
export const FAKE_ROUTER = "0xd3de";
/** The chain id of the fake deployments (`SN_SEPOLIA`): a test RPC answers it to `getChainId`. */
export const FAKE_CHAIN_ID = "0x534e5f5345504f4c4941";
/**
 * A deployments file that names `FAKE_ROUTER` as the mock router and `FAKE_CHAIN_ID` as its chain: the purchase's router
 * pin and chain check then accept the fakes.
 */
/** The fake network's file: its MockRouter, and a Faucet at 0x13 (the USDC of the tests' `ECON`: on the faucet networks the economy reads the Faucet only). */
export const FAKE_ROUTER_FILE = { chain_id: FAKE_CHAIN_ID, contracts: { MockRouter: { address: FAKE_ROUTER }, Faucet: { address: "0x13" } } };

/** What `terms` answers for a game that was not bought (E2). */
const notBought: TermsView = {
  player: "0x0", time: 0, day: 0, stake: 0, reference: 0n, sigmaBps: 0, slopeBps: 0, cap: 0, score: 0, recorded: false, expired: false, settled: false, reward: 0n,
};

/** A bought game's terms, for tests: the given fields over plausible defaults. */
export function fakeTerms(fields: Partial<TermsView>): TermsView {
  // `time` is the purchase's block time: the start of its `day` unless given (as the contract: `day = time / 86400`).
  const day = fields.day ?? 0;
  return { ...notBought, time: day * 86_400, stake: 1, reference: 10n ** 18n, slopeBps: 12_220, cap: 5, recorded: true, ...fields };
}

/** In-memory economy views with E2's shapes. `fail` makes every read throw, as an RPC down. */
export class FakeEconomy implements EconomyViews {
  unit = FAKE_UNIT;
  /** PAVED per USDC base unit the fake router quotes, as a ratio. */
  rate = { paved: 80n * 10n ** 18n, usdc: 1_000_000n };
  /** `Economy.rate()`, x `RATE_SCALE`: by default the same ratio as `rate`, so `FakePoolQuoter` quotes 95 % of implied. */
  guardRate_ = (80n * 10n ** 18n * RATE_SCALE) / 1_000_000n;
  /** `Economy.split_bps()`: the quote follows it (burn and referral of the price, the Vault the rest). */
  split_: SplitView = { burn: 7_000, vault: 3_000, referral: 500 };
  /** `Economy.router()`. */
  router_ = FAKE_ROUTER;
  threshold = 3_980_000;
  mean = 3_980_000;
  readonly days = new Map<number, DayView>();
  readonly terms_ = new Map<number, TermsView>();
  /** vPAVED held, by account. */
  readonly shares = new Map<string, bigint>();
  /** The Vault (P-56): its PAVED, its vPAVED (1,000 dead shares at deployment, as `deploy.sh`) and the exit fee. */
  vaultAssets = 1_000n * 10n ** 18n;
  vaultSupply = 1_000n * 10n ** 18n;
  /** The deployment's default (`DEFAULT_EXIT_FEE_BPS`, 5 %, P-56). */
  exitFeeBps = 500;
  /** `Vault.delegates`, by account: none delegated by default. */
  readonly delegates = new Map<string, string>();
  readonly usdc = new Map<string, bigint>();
  readonly paved = new Map<string, bigint>();
  fail: string | null = null;
  calls: string[] = [];

  async quote(stake: number): Promise<QuoteView> {
    this.check(`quote ${stake}`);
    if (!isStake(stake)) throw new ViewError("rpc", "Economy: bad stake");
    const price = priceOf(this.unit, stake);
    const burnQuote = (price * BigInt(this.split_.burn)) / BPS;
    // An estimate at the guard's rate without the pool fee, as E2: above what the swap returns.
    const out = (burnQuote * this.rate.paved) / this.rate.usdc;
    return {
      price,
      burnQuote,
      referral: (price * BigInt(this.split_.referral)) / BPS,
      margin: price - burnQuote,
      minOutHint: out,
      factor: 10_000,
      mean: this.mean,
      threshold: this.threshold,
      slope: 12_220,
      cap: 5,
    };
  }

  async split(): Promise<SplitView> {
    this.check("split");
    return { ...this.split_ };
  }

  async guardRate(): Promise<bigint> {
    this.check("rate");
    return this.guardRate_;
  }

  async router(): Promise<string> {
    this.check("router");
    return this.router_;
  }

  async day(day: number): Promise<DayView> {
    this.check(`day ${day}`);
    return { ...(this.days.get(day) ?? { prior: this.mean, sum: 0n, weight: 0, mean: 0, closed: false }) };
  }

  async terms(gameId: number): Promise<TermsView> {
    this.check(`terms ${gameId}`);
    return { ...(this.terms_.get(gameId) ?? notBought) };
  }

  async vault(account: string): Promise<VaultPosition> {
    this.check(`vault ${account}`);
    const shares = this.shares.get(BigInt(account).toString(16)) ?? 0n;
    return {
      shares,
      value: this.toAssets(shares),
      maxWithdraw: this.redeemed(shares),
      exitFeeBps: this.exitFeeBps,
      totalAssets: this.vaultAssets,
      totalSupply: this.vaultSupply,
    };
  }

  async maxRedeem(account: string): Promise<bigint> {
    this.check(`max_redeem ${account}`);
    return this.shares.get(BigInt(account).toString(16)) ?? 0n;
  }

  async delegateOf(account: string): Promise<string | null> {
    this.check(`delegates ${account}`);
    return this.delegates.get(BigInt(account).toString(16)) ?? null;
  }

  // OpenZeppelin's ERC4626 at offset 0 with the Vault's exit fee (`contracts/src/systems/vault.cairo`).
  async previewDeposit(assets: bigint): Promise<bigint> {
    this.check(`preview_deposit ${assets}`);
    return (assets * (this.vaultSupply + 1n)) / (this.vaultAssets + 1n);
  }

  async previewWithdraw(assets: bigint): Promise<bigint> {
    this.check(`preview_withdraw ${assets}`);
    const total = assets + ceilDiv(assets * BigInt(this.exitFeeBps), BPS);
    return ceilDiv(total * (this.vaultSupply + 1n), this.vaultAssets + 1n);
  }

  async previewRedeem(shares: bigint): Promise<bigint> {
    this.check(`preview_redeem ${shares}`);
    return this.redeemed(shares);
  }

  private toAssets(shares: bigint): bigint {
    return (shares * (this.vaultAssets + 1n)) / (this.vaultSupply + 1n);
  }

  private redeemed(shares: bigint): bigint {
    const value = this.toAssets(shares);
    const fee = BigInt(this.exitFeeBps);
    return value - ceilDiv(value * fee, fee + BPS);
  }

  async usdcBalance(account: string): Promise<bigint> {
    this.check(`usdc ${account}`);
    return this.usdc.get(BigInt(account).toString(16)) ?? 0n;
  }

  async pavedBalance(account: string): Promise<bigint> {
    this.check(`paved ${account}`);
    return this.paved.get(BigInt(account).toString(16)) ?? 0n;
  }

  /** Gives `account` `shares` vPAVED, minted at the current rate: the Vault's totals grow by the shares and their PAVED. */
  setShares(account: string, shares: bigint): void {
    const key = BigInt(account).toString(16);
    const delta = shares - (this.shares.get(key) ?? 0n);
    this.vaultAssets += this.toAssets(delta);
    this.vaultSupply += delta;
    this.shares.set(key, shares);
  }

  /** `account` delegated its votes to `delegatee` (`delegate`, which the client never sends). */
  setDelegate(account: string, delegatee: string): void {
    this.delegates.set(BigInt(account).toString(16), delegatee);
  }

  setBalance(token: "usdc" | "paved", account: string, amount: bigint): void {
    (token === "usdc" ? this.usdc : this.paved).set(BigInt(account).toString(16), amount);
  }

  /**
   * The `min_out` a purchase of `stake` sends with `FakePoolQuoter` and the default slippage: the quote of its one swap,
   * the burn quote and the margin, the referral taken when `referred` (P-56).
   */
  async expectedMinOut(stake: number, pool: FakePoolQuoter = new FakePoolQuoter(), referred = false): Promise<bigint> {
    return minOutFor(await pool.quoteSwap(swapInputOf(await this.quote(stake), referred)));
  }

  private check(call: string): void {
    this.calls.push(call);
    if (this.fail) throw new ViewError("rpc", this.fail);
  }
}

/** A pool quote for tests: PAVED per USDC base unit at `rate`, less the pool's 5 % fee. `fail` throws; `zero` quotes 0. */
export class FakePoolQuoter implements PoolQuoter {
  rate = { paved: 80n * 10n ** 18n, usdc: 1_000_000n };
  fail: string | null = null;
  zero = false;
  calls: bigint[] = [];

  async quoteSwap(usdcIn: bigint): Promise<bigint> {
    this.calls.push(usdcIn);
    if (this.fail) throw new ViewError("rpc", this.fail);
    if (this.zero) return 0n;
    return (usdcIn * 95n * this.rate.paved) / (100n * this.rate.usdc);
  }
}

function ceilDiv(a: bigint, b: bigint): bigint {
  return (a + b - 1n) / b;
}
