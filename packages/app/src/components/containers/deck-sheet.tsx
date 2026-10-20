import { deckSheetCounts, baseDeckPlans, type DeckSheetCounts, type DeckSheetOrder } from "@paved/game-core";
import type { BoardTile } from "@paved/chain";
import type { TileSkins } from "@paved/renderer";
import { useDeckView, type DeckView } from "../../data/deck-view";
import { useSidePanel } from "../../lib/side-panel";
import { cn } from "../../lib/utils";
import { TileChip, type TileArt } from "../elements/tile-chip";
import type { TileRenders } from "../elements/tile-render";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { ScrollRegion } from "../ui/scroll-region";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";

/**
 * The real view's image of a plan (#606): its top-down render in the theme the board draws it in (`skins`, by plan key; the
 * base models without one), then the board's tile art, then none (the chip draws the plan's areas).
 */
export function deckArt(renders: TileRenders | undefined, skins: TileSkins | undefined, tileArt: TileArt | undefined): TileArt | undefined {
  if (!renders && !tileArt) return undefined;
  return (key) => renders?.(skins?.[key] ?? 0, `${key}-top`) ?? renders?.(0, `${key}-top`) ?? tileArt?.(key) ?? null;
}

/**
 * What the sheet shows, by the game's mode (#613). `counted`: a random draw (Challenge, Training), the deck as a count per
 * plan (`deckSheetCounts`), never its order nor the cards withdrawn at the start. `ordered`: a Story level's fixed draw
 * (`deckSheetOrder`), the next tile first, so the player can plan the level.
 */
export type DeckSheetDeck = { mode: "counted"; counts: DeckSheetCounts } | { mode: "ordered"; order: DeckSheetOrder };

export interface DeckSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deck: DeckSheetDeck;
  /** Chain plan id of the tile in hand: its next chip is highlighted (counted; the ordered view knows its tile in hand). */
  handPlan?: number | null;
  tileArt?: TileArt;
  /** The build-time renders (`useTileRenders`): the real view draws each plan's top-down render. */
  renders?: TileRenders;
  /** The board's skins (plan key to theme): the real view shows each plan in the theme the board draws it in. */
  skins?: TileSkins;
  /** The real tiles seen from above, or each plan's nine areas (the simplified view); the toggle in the header switches. */
  view?: DeckView;
  onViewChange?: (view: DeckView) => void;
  /** Force a side (the stories show both at one width); by the screen's width otherwise. */
  side?: "bottom" | "left";
  /** A Story level: shows the level's deck presentation again (#593). */
  onPresent?: () => void;
}

/**
/**
 * The deck over the board (#540): in a random draw one chip per card of the deck grouped by plan, the cards already on the
 * board crossed out, the tile in hand highlighted; in a Story level the draw in its order (#613). Each chip is the real tile
 * seen from above (its build-time render, in the board's skin), or its plan's nine areas: a toggle in the header switches
 * (#606). A bottom sheet on a phone; a panel on the left from `tablet` up, so that the tile stack (bottom right) stays free.
 */
export function DeckSheet({ open, onOpenChange, deck, handPlan, tileArt, renders, skins, view = "real", onViewChange, side, onPresent }: DeckSheetProps) {
  const wide = useSidePanel();
  const where = side ?? (wide ? "left" : "bottom");
  const ordered = deck.mode === "ordered";
  const total = ordered ? deck.order.slots.length : deck.counts.total;
  const placed = ordered ? deck.order.placed : deck.counts.placed;
  const discarded = ordered ? deck.order.discarded : deck.counts.discarded;
  const real = view === "real";
  const art = real ? deckArt(renders, skins, tileArt) : undefined;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={where}
        className={where === "bottom" ? "max-h-[70dvh] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]" : "w-full max-w-sm p-4"}
        aria-describedby="deck-sheet-note"
      >
        <SheetHeader className="pr-10">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SheetTitle className="font-display text-lg">Deck</SheetTitle>
            {onViewChange && (
              <ToggleGroup type="single" variant="outline" aria-label="Deck view" value={view} onValueChange={(v) => v && onViewChange(v as DeckView)}>
                <ToggleGroupItem value="real" className="h-11 px-3">
                  <Icon name="eye" size="sm" /> Real
                </ToggleGroupItem>
                <ToggleGroupItem value="simple" className="h-11 px-3">
                  <Icon name="table-cells-large" size="sm" /> Simplified
                </ToggleGroupItem>
              </ToggleGroup>
            )}
          </div>
          <SheetDescription id="deck-sheet-note">
            {ordered ? `This level deals these ${total} tiles in this order, the next one first.` : `The deck is drawn from these ${total} tiles; some never come.`}
          </SheetDescription>
        </SheetHeader>
        {/* The header stays; the deck scrolls under it with the edge hint (NO-SCROLLBARS, #609). */}
        <ScrollRegion className="-mx-4 flex min-h-0 flex-col gap-4 px-4">
          {ordered ? <OrderedDeck order={deck.order} art={art} real={real} view={view} /> : <CountedDeck counts={deck.counts} handPlan={handPlan} art={art} real={real} view={view} />}
          <p className="numeric text-sm text-muted-foreground" data-testid="deck-summary">
            {placed} played, {discarded} discarded (dashed), {total - placed - discarded} not yet.
          </p>
          {onPresent && (
            <Button size="sm" variant="secondary" className="self-start" onClick={onPresent}>
              <Icon name="play" size="sm" /> Present the level again
            </Button>
          )}
        </ScrollRegion>
      </SheetContent>
    </Sheet>
  );
}

