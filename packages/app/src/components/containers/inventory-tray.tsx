import { memo } from "react";
import { useSidePanel } from "../../lib/side-panel";
import { cn } from "../../lib/utils";
import { RarityBadge, rarityOf } from "../elements/rarity-badge";
import { TileChip, type TileArt } from "../elements/tile-chip";
import { tileName } from "../elements/tile-render";
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from "../ui/carousel";
import { ScrollRegion } from "../ui/scroll-region";

/** The carousel's re-measures pending, one per carousel. */
const remeasuring = new WeakSet<NonNullable<CarouselApi>>();

/**
 * The cards reordered or changed (their counts sort them): Embla measures again, in a task of its own rather than inside the
 * commit that moved them, so a change of the whole village (the die's, #803) never holds a frame with it.
 */
function remeasureLater(api: NonNullable<CarouselApi>): boolean {
  if (!remeasuring.has(api)) {
    remeasuring.add(api);
    setTimeout(() => {
      remeasuring.delete(api);
      api.reInit();
    }, 0);
  }
  return false;
}

/** Stable (Embla re-reads options that change): start-aligned, free drag, trimmed snaps. */
const CAROUSEL_OPTS = { align: "start", dragFree: true, containScroll: "trimSnaps", watchSlides: remeasureLater } as const;

/** The editor's panel is a column on the right from this width (`--breakpoint-desktop`): the inventory wraps there (#757). */
const DESKTOP_QUERY = "(min-width: 64rem)";

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
 * The village editor's inventory (#739): one card per plan the player holds off the board, with its count (×3) and its rarity;
 * choosing a card puts that tile in hand, and the board lights its legal cells. Below `desktop`, a carousel at the bottom, where
 * the tile stack sits on the board: swiped on a phone, dragged with the mouse. From `desktop` (#757), a wrapping grid that fills
 * the editor's column and scrolls, the panel's buttons staying in view under it. Greyed when every slot is used, in both.
 */
function InventoryTrayBase({ tray, held = null, full = false, busy = false, tileArt, onSelect, className }: InventoryTrayProps) {
  const desktop = useSidePanel(DESKTOP_QUERY);
  const plans = Object.entries(tray)
    .map(([plan, count]) => ({ plan: Number(plan), count }))
    .filter((p) => p.count >= 0)
    .sort((a, b) => b.count - a.count || a.plan - b.plan);
  const total = plans.reduce((n, p) => n + p.count, 0);
  const card = ({ plan, count }: { plan: number; count: number }) => (
    <InventoryCard plan={plan} count={count} chosen={held === plan} disabled={count === 0 || full || busy} tileArt={tileArt} onSelect={onSelect} />
  );
  return (
    <section aria-labelledby="inventory-title" data-full={full || undefined} className={cn("flex min-w-0 flex-col gap-2", desktop && "min-h-0 flex-1", className)}>
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
      ) : desktop ? (
        // A wheel, a trackpad or the keyboard scrolls it; the focus ring of a card in the first row or column stays inside.
        <ScrollRegion role="region" aria-label="Inventory tiles" data-layout="grid" className={cn("min-h-0 flex-1 p-0.5", full && "opacity-50 grayscale")}>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(5.25rem,1fr))] gap-2">
            {plans.map((p) => (
              <li key={p.plan}>{card(p)}</li>
            ))}
          </ul>
        </ScrollRegion>
      ) : (
        <Carousel aria-label="Inventory tiles" data-layout="carousel" opts={CAROUSEL_OPTS} className={cn(full && "opacity-50 grayscale")}>
          <CarouselContent className="-ml-2">
            {plans.map((p) => (
              <CarouselItem key={p.plan} className="basis-[5.25rem] pl-2">
                {card(p)}
              </CarouselItem>
            ))}
          </CarouselContent>
        </Carousel>
      )}
    </section>
  );
}

/**
 * A plan's card. One that cannot be chosen (none left, every slot used, a save on its way) is `aria-disabled` with its click
 * guarded, not `disabled` (#757): a browser sends no pointer event to a disabled control, so a drag that starts on one never
 * reached Embla, and with every visible card disabled the carousel could not be dragged at all.
 */
function InventoryCard({ plan, count, chosen, disabled, tileArt, onSelect }: { plan: number; count: number; chosen: boolean; disabled: boolean; tileArt?: TileArt; onSelect?: (plan: number | null) => void }) {
  return (
    <button
      type="button"
      aria-pressed={chosen}
      aria-label={`${tileName(plan)}, ${count} left`}
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (!disabled) onSelect?.(chosen ? null : plan);
      }}
      className={cn(
        "state-layer relative flex w-full flex-col items-center gap-1 rounded-xl border border-border bg-secondary/40 p-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring",
        disabled && "cursor-default",
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
  );
}

/** The inventory, drawn again only when its props change (the board's changes leave it, #803). */
export const InventoryTray = memo(InventoryTrayBase);
