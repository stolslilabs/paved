import { AVATAR_PARTS, type Avatar, type AvatarPart } from "@paved/renderer";
import { cn } from "../../lib/utils";
import { Icon } from "../ui/icon";
import { AvatarStill } from "../elements/avatar-still";
import { Cobbles } from "../elements/cobbles";
import { PART_TITLES, withPart, type AvatarOffer } from "./avatar-types";

/** A swatch's still: the draft wearing the variant, 64 px. */
const SWATCH_PX = 64;

export interface AvatarSwatchesProps {
  part: AvatarPart;
  /** The draft: each swatch shows it wearing its variant, the draft's own variant selected. */
  draft: Avatar;
  /** The part's offers, by variant id. */
  offers: readonly AvatarOffer[];
  /** The variant whose purchase is on its way. */
  buying?: number | null;
  /** A write on its way (a purchase or a save): no variant can be picked until its receipt. */
  disabled?: boolean;
  onPick?: (id: number) => void;
}

/** What a swatch says under its name: the price on sale, Owned, or not for sale; a free variant says nothing. */
function OfferLine({ offer }: { offer: AvatarOffer }) {
  if (offer.kind === "sale") return <Cobbles value={offer.cobbles} size="sm" />;
  if (offer.kind === "owned")
    return (
      <span className="inline-flex items-center gap-1 text-xs text-success">
        <Icon name="check" size="xs" />
        Owned
      </span>
    );
  if (offer.kind === "off")
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Icon name="lock" size="xs" />
        Not for sale
      </span>
    );
  return <span className="text-xs text-muted-foreground">Free</span>;
}

/**
 * A part's variants as a grid of swatches (#626 PR 2): each the player's draft wearing it, as a still (rendered once, cached),
 * its name, and its price, Owned, Free or Not for sale. A tap tries it on, whatever it costs: Buy and Save are the page's.
 * One choice of the group (radio semantics), the draft's variant checked.
 */
export function AvatarSwatches({ part, draft, offers, buying, disabled, onPick }: AvatarSwatchesProps) {
  const names = AVATAR_PARTS[part];
  return (
    <div role="radiogroup" aria-label={PART_TITLES[part]} className="grid grid-cols-3 gap-2 mobile:grid-cols-4 tablet:grid-cols-6 desktop:grid-cols-5">
      {names.map((name, id) => {
        const offer = offers[id] ?? { kind: "off" };
        const selected = draft[part] === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${name}${offer.kind === "sale" ? `, ${offer.cobbles} Cobbles` : offer.kind === "owned" ? ", owned" : offer.kind === "off" ? ", not for sale" : ", free"}`}
            data-offer={offer.kind}
            disabled={disabled}
            onClick={() => onPick?.(id)}
            className={cn(
              "state-layer relative flex min-w-0 flex-col items-center gap-1 rounded-xl border bg-card px-1 pt-2 pb-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none",
              selected ? "border-primary ring-1 ring-primary" : "border-border",
            )}
          >
            <AvatarStill avatar={withPart(draft, part, id)} size={SWATCH_PX} className={cn(offer.kind === "off" && "opacity-50")} />
            {/* The name wraps (WRAP360): a two-word name takes two lines on the narrowest phone rather than an ellipsis. */}
            <span className="w-full text-center text-xs leading-tight font-medium wrap-anywhere">{name}</span>
            <OfferLine offer={offer} />
            {/* The purchase on its way: the swatch dims and pulses (Buy shows the spinner). */}
            {buying === id && <span className="absolute inset-0 animate-pulse rounded-xl bg-background/60 motion-reduce:animate-none" aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}
