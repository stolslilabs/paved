import type { EconomyCodecs, EconomyContractName } from "../abis";
import type { Encodable } from "../codec";
import { ViewError, toViewError, type CallProvider } from "../views";
import type { EconomyDeployment } from "./deployment";

/** `Economy.quote(stake)` (STUB shape, economy.md section 6): what a purchase of stake `k` costs and its terms now. */
export interface QuoteView {
  /** USDC base units: `k x entry_price().amount`. */
  price: bigint;
  burnQuote: bigint;
  referral: bigint;
  margin: bigint;
  /**
   * The `min_out` to send, as it is: E2 already takes 1 % off (99 % of `burnQuote` at the price guard's rate). A
   * floor, not the pool's price: never shown as a price.
   */
  minOutHint: bigint;
  /** Supply factor `F`, bps. */
  factor: number;
  /** The mean the next purchase is priced against, points x 1,000. */
  mean: number;
  /** Points x 1,000: below it the whole stake is lost. */
  threshold: number;
  /** `c`, bps. */
  slope: number;
  /** `H`. */
  cap: number;
}

/** `Economy.day(day)` (STUB shape). */
export interface DayView {
  prior: number;
  sum: bigint;
  weight: number;
  /** Points x 1,000; 0 until the day is closed by its first settlement. */
  mean: number;
  closed: boolean;
}

/** `Economy.terms(game_id)` (STUB shape): a bought game's frozen terms and its settlement. */
export interface TermsView {
  player: string;
  day: number;
  /** 0 for a game that was not bought (then `recorded` and `settled` are false). */
  stake: number;
  /** `R`, PAVED base units. */
  reference: bigint;
  /** The threshold's shift, bps, signed. */
  sigmaBps: number;
  slopeBps: number;
  cap: number;
  score: number;
  /** The game is over and its score is in: it can be settled after its day. */
  recorded: boolean;
  settled: boolean;
  /** PAVED minted at settlement; 0 below the threshold (the stake is lost). */
  reward: bigint;
}

/** A staker's position in the `Vault` (E1's real ABI). */
export interface VaultPosition {
  /** PAVED base units. */
  staked: bigint;
  /** USDC base units of dividends not yet paid. */
  pending: bigint;
  totalStaked: bigint;
}

/** Field lists in ABI order; a test checks them against the (stub) ABI. */
export const ECONOMY_VIEW_FIELDS = {
  "paved::economy::views::Quote": [
    "price", "burnQuote", "referral", "margin", "minOutHint", "factor", "mean", "threshold", "slope", "cap",
  ] satisfies (keyof QuoteView)[],
  "paved::economy::views::DayView": ["prior", "sum", "weight", "mean", "closed"] satisfies (keyof DayView)[],
  "paved::economy::views::TermsView": [
    "player", "day", "stake", "reference", "sigmaBps", "slopeBps", "cap", "score", "recorded", "settled", "reward",
  ] satisfies (keyof TermsView)[],
};

/** The economy's reads. `RpcEconomyViews` calls the contracts; `FakeEconomy` (`economy/fake.ts`) is for unit tests. */
export interface EconomyViews {
  quote(stake: number): Promise<QuoteView>;
  day(day: number): Promise<DayView>;
  terms(gameId: number): Promise<TermsView>;
  vault(account: string): Promise<VaultPosition>;
  usdcBalance(account: string): Promise<bigint>;
  pavedBalance(account: string): Promise<bigint>;
}

/** The felt of an `i16` as a number: a negative value is `P - |v|` (STUB: the codec decodes no signed integer). */
function signedI16(felt: string): number {
  const P = (1n << 251n) + 17n * (1n << 192n) + 1n;
  const v = BigInt(felt);
  const signed = v > P / 2n ? v - P : v;
  if (signed < -32_768n || signed > 32_767n) throw new ViewError("abi-mismatch", `sigma_bps ${felt} is not an i16`);
  return Number(signed);
}

export class RpcEconomyViews implements EconomyViews {
  constructor(
    private readonly provider: CallProvider,
    private readonly deployment: EconomyDeployment,
    private readonly codecs: EconomyCodecs,
  ) {}

  async quote(stake: number): Promise<QuoteView> {
    return (await this.call("Economy", "quote", [stake])) as QuoteView;
  }

  async day(day: number): Promise<DayView> {
    return (await this.call("Economy", "day", [day])) as DayView;
  }

  async terms(gameId: number): Promise<TermsView> {
    const raw = (await this.call("Economy", "terms", [gameId])) as Omit<TermsView, "sigmaBps"> & { sigmaBps: string };
    return { ...raw, sigmaBps: signedI16(raw.sigmaBps) };
  }

  async vault(account: string): Promise<VaultPosition> {
    const [staked, pending, totalStaked] = await Promise.all([
      this.call("Vault", "staked", [account]),
      this.call("Vault", "pending", [account]),
      this.call("Vault", "total_staked", []),
    ]);
    return { staked: staked as bigint, pending: pending as bigint, totalStaked: totalStaked as bigint };
  }

  async usdcBalance(account: string): Promise<bigint> {
    return (await this.call("USDC", "balance_of", [account])) as bigint;
  }

  async pavedBalance(account: string): Promise<bigint> {
    return (await this.call("PavedToken", "balance_of", [account])) as bigint;
  }

  private async call(contract: Exclude<EconomyContractName, "DailyPaid">, entrypoint: string, args: Encodable[]): Promise<unknown> {
    if (!this.deployment.configured) throw new ViewError("not-configured", `Economy not deployed: ${this.deployment.missing.join(", ")} missing`);
    const codec = this.codecs[contract];
    try {
      const felts = await this.provider.callContract({
        contractAddress: this.deployment.addresses[contract],
        entrypoint,
        calldata: codec.encodeCall(entrypoint, args),
      });
      return codec.decodeResult(entrypoint, felts);
    } catch (error) {
      throw toViewError(error);
    }
  }
}
