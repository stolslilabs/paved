import { cn } from "../../lib/utils";

/** The tokens a screen shows, with their decimals on chain. `$TILE` is the PAVED token's name on screen (owner D-2). */
export const TOKENS = {
  usdc: { symbol: "USDC", decimals: 6, fraction: 2 },
  paved: { symbol: "$TILE", decimals: 18, fraction: 2 },
  /** The Vault's share (P-56, `VPAVED_LABEL`): 18 decimals like PAVED, its label fixed whatever the chain's symbol says. */
  vpaved: { symbol: "vPAVED", decimals: 18, fraction: 2 },
} as const;

export type Token = keyof typeof TOKENS;

/** Base units to a decimal string, cut (not rounded) to `fraction` digits, thousands with a comma. */
export function formatUnits(amount: bigint, decimals: number, fraction: number): string {
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  const scale = 10n ** BigInt(decimals);
  const whole = (abs / scale).toLocaleString("en-US");
  const frac = (abs % scale).toString().padStart(decimals, "0").slice(0, fraction);
  return `${negative ? "-" : ""}${whole}${fraction > 0 ? `.${frac}` : ""}`;
}

export interface AmountProps {
  value: bigint;
  token: Token;
  className?: string;
}

/** A token amount in the mono font, its symbol after it in the body font. */
export function Amount({ value, token, className }: AmountProps) {
  const t = TOKENS[token];
  return (
    <span className={cn("inline-flex items-baseline gap-1 whitespace-nowrap", className)}>
      <span className="numeric font-semibold">{formatUnits(value, t.decimals, t.fraction)}</span>
      <span className="text-[0.85em] text-muted-foreground">{t.symbol}</span>
    </span>
  );
}
