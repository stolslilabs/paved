import { cva, type VariantProps } from "class-variance-authority";
import { type ReactNode } from "react";
import { cn } from "../../lib/utils";
import { GameIcon, type GameIconSize } from "./game-icon";

const boxVariants = cva("relative flex items-center rounded-lg border bg-resource-plate shadow-[inset_0_2px_0_var(--resource-shade)]", {
  variants: {
    // Issue 828: a 32 px box under a 40 px disc on a phone, 36 under 44 from `desktop` (the balances' `rail`; their bare icon, issue
    // 213, 48 and 52); `auto`, the one and then the other (the home's left column, issue 829).
    size: { sm: "h-8 text-sm", md: "h-9 text-lg", auto: "h-8 text-sm desktop:h-9 desktop:text-lg" },
    /** `invite`: the Cobbles' plate (issue 620), a gold edge, a "+" and a slow shine: it leads to the packs. */
    tone: { default: "border-resource-edge", invite: "border-primary/60" },
  },
  defaultVariants: { size: "sm", tone: "default" },
});

export type PlateSize = NonNullable<VariantProps<typeof boxVariants>["size"]>;

/**
 * Each size's parts (issue 828). The icon stands over the box's end, its centre on the border, so half of it overlaps the box; the
 * "+" does the same at the other end, a little smaller. The box keeps the overlap plus a gap clear inside, so the figure never runs
 * under either. The gap is a quarter of the "+" (`TOKEN_GAP`'s rule, issue 668). The "+" is the game icon `plus` (issues 845, 844), light
 * on its green relief button (drawn by the icon, 1.75em across: the square), 16 px in the 28 px square, 20 in the 32.
 */
type Ends = Record<"right" | "left", string>;
type EndParts = { box: string; over: Ends; pad: Ends };
const PARTS: Record<PlateSize, { width: string; coin: string; over: Ends; bareEnd: EndParts; leadOver: Ends; plus: string; plusIcon: GameIconSize; plusOver: Ends; pad: { icon: Ends; plus: Ends; disc: Ends; bare: Ends } }> = {
  sm: {
    // A currency's one width (issue 860), in a column or a row, with no "+" (issue 925): 136 px, "9,999.99" at 14 px (69 px), the
    // icon's 24 + 8 and a bare end's 10; two fit a phone's header beside Back (280 px left at 360). Below `mobile` 116 (two fit
    // the 240 px left at 320, the home's stack leaves the profile its line), the figure at 12 px and compact from 1,000.
    width: "w-34 max-mobile:w-29",
    coin: "size-10",
    over: { right: "-ml-5", left: "-mr-5" },
    // A bare icon (issue 213, no disc): 48 px over the 32 px box, its half (24) over the end and a gap (8) inside. It gives back
    // the 8 px it passes a disc's 40, 4 above and 4 below (`-my-1`, the end's), so the row keeps a disc's height.
    bareEnd: { box: "size-12", over: { right: "-ml-6", left: "-mr-6" }, pad: { right: "pr-8", left: "pl-8" } },
    leadOver: { right: "-mr-5", left: "-ml-5" },
    plus: "size-7",
    plusIcon: "sm",
    plusOver: { right: "-mr-3.5", left: "-ml-3.5" },
    // The icon's half (20) and a gap (8); the "+"'s half (14) and a gap (6); a disc as the icon; neither: 10 px.
    pad: { icon: { right: "pr-7", left: "pl-7" }, plus: { right: "pl-5", left: "pr-5" }, disc: { right: "pl-7", left: "pr-7" }, bare: { right: "pl-2.5", left: "pr-2.5" } },
  },
  md: {
    // "9,999.99" at 18 px (85 px), 16 + 24 and 34 + 26.
    width: "w-47",
    coin: "size-11",
    over: { right: "-ml-5.5", left: "-mr-5.5" },
    // 52 px over the 36 px box.
    bareEnd: { box: "size-13", over: { right: "-ml-6.5", left: "-mr-6.5" }, pad: { right: "pr-8.5", left: "pl-8.5" } },
    leadOver: { right: "-mr-5.5", left: "-ml-5.5" },
    plus: "size-8",
    plusIcon: "md",
    plusOver: { right: "-mr-4", left: "-ml-4" },
    pad: { icon: { right: "pr-7.5", left: "pl-7.5" }, plus: { right: "pl-6", left: "pr-6" }, disc: { right: "pl-7.5", left: "pr-7.5" }, bare: { right: "pl-3", left: "pr-3" } },
  },
  // `auto` has no "+" (the balances keep their fixed sizes): its "+" parts are the phone's, so no class is built for nothing.
  auto: {
    // No currency uses `auto`: the phone's width, so no class is built for nothing.
    width: "w-34 max-mobile:w-29",
    coin: "size-10 desktop:size-11",
    over: { right: "-ml-5 desktop:-ml-5.5", left: "-mr-5 desktop:-mr-5.5" },
    // No balance uses `auto`: its bare icon is the phone's, so no class is built for nothing (the bundle's CSS budget).
    bareEnd: { box: "size-12", over: { right: "-ml-6", left: "-mr-6" }, pad: { right: "pr-8", left: "pl-8" } },
    leadOver: { right: "-mr-5 desktop:-mr-5.5", left: "-ml-5 desktop:-ml-5.5" },
    plus: "size-7",
    plusIcon: "sm",
    plusOver: { right: "-mr-3.5", left: "-ml-3.5" },
    pad: {
      icon: { right: "pr-7 desktop:pr-7.5", left: "pl-7 desktop:pl-7.5" },
      plus: { right: "pl-5", left: "pr-5" },
      disc: { right: "pl-7 desktop:pl-7.5", left: "pr-7 desktop:pr-7.5" },
      bare: { right: "pl-2.5 desktop:pl-3", left: "pr-2.5 desktop:pr-3" },
    },
  },
};

