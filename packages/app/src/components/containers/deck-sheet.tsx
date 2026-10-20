import { deckSheetCounts, baseDeckPlans, type DeckSheetCounts, type DeckSheetOrder } from "@paved/game-core";
import type { BoardTile } from "@paved/chain";
import { useSidePanel } from "../../lib/side-panel";
import { cn } from "../../lib/utils";
import { TileChip, type TileArt } from "../elements/tile-chip";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { ScrollRegion } from "../ui/scroll-region";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../ui/sheet";

/**
 * What the sheet shows, by the game's mode (#613). `counted`: a random draw (Challenge, Training), the deck as a count per
 * plan (`deckSheetCounts`), never its order nor the cards withdrawn at the start. `ordered`: a Story level's fixed draw
 * (`deckSheetOrder`), the next tile first, so the player can plan the level.
 */
export type DeckSheetView = { mode: "counted"; counts: DeckSheetCounts } | { mode: "ordered"; order: DeckSheetOrder };

export interface DeckSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  view: DeckSheetView;
  /** Chain plan id of the tile in hand: its next chip is highlighted (counted; the ordered view knows its tile in hand). */
  handPlan?: number | null;
  tileArt?: TileArt;
  /** Force a side (the stories show both at one width); by the screen's width otherwise. */
  side?: "bottom" | "left";
  /** A Story level: shows the level's deck presentation again (#593). */
  onPresent?: () => void;
}

/**
 * The deck over the board (#540): in a random draw one chip per card of the deck grouped by plan, the cards already on the
 * board crossed out, the tile in hand highlighted; in a Story level the draw in its order (#613). A bottom sheet on a phone;
 * a panel on the left from `tablet` up, so that the hand panel (bottom right) stays free.
 */
export function DeckSheet({ open, onOpenChange, view, handPlan, tileArt, side, onPresent }: DeckSheetProps) {
  const wide = useSidePanel();
  const where = side ?? (wide ? "left" : "bottom");
  const ordered = view.mode === "ordered";
  const total = ordered ? view.order.slots.length : view.counts.total;
  const placed = ordered ? view.order.placed : view.counts.placed;
  const discarded = ordered ? view.order.discarded : view.counts.discarded;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={where}
        className={where === "bottom" ? "max-h-[70dvh] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]" : "w-full max-w-sm p-4"}
        aria-describedby="deck-sheet-note"
      >
        <SheetHeader className="pr-10">
          <SheetTitle className="font-display text-lg">Deck</SheetTitle>
          <SheetDescription id="deck-sheet-note">
            {ordered ? `This level deals these ${total} tiles in this order, the next one first.` : `The deck is drawn from these ${total} tiles; some never come.`}
          </SheetDescription>
        </SheetHeader>
        {/* The header stays; the deck scrolls under it with the edge hint (NO-SCROLLBARS, #609). */}
        <ScrollRegion className="-mx-4 flex min-h-0 flex-col gap-4 px-4">
          {ordered ? <OrderedDeck order={view.order} tileArt={tileArt} /> : <CountedDeck counts={view.counts} handPlan={handPlan} tileArt={tileArt} />}
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

/** One card of the sheet: its chip, crossed out once played, dashed once discarded. Both views draw their cards with it. */
function DeckCard({ plan, out, discarded, inHand, size = "sm", tileArt }: { plan: number; out: boolean; discarded: boolean; inHand: boolean; size?: "sm" | "md"; tileArt?: TileArt }) {
  return (
    <span data-out={out} data-discarded={discarded} title={discarded ? "Discarded" : out ? "Played" : inHand ? "In hand" : undefined} className={cn("relative inline-flex rounded-md", out && "opacity-40", discarded && "outline-2 -outline-offset-2 outline-dashed outline-foreground")}>
      <TileChip plan={plan} size={size} art={tileArt} state={inHand ? "selected" : "default"} />
      {out && <span aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center text-foreground before:h-0.5 before:w-[130%] before:-rotate-45 before:bg-current" />}
    </span>
  );
}

/** A random draw: the cards grouped by plan, in the plans' order (never the draw's). */
function CountedDeck({ counts, handPlan, tileArt }: { counts: DeckSheetCounts; handPlan?: number | null; tileArt?: TileArt }) {
  return (
    <ul className="flex flex-wrap gap-2" data-testid="deck-plans">
      {counts.plans.map((plan) => (
        <li key={plan.plan} className="flex max-w-full flex-wrap gap-1 rounded-lg bg-secondary/50 p-1" data-plan={plan.code}>
          {Array.from({ length: plan.total }, (_, i) => {
            const placed = i < plan.placed;
            const discarded = !placed && i < plan.placed + plan.discarded;
            const inHand = !placed && !discarded && i === plan.placed + plan.discarded && handPlan === plan.plan;
            return <DeckCard key={i} plan={plan.plan} out={placed || discarded} discarded={discarded} inHand={inHand} tileArt={tileArt} />;
          })}
        </li>
      ))}
    </ul>
  );
}

const SLOT_LABEL = { placed: "played", discarded: "discarded", hand: "in hand", next: "to come" } as const;

/** A Story level's draw: one numbered card per tile, the first drawn first, each in its position once played. */
function OrderedDeck({ order, tileArt }: { order: DeckSheetOrder; tileArt?: TileArt }) {
  return (
    <ol className="grid grid-cols-[repeat(auto-fill,minmax(3.5rem,1fr))] gap-2" data-testid="deck-order">
      {order.slots.map((slot, i) => (
        <li key={i} className="flex flex-col items-center gap-0.5" data-plan={slot.code} data-slot-state={slot.state} aria-label={`Tile ${i + 1}, ${SLOT_LABEL[slot.state]}`}>
          <DeckCard plan={slot.plan} out={slot.state === "placed" || slot.state === "discarded"} discarded={slot.state === "discarded"} inHand={slot.state === "hand"} size="md" tileArt={tileArt} />
          <span className={cn("numeric text-xs", slot.state === "hand" ? "font-semibold text-foreground" : "text-muted-foreground")}>{slot.state === "hand" ? "Now" : i + 1}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * The sheet on the board's tiles: what the board opens from "Tiles left". Its own chunk (`BoardScene` imports it on demand).
 * With a Story level's `order`, the draw in its order; otherwise the base deck counted against the board and the discards.
 */
export default function BoardDeckSheet({
  open,
  onOpenChange,
  tiles,
  discardedPlans,
  order,
  handPlan,
  tileArt,
  side,
  onPresent,
}: Pick<DeckSheetProps, "open" | "onOpenChange" | "handPlan" | "tileArt" | "side" | "onPresent"> & { tiles: readonly BoardTile[]; discardedPlans?: readonly number[]; order?: DeckSheetOrder }) {
  const view: DeckSheetView = order ? { mode: "ordered", order } : { mode: "counted", counts: deckSheetCounts(baseDeckPlans(), tiles.map((t) => t.plan), discardedPlans) };
  return <DeckSheet open={open} onOpenChange={onOpenChange} view={view} handPlan={handPlan} tileArt={tileArt} side={side} onPresent={onPresent} />;
}
