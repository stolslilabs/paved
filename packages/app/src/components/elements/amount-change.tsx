import { formatCompact, formatFixed, formatUnits } from "@paved/game-core";
import { AnimatePresence, useReducedMotionConfig } from "motion/react";
import * as m from "motion/react-m";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { cn } from "../../lib/utils";

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
  /**
   * From this figure (tokens, or Cobbles) the figure, the counter's too, is compact ("12.3K"), and so is the change: a fixed plate's
   * (issue 860, `amountFigure`'s 10,000). Omitted, never.
   */
  compactFrom?: number;
}

/**
 * The amount's last change, derived while rendering (no effect, no extra frame): never on the first amount, nor from a missing
 * one, unless `from` says what was shown before. `start` and `target` are the counter's; `format` writes the settled value
 * exactly (a number past 2^53 loses digits); `flash` holds the change's colour for a moment; `moving` is false under reduced motion.
 */
export function useAmountChange({ amount, decimals, fraction, from, compactFrom = Infinity }: AmountChangeOptions) {
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
      const by = up ? diff : -diff;
      const byText = figureOf(by, decimals, fraction) >= compactFrom ? formatCompact(figureOf(by, decimals, fraction)) : formatUnits(by, decimals, fraction);
      setChange({ id: (change?.id ?? 0) + 1, up, text: `${up ? "+" : "−"}${byText}` });
      setFlash(true);
    }
  }
  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(false), 900);
    return () => clearTimeout(timer);
  }, [flash, change?.id]);

  const target = amount === null ? 0 : figureOf(amount, decimals, fraction);
  const text = amount === null ? null : target >= compactFrom ? formatCompact(target) : formatUnits(amount, decimals, fraction);
  const format = useCallback((n: number) => (n === target && text !== null ? text : n >= compactFrom ? formatCompact(n) : formatFixed(n, fraction)), [target, text, fraction, compactFrom]);
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
