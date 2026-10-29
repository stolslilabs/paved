import { useState } from "react";
import { useReducedMotionConfig } from "motion/react";
import * as m from "motion/react-m";
import { cn } from "../../lib/utils";
import { CHEST_CHOICES, CHEST_NAME, ChestBadge, type ChestRank } from "../elements/chest-badge";
import { Cobbles } from "../elements/cobbles";
import { RarityBadge, rarityOf } from "../elements/rarity-badge";
import { TileChip, type TileArt } from "../elements/tile-chip";
import { tileName } from "../elements/tile-render";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";

/** A chest opened (#736): its tiles drawn by rank (1, 2 or 3), and the Cobbles it may hold besides. */
export interface ChestDraw {
  rank: ChestRank;
  plans: readonly number[];
  /** The Cobbles won with it (a small chance, higher with the rank and the league); null: none this time. */
  cobbles: number | null;
}

export interface ChestRevealProps {
  draw: ChestDraw;
  /** How many of each plan the player holds already (the inventory and the layout), for the cards. */
  owned?: Readonly<Record<number, number>>;
  /** Where the story starts: a tile chosen. */
  initialChoice?: number | null;
  /** The choice on its way. */
  busy?: boolean;
  tileArt?: TileArt;
  /** The tile kept (its index in `plans`): it goes to the inventory, with the Cobbles if any. */
  onTake?: (index: number) => void;
  /**
   * `card` (the default): a card with the chest's name at its head, the tiles rising in. `modal` (#784): no frame and no head (the
   * modal shows the chest above it), the tiles flying out of the chest one after the other once its lid has burst.
   */
  variant?: "card" | "modal";
  className?: string;
}

/** In the `modal` variant, when the first tile leaves the chest (s) and the time between two (s): the burst comes first. */
export const TILES_OUT_S = 0.45;
export const TILE_GAP_S = 0.14;

/**
 * A chest opened (#739): its rank, its tiles side by side (basic one, kept as it is; rare one of 2; epic one of 3), each with
 * its rarity and how many the player holds, and the Cobbles when the chest held some. The tile kept goes to the inventory, not
 * onto the board: the layout is the editor's.
 */
export function ChestReveal({ draw, owned = {}, initialChoice = null, busy, tileArt, onTake, variant = "card", className }: ChestRevealProps) {
  const reduced = useReducedMotionConfig() ?? false;
  const modal = variant === "modal";
  const single = draw.plans.length === 1;
  const [choice, setChoice] = useState<number | null>(single ? 0 : initialChoice);
  const picked = choice != null ? draw.plans[choice] : undefined;
  return (
    <section
      aria-labelledby={modal ? undefined : "chest-title"}
      aria-label={modal ? CHEST_NAME[draw.rank] : undefined}
      data-input-surface
      className={cn("flex flex-col gap-4", !modal && "rounded-2xl border border-border bg-card p-4", className)}
    >
      {!modal && (
        <header className="flex items-center gap-3">
          <ChestBadge rank={draw.rank} open />
          <div className="flex flex-col gap-0.5">
            <h2 id="chest-title" className="font-display text-lg">
              {CHEST_NAME[draw.rank]}
            </h2>
            <p className="text-xs text-muted-foreground">{single ? "One tile, yours as it is." : `Keep one of its ${CHEST_CHOICES[draw.rank]} tiles.`}</p>
          </div>
        </header>
      )}
      {draw.cobbles != null && (
        <m.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={modal ? { delay: TILES_OUT_S + TILE_GAP_S * draw.plans.length } : undefined}
          className="flex items-center justify-between gap-3 rounded-xl border border-primary/50 bg-primary/10 px-3 py-2"
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Icon name="star" size="sm" className="text-primary" /> Cobbles in the chest!
          </span>
          <Cobbles value={draw.cobbles} sign="+" />
        </m.div>
      )}
      <ul aria-label="Chest tiles" className={cn("grid gap-2", single ? "grid-cols-1 justify-items-center" : draw.plans.length === 2 ? "grid-cols-2" : "grid-cols-3")}>
        {draw.plans.map((plan, i) => {
          const chosen = choice === i;
          const held = owned[plan] ?? 0;
          return (
            <m.li
              key={`${plan}-${i}`}
              initial={modal ? (reduced ? { opacity: 0 } : { y: -120, scale: 0.3, rotate: (i - 1) * 25, opacity: 0 }) : { y: 12, opacity: 0 }}
              animate={{ y: 0, scale: 1, rotate: 0, opacity: 1 }}
              transition={
                modal ? (reduced ? { delay: TILES_OUT_S, duration: 0.2 } : { delay: TILES_OUT_S + TILE_GAP_S * i, type: "spring", stiffness: 260, damping: 18 }) : { delay: 0.08 * i }
              }
              className={cn("min-w-0", single && "w-36")}
            >
              <button
                type="button"
                aria-pressed={single ? undefined : chosen}
                aria-label={`${tileName(plan)}, ${rarityOf(plan)}, ${held} held`}
                disabled={busy || single}
                onClick={() => setChoice(chosen ? null : i)}
                className={cn(
                  "state-layer flex w-full flex-col items-center gap-1.5 rounded-xl border border-border bg-secondary/40 p-2 text-center outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-100",
                  chosen && !single && "border-primary bg-primary/10",
                )}
              >
                <span className="block aspect-square w-full max-w-24">
                  <TileChip plan={plan} art={tileArt} className="size-full rounded-[3px] border-0" />
                </span>
                <span className="text-xs font-semibold">{tileName(plan)}</span>
                <RarityBadge rarity={rarityOf(plan)} />
                <span className="text-xs text-muted-foreground">
                  <span className="numeric">{held}</span> held
                </span>
              </button>
            </m.li>
          );
        })}
      </ul>
      <Button size="lg" className="w-full" disabled={picked === undefined} loading={busy} onClick={() => choice != null && onTake?.(choice)}>
        {picked === undefined ? "Choose a tile" : `Keep ${tileName(picked)}`}
      </Button>
    </section>
  );
}
