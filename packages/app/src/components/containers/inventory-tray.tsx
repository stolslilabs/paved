import { cn } from "../../lib/utils";
import { RarityBadge, rarityOf } from "../elements/rarity-badge";
import { TileChip, type TileArt } from "../elements/tile-chip";
import { tileName } from "../elements/tile-render";
import { Carousel, CarouselContent, CarouselItem } from "../ui/carousel";

export interface InventoryTrayProps {
  /** The tiles off the layout, a count per chain plan id (0 still listed: the plan is owned, all its tiles placed). */
  tray: Readonly<Record<number, number>>;
  /** The plan in hand, from the inventory: its card is chosen. */
  held?: number | null;
  /** Every slot is used: the carousel is greyed, and says so (a tile lifted from the board can still go back). */
  full?: boolean;
  /** A save on its way: the cards wait. */
  busy?: boolean;
  tileArt?: TileArt;
  /** A card chosen: its tile in hand; chosen again: out of the hand. */
  onSelect?: (plan: number | null) => void;
  className?: string;
}

/**
 * The village editor's inventory (#739): a carousel at the bottom, where the tile stack sits on the board. One card per plan
 * the player holds off the board, with its count (×3) and its rarity; choosing a card puts that tile in hand, and the board
 * lights its legal cells. Swiped on a phone, dragged with the mouse. Greyed when every slot is used.
 */
export function InventoryTray({ tray, held = null, full = false, busy = false, tileArt, onSelect, className }: InventoryTrayProps) {
  const plans = Object.entries(tray)
    .map(([plan, count]) => ({ plan: Number(plan), count }))
    .filter((p) => p.count >= 0)
    .sort((a, b) => b.count - a.count || a.plan - b.plan);
  const total = plans.reduce((n, p) => n + p.count, 0);
  return (
    <section aria-labelledby="inventory-title" data-full={full || undefined} className={cn("flex min-w-0 flex-col gap-2", className)}>
      <header className="flex items-baseline justify-between gap-2 px-1">
        <h2 id="inventory-title" className="text-sm font-semibold">
          Inventory <span className="numeric text-muted-foreground">{total}</span>
        </h2>
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {full ? "Every slot is used" : held != null ? "Tap a lit cell to place it" : "Choose a tile to place"}
        </p>
      </header>
      {plans.length === 0 ? (
        <p className="px-1 py-3 text-sm text-muted-foreground">No tile off the board: open chests or visit the shop for more.</p>
      ) : (
        <Carousel aria-label="Inventory tiles" opts={{ align: "start", dragFree: true, containScroll: "trimSnaps" }} className={cn(full && "opacity-50 grayscale")}>
          <CarouselContent className="-ml-2">
            {plans.map(({ plan, count }) => {
              const chosen = held === plan;
              return (
                <CarouselItem key={plan} className="basis-[5.25rem] pl-2">
                  <button
                    type="button"
                    aria-pressed={chosen}
                    aria-label={`${tileName(plan)}, ${count} left`}
                    disabled={count === 0 || full || busy}
                    onClick={() => onSelect?.(chosen ? null : plan)}
                    className={cn(
                      "state-layer relative flex w-full flex-col items-center gap-1 rounded-xl border border-border bg-secondary/40 p-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      chosen && "border-primary bg-primary/10",
                      count === 0 && "opacity-40",
                    )}
                  >
                    <TileChip plan={plan} art={tileArt} className="aspect-square size-auto w-full rounded-[3px] border-0" />
                    <span className="absolute top-1 right-1 rounded-md bg-background/85 px-1 text-xs font-semibold">
                      <span aria-hidden>×</span>
                      <span className="numeric">{count}</span>
                    </span>
                    <RarityBadge rarity={rarityOf(plan)} className="px-1.5" />
                  </button>
                </CarouselItem>
              );
            })}
          </CarouselContent>
        </Carousel>
      )}
    </section>
  );
}
