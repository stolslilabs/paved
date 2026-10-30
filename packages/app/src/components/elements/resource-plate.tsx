import { type ReactNode } from "react";
import { cn } from "../../lib/utils";
import { ChangeFloat, ChangePop, changeTone, useAmountChange } from "./amount-change";
import { NumberTicker } from "./number-ticker";
import { Plate, plateBareIconClass, PLATE_FIGURE, type PlateVariants } from "./plate";
import { TokenIcon, type TokenKind } from "./token-icon";

export interface ResourcePlateProps extends PlateVariants {
  kind: TokenKind;
  /** Base units (a token) or a count (the Cobbles, `decimals` 0). Null: no source, a dash; a change from or to null is not animated. */
  amount: bigint | null;
  decimals: number;
  /** The digits shown after the point. */
  fraction: number;
  /** A "+" at the end opposite the icon, as a game's currency bar invites a purchase (a balance that leads to a page). */
  plus?: boolean;
  /** `mobile`: the "+" only from `mobile` (360 px) up (`Plate`'s `leadFrom`, issue 871). */
  plusFrom?: "mobile";
  /**
   * The icon's end (issue 828): `right` for the plates on the right of the screen (the balances), the "+" at the left; `left`, the
   * same plate mirrored for the left of the screen (issue 829), the "+" at the right.
   */
  side?: "right" | "left";
  /** The amount shown before this plate mounted (a balance that just appeared): the first render animates from it. */
  from?: bigint;
  /** One width at each size, whatever the figure (issue 860, `Plate`'s `fixed`); with `compactFrom`, the figure never overflows it. */
  fixed?: boolean;
  /**
   * From this figure on (tokens, or Cobbles: 10,000 on a fixed plate) the figure is compact ("12.3K"), the counter's too; the full
   * amount is the container's (its accessible name and tooltip). Omitted, never.
   */
  compactFrom?: number;
  /** After the figure: a hint of what a tap does (a chevron). */
  children?: ReactNode;
  className?: string;
}

/**
 * A balance as a game's resource bar shows it (issues 620, 828): a `Plate` with the figure in chunky mono, the token's icon
 * standing over one end, bare (issue 213: no disc behind it) and taller than the plate, and for a balance with a page to go to
 * a "+" over the other end, a little smaller. On each change of the amount, never on the first one nor from a missing value, the figure counts to the new value (`NumberTicker`) and briefly takes
 * the change's colour; up, a "+N" rises and fades and the icon pops; down, a "−N" drops and fades and the icon dips. Under reduced
 * motion only the colour flashes: nothing moves. The accessible name is the container's.
 */
export function ResourcePlate({ kind, amount, decimals, fraction, plus, plusFrom, side = "right", from, fixed, compactFrom, size, tone, children, className }: ResourcePlateProps) {
  const { text, start, target, format, change, flash, moving } = useAmountChange({ amount, decimals, fraction, from, compactFrom });
  return (
    <Plate
      data-slot="resource-plate"
      data-token={kind}
      side={side}
      size={size}
      tone={tone}
      lead={plus ? "plus" : undefined}
      leadFrom={plusFrom}
      fixed={fixed}
      className={className}
      endFit="bare"
      end={
        <ChangePop change={change} moving={moving}>
          <TokenIcon kind={kind} className={plateBareIconClass(size)} />
        </ChangePop>
      }
      after={<ChangeFloat change={change} moving={moving} className={side === "left" ? "right-auto left-2" : "right-6"} />}
    >
      <span aria-hidden className={cn(PLATE_FIGURE, "transition-colors duration-700 motion-reduce:duration-300", changeTone(flash, change))}>
        {text === null ? "–" : <NumberTicker value={target} startValue={start} decimalPlaces={fraction} format={format} className="tracking-tight" />}
      </span>
      {children}
    </Plate>
  );
}
