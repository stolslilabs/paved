import type { EconomyCodecs, EconomyContractName } from "../abis";
import type { Encodable } from "../codec";
import { ViewError, toViewError, type CallProvider } from "../views";
import type { EconomyDeployment } from "./deployment";

/** `Economy.quote(stake)` (economy.md section 6): what a purchase of stake `k` costs and its terms now. */
export interface QuoteView {
  /** USDC base units: `k x entry_price().amount`. */
  price: bigint;
  burnQuote: bigint;
  referral: bigint;
  margin: bigint;
  /**
   * An estimate only: at launch it sits above what the swap returns (its rate leaves the pool fee out). Never sent as
   * `min_out` (that comes from the pool quote, `pool.ts`) and never shown as a price (CORE, P-35).
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

/**
 * `Economy.day(day)`. Until the day closes, `mean`, `sum` and `weight` are 0 (P-34): never show them as
 * figures; the screens show `Quote.mean` and `Quote.threshold` as the current reference instead.
 */
export interface DayView {
  prior: number;
  sum: bigint;
  weight: number;
  /** Points x 1,000; 0 until the day closes. */
  mean: number;
  closed: boolean;
}

/** `Economy.terms(game_id)`: a bought game's frozen terms and its settlement. */
export interface TermsView {
  player: string;
  /** Seconds since the epoch: the purchase's block time; a paid game expires 24 h after it (P-34). */
  time: number;
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
  /** The game was not recorded within 24 h of its purchase: no reward, no mean (P-34). */
  expired: boolean;
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

/** Field lists in ABI order; a test checks them against `contracts/abis/Economy.json`. */
export const ECONOMY_VIEW_FIELDS = {
  "paved::economy::economy::Quote": [
    "price", "burnQuote", "referral", "margin", "minOutHint", "factor", "mean", "threshold", "slope", "cap",
  ] satisfies (keyof QuoteView)[],
  "paved::economy::economy::DayView": ["prior", "sum", "weight", "mean", "closed"] satisfies (keyof DayView)[],
  "paved::economy::economy::TermsView": [
    "player", "time", "day", "stake", "reference", "sigmaBps", "slopeBps", "cap", "score", "recorded", "expired", "settled", "reward",
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
    return (await this.call("Economy", "terms", [gameId])) as TermsView;
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

  private async call(contract: Exclude<EconomyContractName, "Daily">, entrypoint: string, args: Encodable[]): Promise<unknown> {
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
