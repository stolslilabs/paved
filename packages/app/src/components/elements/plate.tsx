import { cva, type VariantProps } from "class-variance-authority";
import { type ReactNode } from "react";
import { cn } from "../../lib/utils";

const boxVariants = cva("relative flex items-center rounded-lg border bg-resource-plate shadow-[inset_0_2px_0_var(--resource-shade)]", {
  variants: {
    // Issue 828: a 32 px box under a 40 px disc on a phone, 36 under 44 from `desktop` (the balances' `rail`; their bare icon, issue
    // 213, 48 and 52); `auto`, the one and then the other (the home's left column, issue 829).
    size: { sm: "h-8 text-sm", md: "h-9 text-lg", auto: "h-8 text-sm desktop:h-9 desktop:text-lg" },
    /** `invite`: the Cobbles' plate (issue 620), a gold edge and a slow shine: it leads to the packs (no "+", issue 925). */
    tone: { default: "border-resource-edge", invite: "border-primary/60" },
  },
  defaultVariants: { size: "sm", tone: "default" },
});

export type PlateSize = NonNullable<VariantProps<typeof boxVariants>["size"]>;

/**
 * Each size's parts (issue 828). The icon stands over the box's end, its centre on the border, so half of it overlaps the box; a
 * disc may do the same at the other end. The box keeps the overlap plus a gap clear inside, so the figure never runs under either.
 * No plate draws a "+" (the owner's ruling of issue 925): the end opposite the icon is bare, or the League's disc.
 */
type Ends = Record<"right" | "left", string>;
type EndParts = { box: string; over: Ends; pad: Ends };
const PARTS: Record<PlateSize, { width: string; coin: string; over: Ends; bareEnd: EndParts; leadOver: Ends; pad: { icon: Ends; disc: Ends; bare: Ends } }> = {
  sm: {
    // A currency's one width (issue 860), in a column or a row, at every phone width, with no "+" (issue 925): 112 px, "9,999.99"
    // at 12 px (54 px) between the icon's 24 + 4 and an end's 4 (`FIXED_PAD`); two fit a phone's header beside Back at 320 (240 px
    // left), and the home's stack leaves the profile its line. A class the bundle already has (its CSS budget).
    width: "w-28",
    coin: "size-10",
    over: { right: "-ml-5", left: "-mr-5" },
    // A bare icon (issue 213, no disc): 48 px over the 32 px box, its half (24) over the end and a gap (8) inside. It gives back
    // the 8 px it passes a disc's 40, 4 above and 4 below (`-my-1`, the end's), so the row keeps a disc's height.
    bareEnd: { box: "size-12", over: { right: "-ml-6", left: "-mr-6" }, pad: { right: "pr-8", left: "pl-8" } },
    leadOver: { right: "-mr-5", left: "-ml-5" },
    // The icon's half (20) and a gap (8); a disc as the icon; a bare end: 10 px.
    pad: { icon: { right: "pr-7", left: "pl-7" }, disc: { right: "pl-7", left: "pr-7" }, bare: { right: "pl-2.5", left: "pr-2.5" } },
  },
  md: {
    // "9,999.99" at 18 px (85 px) in 120 px: the bare icon's 26 + 34 and a bare end's 12 (no "+", issue 925) leave it in 192 px,
    // #860's width, kept (a class the bundle already has).
    width: "w-48",
    coin: "size-11",
    over: { right: "-ml-5.5", left: "-mr-5.5" },
    // 52 px over the 36 px box.
    bareEnd: { box: "size-13", over: { right: "-ml-6.5", left: "-mr-6.5" }, pad: { right: "pr-8.5", left: "pl-8.5" } },
    leadOver: { right: "-mr-5.5", left: "-ml-5.5" },
    pad: { icon: { right: "pr-7.5", left: "pl-7.5" }, disc: { right: "pl-7.5", left: "pr-7.5" }, bare: { right: "pl-3", left: "pr-3" } },
  },
  auto: {
    // No currency uses `auto`: the phone's width, so no class is built for nothing.
    width: "w-28",
    coin: "size-10 desktop:size-11",
    over: { right: "-ml-5 desktop:-ml-5.5", left: "-mr-5 desktop:-mr-5.5" },
    // No balance uses `auto`: its bare icon is the phone's, so no class is built for nothing (the bundle's CSS budget).
    bareEnd: { box: "size-12", over: { right: "-ml-6", left: "-mr-6" }, pad: { right: "pr-8", left: "pl-8" } },
    leadOver: { right: "-mr-5 desktop:-mr-5.5", left: "-ml-5 desktop:-ml-5.5" },
    pad: {
      icon: { right: "pr-7 desktop:pr-7.5", left: "pl-7 desktop:pl-7.5" },
      disc: { right: "pl-7 desktop:pl-7.5", left: "pr-7 desktop:pr-7.5" },
      bare: { right: "pl-2.5 desktop:pl-3", left: "pr-2.5 desktop:pr-3" },
    },
  },
};

