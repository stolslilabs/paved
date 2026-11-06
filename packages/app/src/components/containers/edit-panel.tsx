import { memo, type CSSProperties, type ReactNode } from "react";
import { CategoryType, formatInteger, type LayoutBreakdown } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { InlineError } from "../elements/inline-error";
import { PLATE_FIGURE, Plate, plateHudIconClass, plateHudIconPx } from "../elements/plate";
import { TileChip, type TileArt } from "../elements/tile-chip";
import { tileName } from "../elements/tile-render";
import type { UiIconName } from "../elements/ui-art";
import { UiIcon } from "../elements/ui-icon";
import { Button } from "../ui/button";
import { Carousel, CarouselContent, CarouselItem } from "../ui/carousel";
import { ScrollRegion } from "../ui/scroll-region";
import { DOCK_BAR_HEIGHT, DOCK_WIDTH, SlotsUsed, signed, useDocked } from "./edit-bar";
import type { LayoutEditor } from "./layout-editor";

/** Stable (Embla re-reads options that change): start-aligned, free drag, trimmed snaps. */
const CAROUSEL_OPTS = { align: "start", dragFree: true, containScroll: "trimSnaps" } as const;

/*
 * The HUD drawers' section title (`elements/section-title.tsx`'s markup and its rule, written again here: imported, it would leave the
 * drawers' chunk for one of its own, which the home's first load lists).
 */
const TITLE_RULE: CSSProperties = { height: 2, background: "linear-gradient(var(--drawer-bevel) 50%, var(--hud-outline) 50%)", maskImage: "linear-gradient(to right, black, transparent)" };
const TITLE_DIAMOND: CSSProperties = { background: "var(--drawer-bevel)", boxShadow: "0 1px 0 var(--hud-outline)", transform: "rotate(45deg)" };
function SectionTitle({ children, end }: { children: ReactNode; end?: ReactNode }) {
  return (
    <div className="flex min-h-9 items-center gap-3">
      <h3 className="text-outline flex shrink-0 items-baseline gap-2 font-display text-2xl leading-tight tracking-wide">{children}</h3>
      <span aria-hidden className="flex min-w-6 flex-1 items-center gap-1">
        <span className="size-1.5 shrink-0" style={TITLE_DIAMOND} />
        <span className="flex-1" style={TITLE_RULE} />
      </span>
      {end}
    </div>
  );
}

/*
 * The panel's places, as styles (the stylesheet's budget has no room for their classes): from `tablet` the side menu at the right, from
 * the screen's top, the HUD drawers' width (narrower on a tablet: `DOCK_WIDTH`), under the bar docked in its head (`EditBar`); a phone's
 * sheet at the foot, the safe area inside.
 */
