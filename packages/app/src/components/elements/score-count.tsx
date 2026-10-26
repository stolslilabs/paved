import { formatInteger } from "@paved/game-core";
import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { ChangeFloat, ChangePop, changeTone, useAmountChange } from "./amount-change";
import { NumberTicker } from "./number-ticker";

// Its own module, loaded lazily by a save alone (the home's chip, the village page's score): `amount-change` is in the first
// load with the balances, and a lazy import of it would keep this there too.

/**
 * A score that counts from `from` to `value` once, as it mounts (the village's, after a save, issue 802), the balances' way: the
 * colour of the change, the "+N" or "−N", the icon's pop. Equal, or no `from`: the score, still. A later change of `value`
 * plays again. Assistive technology reads the score alone, never the counting figure.
 */
export function ScoreCount({ value, from, icon, className }: { value: number; from?: number; icon?: ReactNode; className?: string }) {
  const { start, target, format, change, flash, moving } = useAmountChange({
    amount: BigInt(Math.round(value)),
    decimals: 0,
    fraction: 0,
    from: from === undefined ? undefined : BigInt(Math.round(from)),
  });
  return (
    // At least as wide as the floating figure, which stands inside the box: a "−1,122" under an "838" stays over it.
    <span data-slot="score-count" className={cn("relative inline-flex items-center gap-1.5", className)} style={moving ? { minWidth: `${change!.text.length}ch` } : undefined}>
      {icon && <ChangePop change={change} moving={moving}>{icon}</ChangePop>}
      <span aria-hidden className={cn("numeric transition-colors duration-700 motion-reduce:duration-300", changeTone(flash, change))}>
        <NumberTicker value={target} startValue={start} format={format} className="tracking-normal" />
      </span>
      {/* Under the figure, inside its width: the label above (the village page's) and the badge above the chip (the home's) stay clear. */}
      <ChangeFloat change={change} moving={moving} below className="drop-shadow-sm" />
      <span className="sr-only">{formatInteger(value)}</span>
    </span>
  );
}