/**
 * A currency's figure at each size (issue 860): 12 px on a phone ("9,999.99", 54 px of the 56 the 112 px plate leaves), the box's
 * 18 px from `desktop` (85 px of 92).
 */
const FIGURE: Record<PlateSize, string> = { sm: "text-xs", md: "", auto: "" };

/**
 * A currency's phone plate's box (issue 860), on the balances' side (`right`): the figure 4 px clear of the icon's half (28) and of
 * the open end (4), so "9,999.99" fits 112 px. Classes the bundle already has (its CSS budget).
 */
const FIXED_PAD = "pr-7 pl-1";

/** Where a fixed plate's figure turns compact (issue 860), at each size: from 10,000 (`amountFigure`'s rule), so "9,999.99" is whole. */
export const PLATE_COMPACT: Record<"sm" | "md", number> = { sm: 10_000, md: 10_000 };

export interface PlateProps extends VariantProps<typeof boxVariants> {
  /** The icon's end (issue 828): `right` on the right of the screen, `left` mirrored for its left (issue 829). */
  side?: "right" | "left";
  /** Over the icon's end: larger than the box, hiding its border (`PlateDisc` draws an icon on the plate's own disc). */
  end: ReactNode;
  /**
   * `disc` (the default): the end is a `PlateDisc`, 40 px over the 32 px box (44 over 36). `bare`: an icon alone, no disc behind
   * it (issue 213, the balances' coins and stone), drawn larger, 48 px over the 32 px box (52 over 36), so it covers the end.
   */
  endFit?: "disc" | "bare";
  /**
   * Over the other end: `disc`, a round face of the icon's size (the League button, issue 829), drawn by `leadContent`. Omitted, the
   * end is bare: no plate draws a "+" (issue 925), a balance's tap is the whole plate.
   */
  lead?: "disc";
  leadContent?: ReactNode;
  /**
   * A currency's plate (issue 860): one width at each size whatever its figure, the box filling what the ends leave and the figure
   * at the side away from the icon. Omitted, the box fits its content (the League's and the shield's plates).
   */
  fixed?: boolean;
  /** Past the plate, out of its flow (the change's float). */
  after?: ReactNode;
  /** The box's content: the figure, and a hint of what a tap does. */
  children: ReactNode;
  className?: string;
  "data-slot"?: string;
  "data-token"?: string;
}

/**
 * A game's resource plate (issues 620, 828): a rounded box, an icon standing over one end, taller than the box and hiding its
 * border, and over the other end, if any, a round disc (no "+", issue 925). The box keeps the overlaps plus a gap clear inside, so its
 * content never runs under either end. The balances' plate (`ResourcePlate`), the League's and the shield's (issue 829).
 */
