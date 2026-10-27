import { cva, type VariantProps } from "class-variance-authority";
import { type ReactNode } from "react";
import { cn } from "../../lib/utils";
import { ChangeFloat, ChangePop, changeTone, useAmountChange } from "./amount-change";
import { NumberTicker } from "./number-ticker";
import { TokenIcon, type TokenKind } from "./token-icon";

const boxVariants = cva("relative flex items-center rounded-lg border bg-resource-plate shadow-[inset_0_2px_0_var(--resource-shade)]", {
  variants: {
    // Issue 828: a 32 px box under a 40 px icon on a phone, 36 under 44 from `desktop` (the balances' `rail`).
    size: { sm: "h-8 text-sm", md: "h-9 text-lg" },
    /** `invite`: the Cobbles' plate (issue 620), a gold edge, a "+" and a slow shine: it leads to the packs. */
    tone: { default: "border-resource-edge", invite: "border-primary/60" },
  },
  defaultVariants: { size: "sm", tone: "default" },
});

type Size = NonNullable<VariantProps<typeof boxVariants>["size"]>;

/**
 * Each size's parts (issue 828). The icon stands over the box's end, its centre on the border, so half of it overlaps the box; the
 * "+" does the same at the other end, a little smaller. The box keeps the overlap plus a gap clear inside, so the figure never runs
 * under either. The gap is a quarter of the "+" (`TOKEN_GAP`'s rule, issue 668).
 */
type Ends = Record<"right" | "left", string>;
const PARTS: Record<Size, { coin: string; over: Ends; plus: string; plusOver: Ends; pad: { icon: Ends; plus: Ends; bare: Ends } }> = {
  sm: {
    coin: "size-10",
    over: { right: "-ml-5", left: "-mr-5" },
    plus: "size-7 text-base",
    plusOver: { right: "-mr-3.5", left: "-ml-3.5" },
    // The icon's half (20) and a gap (8); the "+"'s half (14) and a gap (6); no "+": 10 px.
    pad: { icon: { right: "pr-7", left: "pl-7" }, plus: { right: "pl-5", left: "pr-5" }, bare: { right: "pl-2.5", left: "pr-2.5" } },
  },
  md: {
    coin: "size-11",
    over: { right: "-ml-5.5", left: "-mr-5.5" },
    plus: "size-8 text-lg",
    plusOver: { right: "-mr-4", left: "-ml-4" },
    pad: { icon: { right: "pr-7.5", left: "pl-7.5" }, plus: { right: "pl-6", left: "pr-6" }, bare: { right: "pl-3", left: "pr-3" } },
  },
};

export interface ResourcePlateProps extends VariantProps<typeof boxVariants> {
  kind: TokenKind;
  /** Base units (a token) or a count (the Cobbles, `decimals` 0). Null: no source, a dash; a change from or to null is not animated. */
  amount: bigint | null;
  decimals: number;
  /** The digits shown after the point. */
  fraction: number;
  /** A "+" at the end opposite the icon, as a game's currency bar invites a purchase (a balance that leads to a page). */
  plus?: boolean;
  /**
   * The icon's end (issue 828): `right` for the plates on the right of the screen (the balances), the "+" at the left; `left`, the
   * same plate mirrored for the left of the screen (issue 829), the "+" at the right.
   */
  side?: "right" | "left";
  /** The amount shown before this plate mounted (a balance that just appeared): the first render animates from it. */
  from?: bigint;
  /** After the figure: a hint of what a tap does (a chevron). */
  children?: ReactNode;
  className?: string;
}

/**
 * A balance as a game's resource bar shows it (issues 620, 828): a rounded box with the figure in chunky mono, the token's icon
 * standing over one end, taller than the box and hiding its border, and for a balance with a page to go to a "+" over the other
 * end, a little smaller. On each change of the amount, never on the first one nor from a missing value, the figure counts to the
 * new value (`NumberTicker`) and briefly takes the change's colour; up, a "+N" rises and fades and the icon pops; down, a "−N"
 * drops and fades and the icon dips. Under reduced motion only the colour flashes: nothing moves. The accessible name is the
 * container's.
 */
export function ResourcePlate({ kind, amount, decimals, fraction, plus, side = "right", from, size, tone, children, className }: ResourcePlateProps) {
  const { text, start, target, format, change, flash, moving } = useAmountChange({ amount, decimals, fraction, from });
  const parts = PARTS[size ?? "sm"];
  const left = side === "left";

  return (
    <span data-slot="resource-plate" data-token={kind} data-side={side} className={cn("relative inline-flex items-center whitespace-nowrap", left && "flex-row-reverse", className)}>
      {plus && (
        <span
          aria-hidden
          data-slot="resource-plus"
          className={cn(
            "relative z-10 grid shrink-0 place-items-center rounded-md bg-primary leading-none font-bold text-primary-foreground shadow-sm",
            parts.plus,
            parts.plusOver[side],
          )}
        >
          +
        </span>
      )}
      <span className={cn(boxVariants({ size, tone }), parts.pad.icon[side], plus ? parts.pad.plus[side] : parts.pad.bare[side])}>
        {/* The shine in its own clipped layer: the floating change goes past the plate's edge. */}
        {tone === "invite" && (
          <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
            <span className="plate-shine absolute inset-0" />
          </span>
        )}
        <span
          aria-hidden
          className={cn(
            "relative numeric font-bold tracking-tight transition-colors duration-700 motion-reduce:duration-300",
            changeTone(flash, change),
          )}
        >
          {text === null ? "–" : <NumberTicker value={target} startValue={start} decimalPlaces={fraction} format={format} className="tracking-tight" />}
        </span>
        {children}
      </span>
      <span className={cn("relative z-10 inline-flex shrink-0 drop-shadow-sm", parts.over[side])}>
        <ChangePop change={change} moving={moving}>
          {/* A disc in the plate's colours behind the icon: an icon that is not a coin (the Cobbles' stones) hides the border too. */}
          <span className="relative inline-flex">
            <span aria-hidden className={cn("absolute inset-[4%] rounded-full border bg-resource-plate", tone === "invite" ? "border-primary/60" : "border-resource-edge")} />
            <TokenIcon kind={kind} className={cn("relative", parts.coin)} />
          </span>
        </ChangePop>
      </span>
      <ChangeFloat change={change} moving={moving} className={left ? "right-auto left-2" : "right-6"} />
    </span>
  );
}
