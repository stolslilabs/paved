import { formatFixed, formatUnits } from "@paved/game-core";
import { cva, type VariantProps } from "class-variance-authority";
import { AnimatePresence, useReducedMotionConfig } from "motion/react";
import * as m from "motion/react-m";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { cn } from "../../lib/utils";
import { NumberTicker } from "./number-ticker";
import { TokenIcon, type TokenKind } from "./token-icon";

const plateVariants = cva(
  "relative inline-flex items-center rounded-full border bg-resource-plate shadow-[inset_0_2px_0_var(--resource-shade)] whitespace-nowrap",
  {
    variants: {
      // The balances' rule (`TOKEN_GAP`, issue 668): the coin at the same inset on every side, half of the height left inside the border
      // (sm 32 − 2 − 24 = 6, md 44 − 2 − 32 = 10), a gap of a quarter of the coin, the figure ending one inset plus one gap from the rim.
      size: { sm: "h-8 gap-1.5 pr-[9px] pl-[3px] text-sm", md: "h-11 gap-2 pr-[13px] pl-[5px] text-lg" },
      /** `invite`: the Cobbles' plate (issue 620), a gold edge, a "+" and a slow shine: it leads to the packs. */
      tone: { default: "border-resource-edge", invite: "border-primary/60" },
    },
    defaultVariants: { size: "sm", tone: "default" },
  },
);

export interface ResourcePlateProps extends VariantProps<typeof plateVariants> {
  kind: TokenKind;
  /** Base units (a token) or a count (the Cobbles, `decimals` 0). Null: no source, a dash; a change from or to null is not animated. */
  amount: bigint | null;
  decimals: number;
  /** The digits shown after the point. */
  fraction: number;
  /** A "+" at the end, as a game's currency bar invites a purchase. */
  plus?: boolean;
  /** The amount shown before this plate mounted (a balance that just appeared): the first render animates from it. */
  from?: bigint;
  /** After the figure: a hint of what a tap does (a chevron). */
  children?: ReactNode;
  className?: string;
}

/** The figure the counter counts to: the amount cut (not rounded) to `fraction` digits, as `formatUnits` writes it. */
function figureOf(amount: bigint, decimals: number, fraction: number): number {
  const cut = decimals > fraction ? amount / 10n ** BigInt(decimals - fraction) : amount;
  return Number(cut) / 10 ** Math.min(fraction, decimals);
}

/** A change of the amount, numbered so that each one replays the pop and the floating figure. */
interface Change {
  id: number;
  up: boolean;
  text: string;
}

/**
 * A balance as a game's resource bar shows it (issue 620): a small plate, the token's icon as its coin, the figure in chunky mono.
 * On each change of the amount, never on the first one nor from a missing value, the figure counts to the new value
 * (`NumberTicker`) and briefly takes the change's colour; up, a "+N" rises and fades and the coin pops; down, a "−N" drops and
 * fades and the coin dips. Under reduced motion only the colour flashes: nothing moves. The accessible name is the container's.
 */
export function ResourcePlate({ kind, amount, decimals, fraction, plus, from, size, tone, children, className }: ResourcePlateProps) {
  const reduced = useReducedMotionConfig();
  // The last amount seen and its change, derived while rendering (no effect, no extra frame).
  const [seen, setSeen] = useState(from ?? amount);
  const [change, setChange] = useState<Change | null>(null);
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
  // The exact text on the settled value (a number past 2^53 loses digits); the counter's own between.
  const format = useCallback((n: number) => (n === target && text !== null ? text : formatFixed(n, fraction)), [target, text, fraction]);
  const moving = change !== null && !reduced;

  return (
    <span data-slot="resource-plate" data-token={kind} className={cn(plateVariants({ size, tone }), className)}>
      {/* The shine in its own clipped layer: the floating change goes past the plate's edge. */}
      {tone === "invite" && (
        <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
          <span className="plate-shine absolute inset-0" />
        </span>
      )}
      <m.span
        key={moving ? change.id : 0}
        className="inline-flex"
        initial={moving ? undefined : false}
        animate={moving ? (change.up ? { scale: [1, 1.3, 1] } : { y: [0, 3, 0], scale: [1, 0.88, 1] }) : undefined}
        transition={{ duration: 0.45, ease: "easeOut" }}
      >
        <TokenIcon kind={kind} size={size === "md" ? "lg" : "md"} />
      </m.span>
      <span
        aria-hidden
        className={cn(
          "numeric font-bold tracking-tight transition-colors duration-700 motion-reduce:duration-300",
          flash && change && (change.up ? "text-success duration-150" : "text-warning duration-150"),
        )}
      >
        {text === null ? "–" : <NumberTicker value={target} startValue={start} decimalPlaces={fraction} format={format} className="tracking-tight" />}
      </span>
      {children}
      {plus && (
        <span aria-hidden className="grid size-5 place-items-center rounded-full bg-primary text-sm leading-none font-bold text-primary-foreground">
          +
        </span>
      )}
      <AnimatePresence>
        {moving && (
          <m.span
            key={change.id}
            aria-hidden
            data-slot="resource-change"
            className={cn("pointer-events-none absolute right-2 z-10 numeric text-xs font-bold", change.up ? "-top-3 text-success" : "-bottom-3 text-warning")}
            initial={{ opacity: 1, y: change.up ? 4 : -4 }}
            animate={{ opacity: 0, y: change.up ? -14 : 14 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.1, ease: "easeOut" }}
          >
            {change.text}
          </m.span>
        )}
      </AnimatePresence>
    </span>
  );
}