const DOCK_BOX: CSSProperties = { top: DOCK_BAR_HEIGHT, left: "auto", width: DOCK_WIDTH };
const SHEET_FACE: CSSProperties = { paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" };
/** A carousel card's width, 88 px. */
const CARD_BASIS: CSSProperties = { flexBasis: "5.5rem" };

export interface EditPanelProps {
  editor: LayoutEditor;
  /** The cards' art: the tiles' top-down art (the owner's choice of 2026-11-05 over the book's angled renders); without it, the plan's chip. */
  tileArt?: TileArt;
  /** The save's refusal, above the inventory, the draft kept. */
  refusal?: ReactNode;
  /** What stands over the panel, centred (the plan view's still bubble). */
  above?: ReactNode;
  /** The saved layouts (#804): their carousel, above the inventory. */
  layouts?: ReactNode;
}

/**
 * Edit mode's panel (EDIT-VILLAGE, after the Paved UX Book's "Edit my village" and the owner's asks of 2026-11-05): the saved layouts'
 * carousel (#804) above the inventory (the points are the top left's), one height whatever happens: on a phone a plain bottom sheet at
 * the screen's foot (no grabber, no fold, square corners), from `tablet` a side menu at the right, the window's height, in the HUD
 * drawers' body, the bar docked in their band's place (the owner's asks: from `desktop`, then from `tablet` too). Both in the HUD drawers' look (the profile's
 * and the missions' side panel): the card's charcoal, one hairline along the inner edge. The inventory under the drawers' section
 * title: each card the tile's top-down art with its count in the dock's red badge, a carousel swiped or dragged on a phone (no scroll
 * bar), a grid that wraps and scrolls in the side menu; the slots used at the title's end, after the drawers' engraved rule (the
 * owner's asks). The hint is for assistive technology, but a refusal of a lift (the tile holds the village together) and a full
 * village, which show over the cards.
 */
export function EditPanel({ editor, tileArt, refusal, above, layouts }: EditPanelProps) {
  const docked = useDocked();
  const warn = editor.shaking != null || editor.full;
  return (
    <aside
      aria-label="Editor"
      data-bubble-avoid
      data-edit-panel={docked ? "side" : "sheet"}
      className="pointer-events-none absolute inset-x-0 bottom-0 flex"
      style={docked ? DOCK_BOX : undefined}
    >
      <div
        className={cn(
          "pointer-events-auto relative flex w-full flex-col border-input shadow-lg",
          docked ? "border-l" : "border-t",
          // From `tablet` the HUD drawers' body under their band: its lighter grey, its padding.
          docked ? "gap-3 bg-secondary px-4 pt-4 pb-3" : "gap-2 bg-card p-3",
        )}
        style={docked ? undefined : SHEET_FACE}
      >
        {above && <div className="absolute inset-x-0 bottom-full mb-3 flex justify-center">{above}</div>}
        {refusal}
        <InlineError
          title="No random village"
          message={editor.rollError}
          action={
            <Button size="sm" variant="ghost" onClick={editor.dismissRollError}>
              Dismiss
            </Button>
          }
        />
        {layouts && (
          <>
            <SectionTitle>Layouts</SectionTitle>
            {layouts}
          </>
        )}
        <SectionTitle end={<SlotsUsed editor={editor} />}>Inventory</SectionTitle>
        <p role="status" aria-live="polite" className={cn("px-1 text-xs", warn ? "text-warning" : "sr-only")}>
          {editor.hint}
        </p>
        <InventoryCards
          layout={docked ? "grid" : "carousel"}
          tray={editor.tray}
          held={editor.hand?.from === "inventory" ? editor.hand.plan : null}
          full={editor.full}
          busy={editor.saving}
          art={tileArt}
          onSelect={editor.choosePlan}
        />
      </div>
    </aside>
  );
}

interface InventoryCardsProps {
  /** A phone's carousel, or the side menu's grid. */
  layout: "carousel" | "grid";
  tray: Readonly<Record<number, number>>;
  held: number | null;
  full: boolean;
  busy: boolean;
  art?: TileArt;
  onSelect: (plan: number | null) => void;
}

/**
 * The inventory: one card per plan the player holds off the board (none left: dimmed, still listed), the most held first; a card chosen
 * puts its tile in hand (chosen again, out of it). Every slot used: greyed (the carousel still drags).
 */
const InventoryCards = memo(function InventoryCards({ layout, tray, held, full, busy, art, onSelect }: InventoryCardsProps) {
  const plans = Object.entries(tray)
    .map(([plan, count]) => ({ plan: Number(plan), count }))
    .filter((p) => p.count >= 0)
    .sort((a, b) => b.count - a.count || a.plan - b.plan);
  if (plans.length === 0) return <p className="px-1 py-6 text-sm text-muted-foreground">No tile off the board: open chests or visit the shop for more.</p>;
  const card = ({ plan, count }: { plan: number; count: number }) => (
    <InventoryCard plan={plan} count={count} chosen={held === plan} disabled={count === 0 || full || busy} art={art} onSelect={onSelect} />
  );
  if (layout === "grid")
    return (
      <ScrollRegion role="region" aria-label="Inventory tiles" data-layout="grid" className={cn("min-h-0 flex-1 px-1.5 pt-2", full && "opacity-50 grayscale")}>
        <ul className="grid grid-cols-3 gap-3 pb-2">
          {plans.map((p) => (
            <li key={p.plan}>{card(p)}</li>
          ))}
        </ul>
      </ScrollRegion>
    );
  return (
    <Carousel aria-label="Inventory tiles" data-layout="carousel" opts={CAROUSEL_OPTS} className={cn(full && "opacity-50 grayscale")}>
      {/* Its track named for the wrap sweep (`scripts/wrap-sweep.ts`): wider than its window, by design. */}
      <CarouselContent data-slot="carousel-track" className="-ml-3 py-2">
        {plans.map((p) => (
          <CarouselItem key={p.plan} className="pl-3" style={CARD_BASIS}>
            {card(p)}
          </CarouselItem>
        ))}
      </CarouselContent>
    </Carousel>
  );
});

/**
 * A plan's card: its top-down art, its count in the dock's red badge at its top right. One that cannot be chosen is `aria-disabled`
 * with its click guarded, not `disabled` (#757: a drag starting on a disabled control never reaches Embla).
 */
function InventoryCard({ plan, count, chosen, disabled, art, onSelect }: { plan: number; count: number; chosen: boolean; disabled: boolean; art?: TileArt; onSelect: (plan: number | null) => void }) {
  return (
    <button
      type="button"
      aria-pressed={chosen}
      aria-label={`${tileName(plan)}, ${count} left`}
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (!disabled) onSelect(chosen ? null : plan);
      }}
      className={cn("relative block aspect-square w-full rounded-xl outline-none", chosen ? "ring-2 ring-primary" : "ring-1 ring-border", disabled && "cursor-default", count === 0 && "opacity-40")}
    >
      <TileChip plan={plan} art={art} className="absolute inset-0 size-full rounded-xl border-0" />
      <span aria-hidden className="numeric absolute -top-1.5 -right-1.5 grid h-6 min-w-6 place-items-center rounded-md bg-dock-badge px-1 text-sm leading-none font-black text-foreground text-outline ring-2 ring-background">
        {count}
      </span>
    </button>
  );
}

