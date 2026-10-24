import type { PointerEvent as ReactPointerEvent } from "react";
import { cn } from "../../lib/utils";
import { RarityBadge, rarityOf } from "../elements/rarity-badge";
import { TileChip, type TileArt } from "../elements/tile-chip";
import { tileName } from "../elements/tile-render";
import { Icon } from "../ui/icon";
import { ScrollRegion } from "../ui/scroll-region";

export interface InventoryTrayProps {
  /** The tiles off the layout, a count per chain plan id (0 still listed: the plan is owned, all its tiles placed). */
  tray: Readonly<Record<number, number>>;
  /** The plan held (tapped): the board's empty cells take it. */
  held?: number | null;
  /** The held plan's orientation, 1 north to 4 west. */
  orientation?: number;
  /** Every slot is used: nothing more can be placed (a tile taken off frees one). */
  full?: boolean;
  /** A placed tile is dragged over the tray: dropping it takes it off. */
  dropping?: boolean;
  /** The plan being dragged out: its chip stays, dimmed. */
  dragging?: number | null;
  tileArt?: TileArt;
  onSelect?: (plan: number | null) => void;
  /** A press on a chip: the scene starts a drag from it once the pointer moves. */
  onDragStart?: (plan: number, event: ReactPointerEvent<HTMLButtonElement>) => void;
  className?: string;
}

/**
 * The inventory while the layout is edited (#739): every plan the player holds off the board, with its count and rarity.
 * Drag a chip onto an empty cell, or tap it and then a cell. A row that scrolls on a phone, a grid in the desktop panel. It
 * is also where a placed tile is dropped to take it off (`data-tray`): it lights up while one is dragged over it.
 */
export function InventoryTray({ tray, held = null, orientation = 1, full = false, dropping = false, dragging = null, tileArt, onSelect, onDragStart, className }: InventoryTrayProps) {
  const plans = Object.entries(tray)
    .map(([plan, count]) => ({ plan: Number(plan), count }))
    .filter((p) => p.count >= 0)
    .sort((a, b) => b.count - a.count || a.plan - b.plan);
  const total = plans.reduce((n, p) => n + p.count, 0);
  return (
    <section
      aria-labelledby="inventory-title"
      data-tray
      className={cn("flex min-w-0 flex-col gap-2 rounded-xl border border-transparent transition-colors", dropping && "border-dashed border-primary bg-primary/10", className)}
    >
      <header className="flex items-baseline justify-between gap-2 px-1">
        <h2 id="inventory-title" className="text-sm font-semibold">
          Inventory <span className="numeric text-muted-foreground">{total}</span>
        </h2>
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {dropping ? (
            "Drop to take it off"
          ) : full ? (
            "Every slot is used"
          ) : held != null ? (
            "Tap a cell to place it"
          ) : (
            "Drag a tile onto the board"
          )}
        </p>
      </header>
      {plans.length === 0 ? (
        <p className="px-1 py-3 text-sm text-muted-foreground">No tile off the board: open chests or visit the shop for more.</p>
      ) : (
        <ScrollRegion orientation="horizontal" className="desktop:overflow-visible">
          <ul aria-label="Inventory tiles" className="flex w-max gap-2 px-1 pt-1 pb-2 desktop:grid desktop:w-auto desktop:grid-cols-4">
          {plans.map(({ plan, count }) => {
            const chosen = held === plan;
            const off = count === 0 || full;
            return (
              <li key={plan} className="shrink-0">
                <button
                  type="button"
                  aria-pressed={chosen}
                  aria-label={`${tileName(plan)}, ${count} left`}
                  disabled={off}
                  onClick={() => onSelect?.(chosen ? null : plan)}
                  onPointerDown={(e) => !off && onDragStart?.(plan, e)}
                  className={cn(
                    "state-layer relative flex w-18 touch-none flex-col items-center gap-1 rounded-xl border border-border bg-secondary/40 p-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring desktop:w-full",
                    chosen && "border-primary bg-primary/10",
                    dragging === plan && "opacity-40",
                    off && "opacity-40",
                  )}
                >
                  <TileChip plan={plan} orientation={chosen ? orientation : 1} art={tileArt} className="size-14 rounded-[3px] border-0" />
                  <span className="absolute top-1 right-1 rounded-md bg-background/85 px-1 text-xs font-semibold">
                    <span aria-hidden>×</span>
                    <span className="numeric">{count}</span>
                  </span>
                  <RarityBadge rarity={rarityOf(plan)} className="px-1.5" />
                </button>
              </li>
            );
          })}
          </ul>
        </ScrollRegion>
      )}
    </section>
  );
}
