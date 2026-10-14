import type { EconomyCodecs, EconomyContractName } from "../abis";
import { toHex, type Encodable } from "../codec";
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

/**
 * A holder's position in the `Vault`, vPAVED (P-56: an ERC4626 over PAVED with an exit fee). Every amount is in base units
 * of 18 decimals. The screens show `value` as the position's worth and `maxWithdraw` as what leaves now, the fee taken.
 */
export interface VaultPosition {
  /** vPAVED held (`balance_of`). */
  shares: bigint;
  /** Their PAVED at the current rate, before the exit fee (`convert_to_assets(shares)`). */
  value: bigint;
  /** The most PAVED a `withdraw` pays now, the exit fee taken (`max_withdraw`, equal to `preview_redeem(shares)`). */
  maxWithdraw: bigint;
  /** The exit fee, bps of the PAVED that leaves (`exit_fee`), kept in the Vault for the other holders. */
  exitFeeBps: number;
  /** The PAVED the Vault holds (`total_assets`), the dead shares' 1,000 included. */
  totalAssets: bigint;
  /** All vPAVED (`total_supply`), the dead shares included. */
  totalSupply: bigint;
}

/**
 * `Economy.split_bps()` (P-56): how the price splits now, in bps. `burn` is swapped for the burn and `vault` for the Vault;
 * they add up to 10,000. A referrer is paid `referral` of the price out of the Vault's part, which is not swapped then.
 * Owner-set: the screens read it, never a constant.
 */
export interface SplitView {
  burn: number;
  vault: number;
  referral: number;
}

/** Field lists in ABI order; a test checks them against `contracts/abis/Economy.json`. */
export const ECONOMY_VIEW_FIELDS = {
  "paved::systems::economy::Quote": [
    "price", "burnQuote", "referral", "margin", "minOutHint", "factor", "mean", "threshold", "slope", "cap",
  ] satisfies (keyof QuoteView)[],
  "paved::systems::economy::DayView": ["prior", "sum", "weight", "mean", "closed"] satisfies (keyof DayView)[],
  "paved::systems::economy::TermsView": [
    "player", "time", "day", "stake", "reference", "sigmaBps", "slopeBps", "cap", "score", "recorded", "expired", "settled", "reward",
  ] satisfies (keyof TermsView)[],
};

/** The economy's reads. `RpcEconomyViews` calls the contracts; `FakeEconomy` (`economy/fake.ts`) is for unit tests. */
export interface EconomyViews {
  quote(stake: number): Promise<QuoteView>;
  /** `Economy.split_bps()`: the split of the price in force (P-56). */
  split(): Promise<SplitView>;
  /** `Economy.rate()`: the guard's swap rate, PAVED base units per USDC base unit x `RATE_SCALE`; 0 before any purchase. */
  guardRate(): Promise<bigint>;
  /** `Economy.router()`, as 0x-hex: the router the purchase swaps through (checked against the pin, E-9b). */
  router(): Promise<string>;
  day(day: number): Promise<DayView>;
  terms(gameId: number): Promise<TermsView>;
  vault(account: string): Promise<VaultPosition>;
  /** `Vault.preview_deposit(assets)`: the vPAVED a deposit of `assets` PAVED mints now (0 is refused by the contract). */
  previewDeposit(assets: bigint): Promise<bigint>;
  /** `Vault.preview_withdraw(assets)`: the vPAVED a withdraw of `assets` PAVED burns now, the exit fee included. */
  previewWithdraw(assets: bigint): Promise<bigint>;
  /** `Vault.preview_redeem(shares)`: the PAVED a redeem of `shares` pays now, the exit fee taken. */
  previewRedeem(shares: bigint): Promise<bigint>;
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

  async split(): Promise<SplitView> {
    // A tuple `(u16, u16, u16)`, which the codec does not decode: three felts read here, each checked.
    const felts = await this.raw("Economy", "split_bps", []);
    if (felts.length !== 3) throw new ViewError("rpc", `split_bps: ${felts.length} felts, expected 3`);
    const [burn, vault, referral] = felts.map((felt) => {
      const value = BigInt(felt);
      if (value < 0n || value >= 1n << 16n) throw new ViewError("rpc", `split_bps: ${felt} is not a u16`);
      return Number(value);
    });
    if (burn + vault !== 10_000 || referral > vault) throw new ViewError("rpc", `split_bps: ${burn} / ${vault} / ${referral} is not a split of the price`);
    return { burn, vault, referral };
  }

  async guardRate(): Promise<bigint> {
    return (await this.call("Economy", "rate", [])) as bigint;
  }

  async router(): Promise<string> {
    return toHex(BigInt((await this.call("Economy", "router", [])) as string | bigint));
  }

  async day(day: number): Promise<DayView> {
    return (await this.call("Economy", "day", [day])) as DayView;
  }

  async terms(gameId: number): Promise<TermsView> {
    return (await this.call("Economy", "terms", [gameId])) as TermsView;
  }

  async vault(account: string): Promise<VaultPosition> {
    const [shares, maxWithdraw, exitFee, totalAssets, totalSupply] = await Promise.all([
      this.call("Vault", "balance_of", [account]),
      this.call("Vault", "max_withdraw", [account]),
      this.call("Vault", "exit_fee", []),
      this.call("Vault", "total_assets", []),
      this.call("Vault", "total_supply", []),
    ]);
    const value = (await this.call("Vault", "convert_to_assets", [shares as bigint])) as bigint;
    return {
      shares: shares as bigint,
      value,
      maxWithdraw: maxWithdraw as bigint,
      exitFeeBps: Number(exitFee),
      totalAssets: totalAssets as bigint,
      totalSupply: totalSupply as bigint,
    };
  }

  async previewDeposit(assets: bigint): Promise<bigint> {
    return (await this.call("Vault", "preview_deposit", [assets])) as bigint;
  }

  async previewWithdraw(assets: bigint): Promise<bigint> {
    return (await this.call("Vault", "preview_withdraw", [assets])) as bigint;
  }

  async previewRedeem(shares: bigint): Promise<bigint> {
    return (await this.call("Vault", "preview_redeem", [shares])) as bigint;
  }

  async usdcBalance(account: string): Promise<bigint> {
    return (await this.call("USDC", "balance_of", [account])) as bigint;
  }

  async pavedBalance(account: string): Promise<bigint> {
    return (await this.call("PavedToken", "balance_of", [account])) as bigint;
  }

  private async call(contract: Exclude<EconomyContractName, "Challenge">, entrypoint: string, args: Encodable[]): Promise<unknown> {
    const felts = await this.raw(contract, entrypoint, args);
    try {
      return this.codecs[contract].decodeResult(entrypoint, felts);
    } catch (error) {
      throw toViewError(error);
    }
  }

  /** The felts a view returns, undecoded. */
  private async raw(contract: Exclude<EconomyContractName, "Challenge">, entrypoint: string, args: Encodable[]): Promise<string[]> {
    if (!this.deployment.configured) throw new ViewError("not-configured", `Economy not deployed: ${this.deployment.missing.join(", ")} missing`);
    try {
      return await this.provider.callContract({
        contractAddress: this.deployment.addresses[contract],
        entrypoint,
        calldata: this.codecs[contract].encodeCall(entrypoint, args),
      });
    } catch (error) {
      throw toViewError(error);
    }
  }
}
