import { deckSheetCounts, baseDeckPlans, type DeckSheetCounts, type PlanType } from "@paved/game-core";
import type { BoardTile } from "@paved/chain";
import { useSidePanel } from "../../lib/side-panel";
import { cn } from "../../lib/utils";
import { TileChip, type TileArt } from "../elements/tile-chip";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../ui/sheet";

export interface DeckSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * The deck as a count per plan and what is out of it (`deckSheetCounts`). An input, so that a Story level can bring its own
   * fixed deck (#546). Never the cards withdrawn at the start of a game: the sheet shows the whole deck.
   */
  counts: DeckSheetCounts;
  /** Chain plan id of the tile in hand: its next chip is highlighted. */
  handPlan?: number | null;
  tileArt?: TileArt;
  /** Force a side (the stories show both at one width); by the screen's width otherwise. */
  side?: "bottom" | "left";
  /** A Story level's fixed deck (#546): every tile shown comes, none is withdrawn. */
  fixed?: boolean;
  /** A Story level: shows the level's deck presentation again (#593). */
  onPresent?: () => void;
}

/**
 * The deck over the board (#540): one chip per card of the deck grouped by plan, the cards already on the board crossed out,
 * the tile in hand highlighted. A bottom sheet on a phone; a panel on the left from `tablet` up, so that the hand panel
 * (bottom right) stays free.
 */
export function DeckSheet({ open, onOpenChange, counts, handPlan, tileArt, side, fixed = false, onPresent }: DeckSheetProps) {
  const wide = useSidePanel();
  const where = side ?? (wide ? "left" : "bottom");
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={where}
        className={where === "bottom" ? "max-h-[70dvh] overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]" : "w-full max-w-sm overflow-y-auto p-4"}
        aria-describedby="deck-sheet-note"
      >
        <SheetHeader className="pr-10">
          <SheetTitle className="font-display text-lg">Deck</SheetTitle>
          <SheetDescription id="deck-sheet-note">
            {fixed ? `This level deals all of these ${counts.total} tiles, in a fixed order.` : `The deck is drawn from these ${counts.total} tiles; some never come.`}
          </SheetDescription>
        </SheetHeader>
        <ul className="flex flex-wrap gap-2" data-testid="deck-plans">
          {counts.plans.map((plan) => (
            <li key={plan.plan} className="flex max-w-full flex-wrap gap-1 rounded-lg bg-secondary/50 p-1" data-plan={plan.code}>
              {Array.from({ length: plan.total }, (_, i) => {
                const placed = i < plan.placed;
                const discarded = !placed && i < plan.placed + plan.discarded;
                const out = placed || discarded;
                const inHand = !out && i === plan.placed + plan.discarded && handPlan === plan.plan;
                return (
                  <span key={i} data-out={out} data-discarded={discarded} title={discarded ? "Discarded" : placed ? "Played" : undefined} className={cn("relative inline-flex rounded-md", out && "opacity-40", discarded && "outline-2 -outline-offset-2 outline-dashed outline-foreground")}>
                    <TileChip plan={plan.plan} size="sm" art={tileArt} state={inHand ? "selected" : "default"} />
                    {out && <span aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center text-foreground before:h-0.5 before:w-[130%] before:-rotate-45 before:bg-current" />}
                  </span>
                );
              })}
            </li>
          ))}
        </ul>
        <p className="numeric text-sm text-muted-foreground" data-testid="deck-summary">
          {counts.placed} played, {counts.discarded} discarded (dashed), {counts.total - counts.placed - counts.discarded} not yet.
        </p>
        {onPresent && (
          <Button size="sm" variant="secondary" className="self-start" onClick={onPresent}>
            <Icon name="play" size="sm" /> Present the level again
          </Button>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** The sheet on the board's tiles: what the board opens from "Tiles left". Its own chunk (`BoardScene` imports it on demand). */
export default function BoardDeckSheet({
  open,
  onOpenChange,
  tiles,
  discardedPlans,
  deck,
  handPlan,
  tileArt,
  onPresent,
}: Pick<DeckSheetProps, "open" | "onOpenChange" | "handPlan" | "tileArt" | "onPresent"> & { tiles: readonly BoardTile[]; discardedPlans?: readonly number[]; deck?: readonly PlanType[] }) {
  const counts = deckSheetCounts(deck ?? baseDeckPlans(), tiles.map((t) => t.plan), discardedPlans);
  return <DeckSheet open={open} onOpenChange={onOpenChange} counts={counts} handPlan={handPlan} tileArt={tileArt} fixed={deck !== undefined} onPresent={onPresent} />;
}
