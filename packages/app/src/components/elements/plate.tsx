import { cva, type VariantProps } from "class-variance-authority";
import { type ReactNode } from "react";
import { cn } from "../../lib/utils";
import { HudFrame } from "./hud-frame";

const boxVariants = cva("relative flex items-center", {
  variants: {
    // Issue 828: a 32 px box under a 40 px disc on a phone, 36 under 44 from `desktop` (the balances' `rail`; their bare icon, issue
    // 213, 48 and 52); `auto`, the one and then the other (the home's left column, issue 829).
    size: { sm: "h-8 text-sm", md: "h-9 text-lg", auto: "h-8 text-sm desktop:h-9 desktop:text-lg" },
    /** `invite`: the Cobbles' plate (issue 620), a slow shine (and a gold edge on the flat frame): it leads to the packs (no "+", issue 925). */
    tone: { default: "border-resource-edge", invite: "border-primary/60" },
    /**
     * `flat`: a rounded box in the plate's colours. `hud`: the HUD's frame, drawn under the content (`HudFrame`), the box taking
     * what its plate leaves and the figure centred in it (the mockup's).
     */
    frame: { flat: "rounded-lg border bg-resource-plate shadow-[inset_0_2px_0_var(--resource-shade)]", hud: "isolate grow justify-center" },
  },
  // On the HUD's frame the balances are lower than the left column's capsules, as on the mockup: 28 px on a phone, 32 from `desktop`.
  compoundVariants: [
    { frame: "hud", size: "sm", class: "h-7" },
    { frame: "hud", size: "md", class: "h-8" },
  ],
  defaultVariants: { size: "sm", tone: "default", frame: "flat" },
});

export type PlateSize = NonNullable<VariantProps<typeof boxVariants>["size"]>;

/**
 * Each size's parts (issue 828). The icon stands over the box's end, so part of it overlaps the box; the box keeps the overlap plus
 * a gap clear inside, so the figure never runs under it (`pad`). No plate draws a "+" (the owner's ruling of issue 925): the other end
 * is bare (`rest`, its padding). The icon gives back what it passes the box, above and below (`my`), so the row keeps the box's height
 * (a bare icon's, 8 px of it). On the HUD's frame (HOME-UI-CAPSULES) the icon runs past the box's end, so the frame's rounded end is
 * under it, as on the mockup.
 */
type Ends = Record<"right" | "left", string>;
type EndParts = { box: string; over: Ends; pad: Ends; rest: Ends; my: string };
const PARTS: Record<PlateSize, { width: string; bareEnd: EndParts; hudEnd: EndParts }> = {
  sm: {
    // A currency's one width (issue 860), in a column or a row, at every phone width, with no "+" (issue 925): 108 px on the HUD's
    // frame (HOME-UI-CAPSULES), "9,999.99" at 13 px (61 px) between the bare end's 6 and the icon's 30 inside the box, the icon's 10
    // past it; two fit a phone's header beside Back at 320 (240 px left).
    width: "w-27",
    // A bare icon (issue 213, no disc): 48 px over the 32 px box, its half (24) over the end and a gap (8) inside; the bare end 10 px.
    bareEnd: { box: "size-12", over: { right: "-ml-6", left: "-mr-6" }, pad: { right: "pr-8", left: "pl-8" }, rest: { right: "pl-2.5", left: "pr-2.5" }, my: "-my-1" },
    // HOME-UI-CAPSULES: on the HUD's frame a balance's icon, 40 px over the 28 px box, 30 of it over the box (10 past its end), the
    // figure against it (the coin is round, its box's corner clear).
    hudEnd: { box: "size-10", over: { right: "-ml-7.5", left: "-mr-7.5" }, pad: { right: "pr-7.5", left: "pl-7.5" }, rest: { right: "pl-1.5", left: "pr-1.5" }, my: "-my-1.5" },
  },
  md: {
    // The rail's (from `desktop`): "9,999.99" at 16 px (75 px) between the bare end's 8 and the icon's 34 inside the box, the icon's
    // 10 past it: 128 px.
    width: "w-32",
    // 52 px over the 36 px box.
    bareEnd: { box: "size-13", over: { right: "-ml-6.5", left: "-mr-6.5" }, pad: { right: "pr-8.5", left: "pl-8.5" }, rest: { right: "pl-3", left: "pr-3" }, my: "-my-1" },
    // 44 px over the 32 px box, 34 of it over the box.
    hudEnd: { box: "size-11", over: { right: "-ml-8.5", left: "-mr-8.5" }, pad: { right: "pr-8.5", left: "pl-8.5" }, rest: { right: "pl-2", left: "pr-2" }, my: "-my-1.5" },
  },
  auto: {
    // No currency uses `auto`: the phone's width, so no class is built for nothing.
    width: "w-27",
    // No balance uses `auto`: its bare icon is the phone's, so no class is built for nothing (the bundle's CSS budget).
    bareEnd: { box: "size-12", over: { right: "-ml-6", left: "-mr-6" }, pad: { right: "pr-8", left: "pl-8" }, rest: { right: "pl-2.5", left: "pr-2.5" }, my: "-my-1" },
    // The home's left column (the crowns, the village, the shield), higher than the balances as on the mockup: 40 px over the 32 px
    // box on a phone, 44 over 36 from `desktop`, 8 px past its end.
    hudEnd: {
      box: "size-10 desktop:size-11",
      over: { right: "-ml-8 desktop:-ml-9", left: "-mr-8 desktop:-mr-9" },
      pad: { right: "pr-9 desktop:pr-10", left: "pl-9 desktop:pl-10" },
      rest: { right: "pl-2.5 desktop:pl-3", left: "pr-2.5 desktop:pr-3" },
      my: "-my-1",
    },
  },
};

