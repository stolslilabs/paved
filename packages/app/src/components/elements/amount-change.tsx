import { formatFixed, formatInteger, formatUnits } from "@paved/game-core";
import { AnimatePresence, useReducedMotionConfig } from "motion/react";
import * as m from "motion/react-m";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { cn } from "../../lib/utils";
import { NumberTicker } from "./number-ticker";

// The balances' change (issue 620), shared by `ResourcePlate` and the village score (issue 802): the figure counts to its new value
// (`NumberTicker`, from `start` to `target`) and briefly takes the change's colour; up, a "+N" rises and the icon pops; down,
// a "−N" drops and the icon dips. Under reduced motion only the colour flashes.

/** The figure the counter counts to: the amount cut (not rounded) to `fraction` digits, as `formatUnits` writes it. */
function figureOf(amount: bigint, decimals: number, fraction: number): number {
  const cut = decimals > fraction ? amount / 10n ** BigInt(decimals - fraction) : amount;
  return Number(cut) / 10 ** Math.min(fraction, decimals);
}

/** A change of the amount, numbered so that each one replays the pop and the floating figure. */
export interface AmountChange {
  id: number;
  up: boolean;
  text: string;
}

export interface AmountChangeOptions {
  /** Base units (a token) or a count (`decimals` 0). Null: no source; a change from or to null is not animated. */
  amount: bigint | null;
  decimals: number;
  /** The digits shown after the point. */
  fraction: number;
  /** The amount shown before the owner mounted: the first render animates from it. */
  from?: bigint;
}

/**
 * The amount's last change, derived while rendering (no effect, no extra frame): never on the first amount, nor from a missing
 * one, unless `from` says what was shown before. `start` and `target` are the counter's; `format` writes the settled value
 * exactly (a number past 2^53 loses digits); `flash` holds the change's colour for a moment; `moving` is false under reduced motion.
 */
export function useAmountChange({ amount, decimals, fraction, from }: AmountChangeOptions) {
  const reduced = useReducedMotionConfig();
  const [seen, setSeen] = useState(from ?? amount);
  const [change, setChange] = useState<AmountChange | null>(null);
  const [flash, setFlash] = useState<boolean>(false);
  // Where the counter starts: the first amount shown, so a first load writes it at once (or `from`, to count from it).
  const [start, setStart] = useState(() => (from === undefined ? (amount === null ? 0 : figureOf(amount, decimals, fraction)) : figureOf(from, decimals, fraction)));
  if (amount !== seen) {
    setSeen(amount);
    // A value that arrives after none (no source, then one) is a first load: the counter mounts on it, nothing counts.
    if (amount !== null && seen === null) setStart(figureOf(amount, decimals, fraction));
    if (amount !== null && seen !== null) {
      const diff = amount - seen;
      const up = diff > 0n;
      setChange({ id: (change?.id ?? 0) + 1, up, text: `${up ? "+" : "−"}${formatUnits(up ? diff : -diff, decimals, fraction)}` });
      setFlash(true);
    }
  }
  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(false), 900);
    return () => clearTimeout(timer);
  }, [flash, change?.id]);

  const text = amount === null ? null : formatUnits(amount, decimals, fraction);
  const target = amount === null ? 0 : figureOf(amount, decimals, fraction);
  const format = useCallback((n: number) => (n === target && text !== null ? text : formatFixed(n, fraction)), [target, text, fraction]);
  return { text, start, target, format, change, flash, moving: change !== null && !reduced };
}

/** The figure's colour class: the change's (green up, the warning's down) while it flashes. */
export function changeTone(flash: boolean, change: AmountChange | null): string | false {
  return flash && !!change && (change.up ? "text-success duration-150" : "text-warning duration-150");
}

/** The icon beside the figure: it pops on a rise, dips on a fall (replayed on each change). */
export function ChangePop({ change, moving, children }: { change: AmountChange | null; moving: boolean; children: ReactNode }) {
  return (
    <m.span
      key={moving ? change!.id : 0}
      className="inline-flex"
      initial={moving ? undefined : false}
      animate={moving ? (change!.up ? { scale: [1, 1.3, 1] } : { y: [0, 3, 0], scale: [1, 0.88, 1] }) : undefined}
      transition={{ duration: 0.45, ease: "easeOut" }}
    >
      {children}
    </m.span>
  );
}

/**
 * The "+N" that rises off the top, or the "−N" that drops off the bottom, and fades. Its owner is `relative`. `below`: both
 * start just under the owner, at its right edge, and drift away from it (down), the space above left to what stands there.
 */
export function ChangeFloat({ change, moving, below, className }: { change: AmountChange | null; moving: boolean; below?: boolean; className?: string }) {
  return (
    <AnimatePresence>
      {moving && (
        <m.span
          key={change!.id}
          aria-hidden
          data-slot="resource-change"
          className={cn(
            "pointer-events-none absolute z-10 numeric text-xs font-bold",
            below ? "top-full right-0" : "right-2",
            !below && (change!.up ? "-top-3" : "-bottom-3"),
            change!.up ? "text-success" : "text-warning",
            className,
          )}
          initial={{ opacity: 1, y: below ? -2 : change!.up ? 4 : -4 }}
          animate={{ opacity: 0, y: below ? 10 : change!.up ? -14 : 14 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.1, ease: "easeOut" }}
        >
          {change!.text}
        </m.span>
      )}
    </AnimatePresence>
  );
}

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