/**
 * A currency's figure at each size (issue 860): the box's own, 14 px on a phone ("9,999.99", 69 px of the 70 the 136 px plate
 * leaves) and 18 px from `desktop` (85 px); below `mobile` 12 px, so that its longest below the compact form there, "999.99"
 * (6 mono characters, 45 px), fits the 50 px the 116 px plate leaves.
 */
const FIGURE: Record<PlateSize, string> = { sm: "max-mobile:text-xs", md: "", auto: "" };

/**
 * Where a fixed plate's figure turns compact (issue 860): from 10,000 (`amountFigure`'s rule) at each size, so the longest figure
 * below it is "9,999.99"; from 1,000 on a phone below `mobile` (`narrow`), whose 116 px plate cannot hold "9,999.99" at 12 px.
 */
export const PLATE_COMPACT = { sm: 10_000, md: 10_000, narrow: 1_000 } as const;

/** Below `mobile` (360 px, `max-mobile`), where a phone's fixed plate is 116 px and its figure compact from 1,000 (`PLATE_COMPACT.narrow`). */
export const PLATE_NARROW_QUERY = "(width < 22.5rem)";

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
   * Over the other end: `plus`, the "+" of a balance with a page to go to, a little smaller than the icon; `disc`, a round face of
   * the icon's size (the League button, issue 829), drawn by `leadContent`.
   */
  lead?: "plus" | "disc";
  /**
   * `mobile`: the "+" only from `mobile` (360 px) up, the phone's right-side plate (`sm`) bare below it (issue 871: two plates of a phone's header,
   * the Vault's PAVED leading to the Challenge beside vPAVED, fit a 320 px screen).
   */
  leadFrom?: "mobile";
  leadContent?: ReactNode;
  /**
   * A currency's plate (issue 860): one width at each size whatever its figure and its "+", the box filling what the ends leave and
   * the figure at the side away from the icon. A phone's (`sm`) has no "+" (the owner's ruling of issue 925): its width leaves no
   * room for one. Omitted, the box fits its content (the League's and the shield's plates).
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
 * border, and over the other end, if any, the "+" or a round disc. The box keeps the overlaps plus a gap clear inside, so its
 * content never runs under either end. The balances' plate (`ResourcePlate`), the League's and the shield's (issue 829).
 */
export function Plate({ side = "right", end, endFit = "disc", lead: asked, leadFrom, leadContent, fixed, after, size, tone, children, className, ...data }: PlateProps) {
  const parts = PARTS[size ?? "sm"];
  const bare = endFit === "bare";
  // A currency's phone plate draws no "+" (issues 860, 925).
  const lead = fixed && (size ?? "sm") === "sm" && asked === "plus" ? undefined : asked;
  // Below `mobile`, the phone's "+" is not drawn and the box keeps a bare end's padding (`pad.bare` of `sm`). The balances' side
  // only (`right`): the mirrored plates have no balance, so no class is built for nothing (the bundle's CSS budget).
  const fromMobile = leadFrom === "mobile" && lead === "plus" && (size ?? "sm") === "sm" && side === "right";
  // A fixed plate's box takes what the ends leave, its figure at the side away from the icon.
  const fill = fixed && ["min-w-0 flex-1", side === "left" && "justify-end", FIGURE[size ?? "sm"]];
  return (
    <span {...data} data-side={side} className={cn("relative inline-flex items-center whitespace-nowrap", side === "left" && "flex-row-reverse", fixed && parts.width, className)}>
      {lead === "plus" && (
        <span
          aria-hidden
          data-slot="resource-plus"
          className={cn(
            "relative z-10 grid shrink-0 place-items-center",
            parts.plus,
            parts.plusOver[side],
            // Shown again from `mobile` with a display class the bundle already has (its CSS budget).
            fromMobile && "hidden mobile:grid",
          )}
        >
          <GameIcon name="plus" size={parts.plusIcon} />
        </span>
      )}
      {lead === "disc" && (
        <span data-slot="plate-lead" className={cn("relative z-10 inline-flex shrink-0 drop-shadow-sm", parts.leadOver[side])}>
          {leadContent}
        </span>
      )}
      <span className={cn(boxVariants({ size, tone }), bare ? parts.bareEnd.pad[side] : parts.pad.icon[side], lead ? parts.pad[lead][side] : parts.pad.bare[side], fromMobile && "max-mobile:pl-2.5", fill)}>
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
