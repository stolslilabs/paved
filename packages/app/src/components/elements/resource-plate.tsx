import { cva, type VariantProps } from "class-variance-authority";
import { type ReactNode } from "react";
import { cn } from "../../lib/utils";
import { ChangeFloat, ChangePop, changeTone, useAmountChange } from "./amount-change";
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

/**
 * A balance as a game's resource bar shows it (issue 620): a small plate, the token's icon as its coin, the figure in chunky mono.
 * On each change of the amount, never on the first one nor from a missing value, the figure counts to the new value
 * (`NumberTicker`) and briefly takes the change's colour; up, a "+N" rises and fades and the coin pops; down, a "−N" drops and
 * fades and the coin dips. Under reduced motion only the colour flashes: nothing moves. The accessible name is the container's.
 */
export function ResourcePlate({ kind, amount, decimals, fraction, plus, from, size, tone, children, className }: ResourcePlateProps) {
  const { text, start, target, format, change, flash, moving } = useAmountChange({ amount, decimals, fraction, from });

  return (
    <span data-slot="resource-plate" data-token={kind} className={cn(plateVariants({ size, tone }), className)}>
      {/* The shine in its own clipped layer: the floating change goes past the plate's edge. */}
      {tone === "invite" && (
        <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
          <span className="plate-shine absolute inset-0" />
        </span>
      )}
      <ChangePop change={change} moving={moving}>
        <TokenIcon kind={kind} size={size === "md" ? "lg" : "md"} />
      </ChangePop>
      <span
        aria-hidden
        className={cn(
          "numeric font-bold tracking-tight transition-colors duration-700 motion-reduce:duration-300",
          changeTone(flash, change),
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
      <ChangeFloat change={change} moving={moving} />
    </span>
  );
}
