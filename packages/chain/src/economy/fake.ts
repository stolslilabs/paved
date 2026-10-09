// FOR UNIT TESTS ONLY. Not exported from `@paved/chain`: tests import it by path (`@paved/chain/economy/fake` in
// app-web's tests, whose alias points at the sources). No app code may import it.
import { ViewError } from "../views";
import { BPS, isStake, minOutFor, priceOf, referralOf } from "./amounts";
import type { DayView, EconomyViews, QuoteView, TermsView, VaultPosition } from "./views";

/** USDC's base units of 2 USDC: the `Mode::Daily` unit price of economy.md. */
export const FAKE_UNIT = 2_000_000n;

/** In-memory economy views with the stub's shapes. `fail` makes every read throw, as an RPC down. */
export class FakeEconomy implements EconomyViews {
  unit = FAKE_UNIT;
  /** PAVED per USDC base unit the fake router quotes, as a ratio. */
  rate = { paved: 80n * 10n ** 18n, usdc: 1_000_000n };
  threshold = 3_353;
  mean = 3_353_000;
  readonly days = new Map<number, DayView>();
  readonly terms_ = new Map<number, TermsView>();
  readonly vaults = new Map<string, VaultPosition>();
  readonly usdc = new Map<string, bigint>();
  readonly paved = new Map<string, bigint>();
  totalStaked = 0n;
  fail: string | null = null;
  calls: string[] = [];

  async quote(stake: number): Promise<QuoteView> {
    this.check(`quote ${stake}`);
    if (!isStake(stake)) throw new ViewError("rpc", "Economy: bad stake");
    const price = priceOf(this.unit, stake);
    const burnQuote = (price * 7_000n) / BPS;
    const out = (burnQuote * 95n * this.rate.paved) / (100n * this.rate.usdc);
    return {
      price,
      burnQuote,
      referral: referralOf(price),
      margin: price - burnQuote,
      minOutHint: out,
      factor: 10_000,
      mean: this.mean,
      threshold: this.threshold,
      slope: 18_130,
      cap: 5,
    };
  }

  async day(day: number): Promise<DayView> {
    this.check(`day ${day}`);
    return { ...(this.days.get(day) ?? { prior: this.mean, sum: 0n, weight: 0, mean: 0, closed: false }) };
  }

  async terms(gameId: number): Promise<TermsView> {
    this.check(`terms ${gameId}`);
    return { ...(this.terms_.get(gameId) ?? { stake: 0, reference: 0n, day: 0, score: 0, settled: false, reward: 0n }) };
  }

  async vault(account: string): Promise<VaultPosition> {
    this.check(`vault ${account}`);
    const own = this.vaults.get(BigInt(account).toString(16)) ?? { staked: 0n, pending: 0n, totalStaked: 0n };
    return { ...own, totalStaked: this.totalStaked };
  }

  async usdcBalance(account: string): Promise<bigint> {
    this.check(`usdc ${account}`);
    return this.usdc.get(BigInt(account).toString(16)) ?? 0n;
  }

  async pavedBalance(account: string): Promise<bigint> {
    this.check(`paved ${account}`);
    return this.paved.get(BigInt(account).toString(16)) ?? 0n;
  }

  setVault(account: string, position: Omit<VaultPosition, "totalStaked">): void {
    this.vaults.set(BigInt(account).toString(16), { ...position, totalStaked: 0n });
  }

  setBalance(token: "usdc" | "paved", account: string, amount: bigint): void {
    (token === "usdc" ? this.usdc : this.paved).set(BigInt(account).toString(16), amount);
  }

  /** The `min_out` a purchase of `stake` sends with the default slippage. */
  async expectedMinOut(stake: number): Promise<bigint> {
    return minOutFor((await this.quote(stake)).minOutHint);
  }

  private check(call: string): void {
    this.calls.push(call);
    if (this.fail) throw new ViewError("rpc", this.fail);
  }
}