export function Plate({ side = "right", end, endFit = "disc", lead, leadContent, fixed, after, size, tone, children, className, ...data }: PlateProps) {
  const parts = PARTS[size ?? "sm"];
  const bare = endFit === "bare";
  // A fixed plate's box takes what the ends leave, its figure at the side away from the icon.
  const fill = fixed && ["min-w-0 flex-1", side === "left" && "justify-end", FIGURE[size ?? "sm"], (size ?? "sm") === "sm" && side === "right" && FIXED_PAD];
  return (
    <span {...data} data-side={side} className={cn("relative inline-flex items-center whitespace-nowrap", side === "left" && "flex-row-reverse", fixed && parts.width, className)}>
      {lead === "disc" && (
        <span data-slot="plate-lead" className={cn("relative z-10 inline-flex shrink-0 drop-shadow-sm", parts.leadOver[side])}>
          {leadContent}
        </span>
      )}
      <span className={cn(boxVariants({ size, tone }), bare ? parts.bareEnd.pad[side] : parts.pad.icon[side], lead ? parts.pad[lead][side] : parts.pad.bare[side], fill)}>
        {/* The shine in its own clipped layer: the floating change goes past the plate's edge. */}
        {tone === "invite" && (
          <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
            <span className="plate-shine absolute inset-0" />
          </span>
        )}
        {children}
      </span>
      <span className={cn("relative z-10 inline-flex shrink-0 drop-shadow-sm", bare ? [parts.bareEnd.over[side], "-my-1"] : parts.over[side])}>{end}</span>
      {after}
    </span>
  );
}

/**
 * An icon over a plate's end, on a disc in the plate's colours: an icon that is not a coin (the Cobbles' stones, a crest, a shield)
 * hides the border too. An image fills the size's box; a Font Awesome icon sits at its centre.
 */
export function PlateDisc({
  size,
  tone,
  face = "plate",
  children,
  className,
}: VariantProps<typeof boxVariants> & {
  /** `button`: the overlay buttons' round face (a card disc, the icon in gold), the League button over a plate's end (issue 829). */
  face?: "plate" | "button";
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("relative grid place-items-center", PARTS[size ?? "sm"].coin, face === "button" && "text-primary", className)}>
      <span
        aria-hidden
        className={cn(
          "absolute rounded-full border",
          face === "button" ? "inset-0 border-border bg-card shadow-lg" : "inset-[4%] bg-resource-plate",
          face === "plate" && (tone === "invite" ? "border-primary/60" : "border-resource-edge"),
        )}
      />
      {children}
    </span>
  );
}

/** A Font Awesome icon on a `PlateDisc`, sized to it: 20 px on the 40 px disc, 24 on the 44. */
export const plateIconClass = (size: PlateSize | null | undefined): string =>
  ({ sm: "text-[1.25rem]", md: "text-[1.5rem]", auto: "text-[1.25rem] desktop:text-[1.5rem]" })[size ?? "sm"];

/** A plate's figure in chunky mono, its digits of one width (`numeric`). */
export const PLATE_FIGURE = "relative numeric font-bold tracking-tight";

/** A currency's plate's one width at each size (`fixed`, issue 860): its skeleton takes it, so nothing moves when the figure arrives. */
export const plateWidthClass = (size: PlateSize | null | undefined): string => PARTS[size ?? "sm"].width;

/** The icon's box at each size, for an image over a plate's end on a `PlateDisc`. */
export const plateCoinClass = (size: PlateSize | null | undefined): string => PARTS[size ?? "sm"].coin;

/** A bare icon's box at each size (`endFit="bare"`, issue 213): a token's coin or stone with no disc, taller than the plate. */
export const plateBareIconClass = (size: PlateSize | null | undefined): string => PARTS[size ?? "sm"].bareEnd.box;

/** The plate's own variants (`size`, `tone`), for a plate built on it. */
export type PlateVariants = VariantProps<typeof boxVariants>;
