import { cn } from "../../lib/utils";
import { Badge } from "../ui/badge";
import { Icon } from "../ui/icon";
import { formatUnits, TOKENS } from "../elements/amount";
import { Cobbles } from "../elements/cobbles";
import { packDiscount, packsOnSale, referencePrice, type Pack } from "./cobble-types";

export { packsOnSale };

/** A USDC price as dollars, whole when it is ("$9"), else with cents ("$0.09"). */
export function formatUsd(price: bigint, fraction = 0): string {
  return `$${formatUnits(price, TOKENS.usdc.decimals, fraction)}`;
}

export interface PackCardProps {
  pack: Pack;
  selected: boolean;
  disabled?: boolean;
  onSelect?: (packId: number) => void;
  className?: string;
}

/**
 * One Cobble pack (gems-v1.md 2.1): its Cobbles, its price, the reference price struck through (100 Cobbles for $20) and the
 * discount, and the price of a Cobble. A radio of the packs' group.
 */
export function PackCard({ pack, selected, disabled, onSelect, className }: PackCardProps) {
  const discount = packDiscount(pack);
  const price = formatUsd(pack.price);
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={`${pack.cobbles} Cobbles for ${price}, ${discount}% off`}
      disabled={disabled}
      onClick={() => onSelect?.(pack.packId)}
      className={cn(
        "flex cursor-pointer flex-col gap-2 rounded-xl border bg-card p-4 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60",
        selected ? "border-primary ring-1 ring-primary" : "border-border hover:border-gold-800",
        className,
      )}
    >
      {/* In a 360 px column the larger counts and the badge do not fit on one line: the badge wraps under (WRAP360). */}
      <span className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
        <Cobbles value={pack.cobbles} size="lg" />
        {selected ? <Icon name="circle-check" size="md" className="text-primary" /> : <Badge variant="success">-{discount}%</Badge>}
      </span>
      <span className="flex flex-wrap items-baseline gap-x-2">
        <span className="numeric text-xl font-semibold">{price}</span>
        <s className="numeric text-sm text-muted-foreground">
          <span className="sr-only">instead of </span>
          {formatUsd(referencePrice(pack.cobbles))}
        </s>
        {selected && <span className="text-xs text-success">-{discount}%</span>}
      </span>
      <span className="numeric text-xs text-muted-foreground">{pack.cobbles > 0 ? `${formatUsd(pack.price / BigInt(pack.cobbles), 2)} a Cobble` : "No Cobbles"}</span>
    </button>
  );
}

export interface CobblePacksProps {
  packs: readonly Pack[];
  selected: number | null;
  /** A purchase on its way: the choice is locked. */
  disabled?: boolean;
  onSelect?: (packId: number) => void;
  className?: string;
}

/** The packs on sale (`active`, with Cobbles and a price), smallest first: two columns from the phone, four from `desktop`. */
export function CobblePacks({ packs, selected, disabled, onSelect, className }: CobblePacksProps) {
  return (
    <div role="radiogroup" aria-label="Cobble packs" className={cn("grid grid-cols-1 gap-3 mobile:grid-cols-2", className)}>
      {packsOnSale(packs).map((p) => (
        <PackCard key={p.packId} pack={p} selected={p.packId === selected} disabled={disabled} onSelect={onSelect} />
      ))}
    </div>
  );
}
