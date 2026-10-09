// The economy's fixed numbers and the client's arithmetic on them (`docs/architecture/economy.md`, P-31). Every
// amount is a bigint in the token's base unit: never a float.

/** USDC has 6 decimals (Starknet USDC, and MockUSDC on devnet). */
export const USDC_DECIMALS = 6;
/** PAVED has 18 decimals (D-10). */
export const PAVED_DECIMALS = 18;
/** The labels of the two tokens, whatever a mock's on-chain symbol says (D-10). */
export const USDC_LABEL = "USDC";
export const PAVED_LABEL = "PAVED";

/** The stake `k` of a paid Daily: 1 to 10 (Glitchbomb's bundles). */
export const MIN_STAKE = 1;
export const MAX_STAKE = 10;
export const STAKES: readonly number[] = Array.from({ length: MAX_STAKE - MIN_STAKE + 1 }, (_, i) => MIN_STAKE + i);

export const BPS = 10_000n;
/** The referrer's share of the price, paid out of the Vault's margin (P-31): the player pays the same. */
export const REFERRAL_BPS = 500n;
/** The slippage the client accepts on the burn swap: `min_out = quote x (1 - 1 %)` (economy.md section 5). */
export const DEFAULT_SLIPPAGE_BPS = 100n;
/** At most 50 %: a wider slippage is a mistake, not a setting. */
export const MAX_SLIPPAGE_BPS = 5_000n;

export const SECONDS_PER_DAY = 86_400;

export function isStake(stake: unknown): stake is number {
  return typeof stake === "number" && Number.isInteger(stake) && stake >= MIN_STAKE && stake <= MAX_STAKE;
}

/** `P = k x unit`, the unit being `Daily.entry_price().amount` (2 USDC, "per stake unit" after E3). */
export function priceOf(unit: bigint, stake: number): bigint {
  if (!isStake(stake)) throw new RangeError(`A stake is ${MIN_STAKE} to ${MAX_STAKE}, got ${String(stake)}`);
  return unit * BigInt(stake);
}

/** Glitchbomb's reward boost `1 + k/100`, in bps (10,100 to 11,000). */
export function boostBps(stake: number): bigint {
  if (!isStake(stake)) throw new RangeError(`A stake is ${MIN_STAKE} to ${MAX_STAKE}, got ${String(stake)}`);
  return BPS + 100n * BigInt(stake);
}

/** What a referrer gets out of the margin: 5 % of the price. The player's price does not change. */
export function referralOf(price: bigint): bigint {
  return (price * REFERRAL_BPS) / BPS;
}

/** The least PAVED the burn swap may return: the quote less the slippage, rounded down. */
export function minOutFor(quoted: bigint, slippageBps: bigint = DEFAULT_SLIPPAGE_BPS): bigint {
  if (slippageBps < 0n || slippageBps > MAX_SLIPPAGE_BPS) throw new RangeError(`Slippage ${slippageBps} bps is out of 0..${MAX_SLIPPAGE_BPS}`);
  if (quoted < 0n) throw new RangeError("A quote is not negative");
  return (quoted * (BPS - slippageBps)) / BPS;
}

/** The economy's day of a Unix time (the Daily tournament id). */
export function dayOf(unixSeconds: number): number {
  return Math.floor(unixSeconds / SECONDS_PER_DAY);
}

/** A day can be settled once it is over: `now >= (day + 1) x 86400` (option B). */
export function dayOver(day: number, nowSeconds: number): boolean {
  return nowSeconds >= (day + 1) * SECONDS_PER_DAY;
}

function trimZeros(text: string): string {
  return text.includes(".") ? text.replace(/0+$/, "").replace(/\.$/, "") : text;
}

/** A base-unit amount as a decimal string, cut (not rounded) to `precision` fraction digits. */
export function formatUnits(value: bigint, decimals: number, precision = decimals): string {
  const negative = value < 0n;
  const raw = negative ? -value : value;
  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  const fraction = (raw % divisor).toString().padStart(decimals, "0").slice(0, precision);
  return `${negative ? "-" : ""}${trimZeros(fraction ? `${whole}.${fraction}` : `${whole}`)}`;
}

/**
 * A decimal amount typed by the player, in base units; null when it is not a positive amount with at most
 * `decimals` fraction digits. Never through a float.
 */
export function parseUnits(text: string, decimals: number): bigint | null {
  const m = /^(\d{1,40})(?:\.(\d{1,40}))?$/.exec(text.trim());
  if (!m) return null;
  const fraction = m[2] ?? "";
  if (fraction.length > decimals) return null;
  const amount = BigInt(m[1]) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0");
  return amount > 0n ? amount : null;
}

/** A bps figure as a multiplier, e.g. 10_300 -> "1.03". */
export function formatBps(bps: bigint): string {
  return formatUnits(bps, 4);
}