/**
 * Each structure's image, the HUD's (PROFILE-PAGE's structures; one a line, the type on the closing one: the Font Awesome subset's
 * guard reads the words of a line that names an icon).
 */
const STRUCTURE_ART = {
  [CategoryType.City]: "city",
  [CategoryType.Road]: "road",
  [CategoryType.Forest]: "forest",
  [CategoryType.Wonder]: "wonder",
} as const satisfies Partial<Record<string, UiIconName>>;
const artOf = (category: string): UiIconName | undefined => (STRUCTURE_ART as Partial<Record<string, UiIconName>>)[category];

/** The points' column's place: under the bar at the top left; from `tablet` (the bar docked in the side menu) at the top (a style: the stylesheet's budget). */
const POINTS_BOX: CSSProperties = { top: "calc(var(--hud-inset-top) + 3.5rem + var(--hud-inset))", left: "var(--hud-inset-left)" };
const POINTS_BOX_DOCKED: CSSProperties = { top: "var(--hud-inset-top)", left: "var(--hud-inset-left)" };
/** The lines' veil: the home's mission preview's, see-through and blurred, no border. */
const LINES_VEIL: CSSProperties = { background: "color-mix(in oklab, var(--background) 45%, transparent)", backdropFilter: "blur(6px)" };
const LINE_LIT: CSSProperties = { ...LINES_VEIL, background: "color-mix(in oklab, var(--primary) 30%, transparent)" };
const LINES_HEIGHT: CSSProperties = { maxHeight: "40dvh" };

export interface EditPointsProps {
  /** The draft's points by structure (#758), the score with them. */
  breakdown: LayoutBreakdown;
  /** The draft's score against the saved one. */
  change: number;
  /** The structure lit (its line's key), or none. */
  selected: string | null;
  onSelect: (key: string | null) => void;
}

/**
 * Edit mode's points at the top left under the bar (EDIT-VILLAGE, the owner's choice of 2026-11-05): the live score as the home's
 * village capsule (the village tile capping its left end; the change against the saved score beside the figure, in the gain or the
 * fall colour), and under it every structure's line always shown, compact on the home's soft veil: its icon, its kind and its
 * points; a tap lights the structure on the village (#758), a tap on the lit one turns it off. The most points first; the column
 * scrolls past 40 % of the screen.
 */
export const EditPoints = memo(function EditPoints({ breakdown, change, selected, onSelect }: EditPointsProps) {
  const { lines, other, score } = breakdown;
  const docked = useDocked();
  return (
    <section aria-label="Village points" className="pointer-events-none absolute flex w-40 flex-col items-start gap-1.5" style={docked ? POINTS_BOX_DOCKED : POINTS_BOX}>
      <span role="img" aria-label={`Score ${formatInteger(score)}${change ? `, ${signed(change)} on the saved` : ""}`} className="pointer-events-auto flex min-h-11 items-center">
        <Plate side="left" size="auto" frame="hud" end={<UiIcon name="village" px={plateHudIconPx("auto")} className={plateHudIconClass("auto")} />}>
          <span aria-hidden className="flex items-baseline gap-1">
            <span className={cn(PLATE_FIGURE, "text-outline text-foreground")}>{formatInteger(score)}</span>
            {change !== 0 && <span className={cn("numeric text-xs font-bold text-outline", change > 0 ? "text-success" : "text-warning")}>{signed(change)}</span>}
          </span>
        </Plate>
      </span>
      {lines.length === 0 && other === 0 ? (
        <p className="rounded-full px-2.5 py-1 text-xs text-outline" style={LINES_VEIL}>
          No structure closed yet
        </p>
      ) : (
        <ScrollRegion className="pointer-events-auto w-full" style={LINES_HEIGHT}>
          <ul aria-label="Points by structure" className="flex flex-col items-start">
            {lines.map((line) => {
              const on = line.key === selected;
              const art = artOf(line.category);
              return (
                <li key={line.key}>
                  {/* The touch floor's 44 px, the pill 32 px inside it; the lit one's ring inside its edge (the list scrolls: it clips outside it). */}
                  <button type="button" aria-pressed={on} data-line={line.key} onClick={() => onSelect(on ? null : line.key)} className="flex min-h-11 items-center outline-none">
                    <span className={cn("flex min-h-8 items-center gap-1.5 rounded-full py-1 pr-2.5 pl-1 text-xs font-bold text-outline", on && "ring-1 ring-primary ring-inset")} style={on ? LINE_LIT : LINES_VEIL}>
                      {art && <UiIcon name={art} size="xs" px={20} />}
                      {line.category}
                      <span className="numeric text-success">+{formatInteger(line.points)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
            {other > 0 && (
              <li className="mt-1.5 flex items-center gap-1.5 rounded-full py-1 pr-2.5 pl-2 text-xs font-bold text-outline" style={LINES_VEIL}>
                Other <span className="numeric text-success">+{formatInteger(other)}</span>
              </li>
            )}
          </ul>
        </ScrollRegion>
      )}
    </section>
  );
});
