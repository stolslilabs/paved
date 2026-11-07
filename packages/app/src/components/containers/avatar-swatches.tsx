import type { CSSProperties } from "react";
import { TRAIT_OPTIONS, type Trait } from "@paved/renderer";
import { cn } from "../../lib/utils";
import { AvatarStill } from "../elements/avatar-still";
import { TokenIcon } from "../elements/token-icon";
import { UiIcon } from "../elements/ui-icon";
import { optionName, PART_TITLES, traitsOf, withPart, type AvatarOffer, type TraitIds } from "./avatar-types";

/** A swatch's still: the draft wearing the option, rendered at its largest, 88 px. */
const SWATCH_PX = 88;

/**
 * The still's disc (the owner's ask of 2026-11-06: no league on the avatar's pages, no rim and no crest): the card's width (a third of
 * the drawer's body) less its margin, 88 px at most, a thin near-black outline round it.
 */
const DISC: CSSProperties = {
  width: "min(5.5rem, calc((100vw - 3rem) / 3 - 1.25rem))",
  aspectRatio: "1",
  boxShadow: "0 0 0 2px var(--hud-outline)",
};

/**
 * The option tried on (the Paved UX Book's): the card filled with the gold (the primary's down to the ring's), lit along its top, its
 * near-black outline and lip kept; the hover and press layers over it.
 */
const TRIED: CSSProperties = {
  backgroundImage: "linear-gradient(var(--layer, transparent), var(--layer, transparent)), linear-gradient(var(--primary), var(--ring))",
  boxShadow: "inset 0 1px 0 color-mix(in oklab, var(--primary) 45%, var(--foreground)), 0 0 0 1px var(--hud-outline), 0 2px 0 1px var(--hud-outline)",
};

export interface AvatarSwatchesProps {
  part: Trait;
  /** The draft: each swatch shows it wearing its option, the draft's own option selected. */
  draft: TraitIds;
  /** The trait's offers, by option id. */
  offers: readonly AvatarOffer[];
  /** The option whose purchase is on its way. */
  buying?: number | null;
  /** A write on its way (a purchase or a save): no option can be picked until its receipt. */
  disabled?: boolean;
  onPick?: (id: number) => void;
}

/**
 * What a swatch says under its still: its Cobble price carved, as the Shop writes it; Owned, small, grey and in italics, for a free or
 * owned option (the owner's asks of 2026-11-06 and 2026-11-07: no Free tag, a discreet Owned); Off sale with its padlock (withdrawn,
 * sold out, past its season: neither the player's nor for sale). One height for all, so the stills line up.
 */
function OfferPill({ offer, tried }: { offer: AvatarOffer; tried: boolean }) {
  const pill = "drawer-carved text-outline flex h-7 w-full max-w-full items-center justify-center gap-1 rounded-full px-2.5 text-sm leading-none font-bold whitespace-nowrap";
  if (offer.kind === "sale")
    return (
      <span className={cn(pill, "numeric")}>
        <TokenIcon kind="cobbles" px={18} className="size-4.5" />
        {offer.cobbles}
      </span>
    );
  if (offer.kind === "off")
    return (
      <span className={cn(pill, "text-muted-foreground")}>
        <UiIcon name="padlock" px={16} className="size-4" />
        Off sale
      </span>
    );
  // On the gold of the option tried on, the grey would not show: the dark ink, half see-through.
  return <span className={cn("flex h-7 items-center text-sm font-medium italic", tried ? "text-background/65" : "text-muted-foreground")}>Owned</span>;
}

/**
 * A trait's options (AVATAR-PAGE, the Paved UX Book's "avatar-editor"): three a row, each a raised card, the player's draft wearing it as
 * a still (rendered once, cached) on a plain ground (its scene for a backdrop's option) in its disc, and under it its Cobble price, a
 * discreet Owned (free or owned), or Off sale. The option tried on is filled in gold. A tap tries it on, whatever it costs: Buy and Save are the page's. One choice of
 * the group (radio semantics), the draft's option checked.
 */
export function AvatarSwatches({ part, draft, offers, buying, disabled, onPick }: AvatarSwatchesProps) {
  return (
    <div role="radiogroup" aria-label={PART_TITLES[part]} data-slot="avatar-swatches" className="grid grid-cols-3 gap-2">
      {TRAIT_OPTIONS[part].map((_, id) => {
        const name = optionName(part, id)!;
        const offer = offers[id] ?? { kind: "off" };
        const selected = draft[part] === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${name}${offer.kind === "sale" ? `, ${offer.cobbles} Cobbles` : offer.kind === "off" ? ", not for sale" : ", owned"}`}
            title={name}
            data-offer={offer.kind}
            disabled={disabled}
            onClick={() => onPick?.(id)}
            style={selected ? TRIED : undefined}
            className={cn(
              "state-layer relative flex min-w-0 cursor-pointer flex-col items-center gap-2 rounded-xl px-1.5 pt-2.5 pb-2 outline-none disabled:cursor-default",
              !selected && "drawer-tile",
            )}
          >
            <span className="block shrink-0 overflow-hidden rounded-full" style={DISC}>
              {/* On a plain ground, the trait and not the scene (the owner's ask of 2026-11-06); a backdrop's option shows its scene. */}
              <AvatarStill
                traits={traitsOf(withPart(draft, part, id))}
                size={SWATCH_PX}
                ground={part === "backdrop" ? "scene" : "plain"}
                className={cn("size-full!", offer.kind === "off" && "opacity-50")}
              />
            </span>
            <OfferPill offer={offer} tried={selected} />
            {/* The purchase on its way: the card dims and pulses (Buy shows the spinner). */}
            {buying === id && <span className="absolute inset-0 animate-pulse rounded-xl bg-background/60 motion-reduce:animate-none" aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}
