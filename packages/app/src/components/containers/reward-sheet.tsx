import type { PointerEvent as ReactPointerEvent } from "react";
import { cn } from "../../lib/utils";
import { Cobbles } from "../elements/cobbles";
import { TileChip, type TileArt } from "../elements/tile-chip";
import { tileName } from "../elements/tile-render";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { legalCells, type Village } from "./village-rules";

/** A village reward (#642): three tiles to choose from (choosing one is placing it, no tile is held), or Cobbles instead. */
export interface RewardOffer {
  plans: readonly number[];
  /** The Cobbles taken instead of a tile: the option is always there. */
  cobbles: number;
}

/** What a reward's tile can do in this village: go on some free cells, or none. */
export interface RewardChoice {
  plan: number;
  cells: number;
  /** No free cell fits it: greyed out. */
  stuck: boolean;
}

export function rewardChoices(offer: RewardOffer, village: Pick<Village, "cells" | "tiles">): RewardChoice[] {
  return offer.plans.map((plan) => {
    const cells = legalCells(village, plan).length;
    return { plan, cells, stuck: cells === 0 };
  });
}

export interface RewardSheetProps {
  offer: RewardOffer;
  village: Pick<Village, "cells" | "tiles">;
  /** The tile chosen (its index in the offer): the board lights its cells. */
  selected?: number | null;
  /** The chosen tile's orientation, 1 north to 4 west. */
  orientation?: number;
  /** The tile being dragged: its card stays in place, dimmed. */
  dragging?: number | null;
  /** A choice on its way (the chain's write, once wired): every control waits. */
  busy?: boolean;
  tileArt?: TileArt;
  onSelect?: (index: number | null) => void;
  onRotate?: () => void;
  onTakeCobbles?: () => void;
  /** A press on a tile's card: the scene starts a drag from it once the pointer moves. */
  onDragStart?: (index: number, event: ReactPointerEvent<HTMLButtonElement>) => void;
  className?: string;
}

/** The line under a reward's tile: where it can go, or why it cannot. */
function choiceNote(choice: RewardChoice): string {
  if (choice.stuck) return "No free cell fits";
  return `Fits ${choice.cells} ${choice.cells === 1 ? "cell" : "cells"}`;
}

/**
 * The reward's sheet (#646): three tiles. Drag a tile to a lit cell to place it; a tap chooses it and the board's buttons do the
 * same. A tile that fits no free cell is greyed out. "Take N Cobbles" is always there (the copies and the tiers left with v2,
 * #739). Docked
 * under the board on a phone, beside it from `desktop` up; not a modal, so the board stays a drop target.
 */
export function RewardSheet({ offer, village, selected = null, orientation = 1, dragging = null, busy, tileArt, onSelect, onRotate, onTakeCobbles, onDragStart, className }: RewardSheetProps) {
  const choices = rewardChoices(offer, village);
  return (
    <section aria-labelledby="reward-title" className={cn("flex flex-col gap-3 rounded-t-2xl border-t border-border bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))] desktop:rounded-2xl desktop:border", className)}>
      <header className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h2 id="reward-title" className="font-display text-lg">
            Reward
          </h2>
          <p className="text-xs text-muted-foreground">Drag a tile onto a lit cell of your village.</p>
        </div>
        {selected != null && (
          <Button size="icon" variant="outline" aria-label="Rotate the tile" onClick={onRotate} disabled={busy}>
            <Icon name="rotate-right" size="sm" />
          </Button>
        )}
      </header>
      <ul aria-label="Reward tiles" className="grid grid-cols-3 gap-2">
        {choices.map((choice, i) => {
          const chosen = selected === i;
          return (
            <li key={`${choice.plan}-${i}`} className="min-w-0">
              <button
                type="button"
                aria-pressed={chosen}
                aria-label={`${tileName(choice.plan)}: ${choiceNote(choice)}`}
                disabled={choice.stuck || busy}
                data-stuck={choice.stuck || undefined}
                onClick={() => onSelect?.(chosen ? null : i)}
                onPointerDown={(e) => !choice.stuck && !busy && onDragStart?.(i, e)}
                className={cn(
                  "state-layer flex w-full touch-none flex-col items-center gap-1.5 rounded-xl border border-border bg-secondary/40 p-2 text-center outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  chosen && "border-primary bg-primary/10",
                  dragging === i && "opacity-40",
                  choice.stuck && "opacity-40 grayscale",
                )}
              >
                <span className="block aspect-square w-full max-w-24">
                  <TileChip plan={choice.plan} orientation={chosen ? orientation : 1} art={tileArt} className="size-full rounded-[3px] border-0" />
                </span>
                <span className="text-xs font-semibold">{tileName(choice.plan)}</span>
                <span className={cn("text-xs", choice.stuck ? "text-muted-foreground" : "text-foreground")}>{choiceNote(choice)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <Button variant="outline" className="w-full" onClick={onTakeCobbles} disabled={busy} loading={busy} aria-label={`Take ${offer.cobbles} Cobbles instead`}>
        Take <Cobbles value={offer.cobbles} size="sm" /> instead
      </Button>
    </section>
  );
}