/**
 * A figure on the HUD's frame (HOME-UI-CAPSULES), as on the mockup: a balance's 13 px on a phone and 16 px on the rail, smaller than
 * the home's left column's 16 then 18 px.
 */
const HUD_FIGURE: Record<PlateSize, string> = { sm: "text-[0.8125rem]", md: "text-base", auto: "text-base desktop:text-lg" };

/** Where a fixed plate's figure turns compact (issue 860), at each size: from 10,000 (`amountFigure`'s rule), so "9,999.99" is whole. */
export const PLATE_COMPACT: Record<"sm" | "md", number> = { sm: 10_000, md: 10_000 };

export interface PlateProps extends VariantProps<typeof boxVariants> {
  /** The icon's end (issue 828): `right` on the right of the screen, `left` mirrored for its left (issue 829). */
  side?: "right" | "left";
  /**
   * Over the icon's end, larger than the box: on the flat frame a bare icon (issue 213, no disc), 48 px over the 32 px box (52 over
   * 36), hiding its end; on the HUD's frame the icon capping the end from inside. The other end is bare: no plate draws a "+" (issue
   * 925), a balance's tap is the whole plate.
   */
  end: ReactNode;
  /**
   * A currency's plate (issue 860): one width at each size whatever its figure, the box filling what the ends leave. Omitted, the
   * plate fits its content, or what its caller gives it (the home's left column, one width for its capsules).
   */
  fixed?: boolean;
  /**
   * `flat` (the default): a rounded box in the plate's colours (the League page's plates). `hud`: the HUD's frame (`HudFrame`, the
   * player card's, HOME-UI-CAPSULES): a see-through dark face in the mockup's painted rim, the icon capping the end from inside, a
   * larger figure (the home's capsules and the balances).
   */
  frame?: "flat" | "hud";
  /** Past the plate, out of its flow (the change's float). */
  after?: ReactNode;
  /** The box's content: the figure, and a hint of what a tap does. */
  children: ReactNode;
  className?: string;
  "data-slot"?: string;
  "data-token"?: string;
}

/**
 * A game's resource plate (issues 620, 828): a box, an icon standing over one end, taller than the box (no "+" at the other, issue
 * 925). The box keeps the overlap plus a gap clear inside, so its content never runs under the icon. The balances' plate
 * (`ResourcePlate`), the League's and the shield's (issue 829), the village score's.
 */
export function Plate({ side = "right", end, fixed, frame = "flat", after, size, tone, children, className, ...data }: PlateProps) {
  const parts = PARTS[size ?? "sm"];
  const hud = frame === "hud";
  // The end's parts: on the HUD's frame the icon caps the end from inside (`hudEnd`), else a bare icon over it.
  const ends = hud ? parts.hudEnd : parts.bareEnd;
  return (
    <span
      {...data}
      data-side={side}
      data-frame={frame}
      className={cn("relative inline-flex items-center whitespace-nowrap", side === "left" && "flex-row-reverse", fixed && parts.width, className)}
    >
      <span
        className={cn(
          boxVariants({ size, tone, frame }),
          ends.pad[side],
          ends.rest[side],
          hud && HUD_FIGURE[size ?? "sm"],
          // A fixed plate's box takes what the ends leave.
          fixed && "min-w-0 flex-1",
        )}
      >
        {hud && <HudFrame px={10} />}
        {/* The shine in its own clipped layer: the floating change goes past the plate's edge. On the HUD's frame, its face only. */}
        {tone === "invite" && (
          <span aria-hidden className={cn("pointer-events-none absolute overflow-hidden", hud ? "inset-[3px] rounded-lg" : "inset-0 rounded-[inherit]")}>
            <span className="plate-shine absolute inset-0" />
          </span>
        )}
        {children}
      </span>
      <span className={cn("relative z-10 inline-flex shrink-0 drop-shadow-sm", ends.over[side], ends.my)}>{end}</span>
      {after}
    </span>
  );
}

/** A plate's figure in chunky mono, its digits of one width (`numeric`). */
export const PLATE_FIGURE = "relative numeric font-bold tracking-tight";

/** A currency's plate's one width at each size (`fixed`, issue 860): its skeleton takes it, so nothing moves when the figure arrives. */
export const plateWidthClass = (size: PlateSize | null | undefined): string => PARTS[size ?? "sm"].width;

/** A bare icon's box at each size on the flat frame (issue 213): a crest with no disc, taller than the plate. */
export const plateBareIconClass = (size: PlateSize | null | undefined): string => PARTS[size ?? "sm"].bareEnd.box;

/** The icon's box on the HUD's frame at each size (`frame="hud"`): 40 px on a phone's balance, 44 on the rail's, 40 then 44 in the column. */
export const plateHudIconClass = (size: PlateSize | null | undefined): string => PARTS[size ?? "sm"].hudEnd.box;

/** The same in CSS px, for the copy its image loads (the largest it is drawn). */
export const plateHudIconPx = (size: PlateSize | null | undefined): number => ({ sm: 40, md: 44, auto: 44 })[size ?? "sm"];

/** The plate's own variants (`size`, `tone`), for a plate built on it. */
export type PlateVariants = VariantProps<typeof boxVariants>;