/** How a card is drawn: the real view's image (`deckArt`) or the plan's nine areas (the simplified view). */
interface CardLook {
  art?: TileArt;
  real: boolean;
}

/** One card of the sheet: its chip, crossed out once played, dashed once discarded. Both views draw their cards with it. */
function DeckCard({ plan, out, discarded, inHand, size = "sm", art, real }: { plan: number; out: boolean; discarded: boolean; inHand: boolean; size?: "sm" | "md" } & CardLook) {
  return (
    <span data-out={out} data-discarded={discarded} title={discarded ? "Discarded" : out ? "Played" : inHand ? "In hand" : undefined} className={cn("relative inline-flex rounded-md", out && "opacity-40", discarded && "outline-2 -outline-offset-2 outline-dashed outline-foreground")}>
      <TileChip plan={plan} size={size} art={art} view={real ? "art" : "areas"} state={inHand ? "selected" : "default"} className={cn(real && size === "sm" && "size-10")} />
      {out && <span aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center text-foreground before:h-0.5 before:w-[130%] before:-rotate-45 before:bg-current" />}
    </span>
  );
}

/** A random draw: the cards grouped by plan, in the plans' order (never the draw's). */
function CountedDeck({ counts, handPlan, art, real, view }: { counts: DeckSheetCounts; handPlan?: number | null; view: DeckView } & CardLook) {
  return (
    <ul className="flex flex-wrap gap-2" data-testid="deck-plans" data-view={view}>
      {counts.plans.map((plan) => (
        <li key={plan.plan} className="flex max-w-full flex-wrap gap-1 rounded-lg bg-secondary/50 p-1" data-plan={plan.code}>
          {Array.from({ length: plan.total }, (_, i) => {
            const placed = i < plan.placed;
            const discarded = !placed && i < plan.placed + plan.discarded;
            const inHand = !placed && !discarded && i === plan.placed + plan.discarded && handPlan === plan.plan;
            return <DeckCard key={i} plan={plan.plan} out={placed || discarded} discarded={discarded} inHand={inHand} art={art} real={real} />;
          })}
        </li>
      ))}
    </ul>
  );
}

const SLOT_LABEL = { placed: "played", discarded: "discarded", hand: "in hand", next: "to come" } as const;

/** A Story level's draw: one numbered card per tile, the first drawn first, each in its position once played. */
function OrderedDeck({ order, art, real, view }: { order: DeckSheetOrder; view: DeckView } & CardLook) {
  return (
    <ol className="grid grid-cols-[repeat(auto-fill,minmax(3.5rem,1fr))] gap-2" data-testid="deck-order" data-view={view}>
      {order.slots.map((slot, i) => (
        <li key={i} className="flex flex-col items-center gap-0.5" data-plan={slot.code} data-slot-state={slot.state} aria-label={`Tile ${i + 1}, ${SLOT_LABEL[slot.state]}`}>
          <DeckCard plan={slot.plan} out={slot.state === "placed" || slot.state === "discarded"} discarded={slot.state === "discarded"} inHand={slot.state === "hand"} size="md" art={art} real={real} />
          <span className={cn("numeric text-xs", slot.state === "hand" ? "font-semibold text-foreground" : "text-muted-foreground")}>{slot.state === "hand" ? "Now" : i + 1}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * The sheet on the board's tiles: what the board opens from the tile stack. Its own chunk (`BoardScene` imports it on
 * demand). With a Story level's `order`, the draw in its order; otherwise the base deck counted against the board and the
 * discards. The view is the device's (`useDeckView`), kept across games.
 */
export default function BoardDeckSheet({
  open,
  onOpenChange,
  tiles,
  discardedPlans,
  order,
  handPlan,
  tileArt,
  renders,
  skins,
  side,
  onPresent,
}: Pick<DeckSheetProps, "open" | "onOpenChange" | "handPlan" | "tileArt" | "renders" | "skins" | "side" | "onPresent"> & { tiles: readonly BoardTile[]; discardedPlans?: readonly number[]; order?: DeckSheetOrder }) {
  const deck: DeckSheetDeck = order ? { mode: "ordered", order } : { mode: "counted", counts: deckSheetCounts(baseDeckPlans(), tiles.map((t) => t.plan), discardedPlans) };
  const [view, setView] = useDeckView();
  return (
    <DeckSheet
      open={open}
      onOpenChange={onOpenChange}
      deck={deck}
      handPlan={handPlan}
      tileArt={tileArt}
      renders={renders}
      skins={skins}
      view={view}
      onViewChange={setView}
      side={side}
      onPresent={onPresent}
    />
  );
}
