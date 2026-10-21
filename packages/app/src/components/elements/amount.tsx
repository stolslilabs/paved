import { formatUnits } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { TOKEN_GAP, TokenIcon } from "./token-icon";

/** The tokens a screen shows, with their decimals on chain. `PAVED` is the token's name on screen. */
export const TOKENS = {
  usdc: { symbol: "USDC", decimals: 6, fraction: 2 },
  paved: { symbol: "PAVED", decimals: 18, fraction: 2 },
  /** The Vault's share (P-56, `VPAVED_LABEL`): 18 decimals like PAVED, its label fixed whatever the chain's symbol says. */
  vpaved: { symbol: "vPAVED", decimals: 18, fraction: 2 },
} as const;

export type Token = keyof typeof TOKENS;

/** Base units to a decimal string, cut (not rounded) to `fraction` digits, thousands with a comma (the formatter module's). */
export { formatUnits };

export interface AmountProps {
  value: bigint;
  token: Token;
  /** The token's coin before the figure (issue 620); off where the coin already stands beside it. */
  icon?: boolean;
  className?: string;
}

/**
 * A token amount: the token's coin (`TokenIcon`), the figure in the mono font, its symbol after it in the body font, spaced by
 * the balances' rule (`TOKEN_GAP`, issue 668). The figure never breaks; in a column too narrow for both, the symbol goes under it (WRAP360).
 */
export function Amount({ value, token, icon = true, className }: AmountProps) {
  const t = TOKENS[token];
  return (
    <span className={cn("inline-flex flex-wrap items-baseline", TOKEN_GAP, className)}>
      {/* The coin and the figure as one: only the symbol goes under. */}
      <span className={cn("inline-flex items-baseline whitespace-nowrap", TOKEN_GAP)}>
        {icon && <TokenIcon kind={token} size="em" className="self-center" />}
        <span className="numeric font-semibold">{formatUnits(value, t.decimals, t.fraction)}</span>
      </span>
      <span className="text-[max(12px,0.85em)] whitespace-nowrap text-muted-foreground">{t.symbol}</span>
    </span>
  );
}
