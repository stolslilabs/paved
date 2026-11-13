import { formatInteger, type ExpeditionProgress } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { HudFrame } from "../elements/hud-frame";
import { TileChip, type TileArt } from "../elements/tile-chip";
import { tileName } from "../elements/tile-render";
import { Icon } from "../ui/icon";
import { ScrollRegion } from "../ui/scroll-region";

/** A landmark's short name on the board's strip; its whole title is the pill's. */
const SHORT: Record<ExpeditionProgress["id"], string> = { crossroads: "Crossroads", ruin: "Ruin", villages: "Villages", landmark: "Landmark" };

export interface ExpeditionHandProps {
  /** The hand's tiles: each card (its name in a move) and its plan's chain id. */
  hand: readonly { card: number; plan: number }[];
  /** The card picked: the tile the board places. */
  selected: number | null;
  onSelect?: (card: number) => void;
  /** The cards still to come in the week's bag. */
  toCome: number;
  objectives: readonly ExpeditionProgress[];
  /** The week's map ("The Sacred Wood"), named over its landmarks. */
  map?: string;
  /** The tiles' images (`useTileArt`), as the board's stack shows them. */
  tileArt?: TileArt;
  /** The board takes no move (the week over, a refused move, a day not drawn yet): the tiles are shown, none is picked. */
  disabled?: boolean;
  className?: string;
}

/**
 * The Expedition board's strip, under its header (the weekly individual event): the map's four landmarks, each done or not, and the
 * whole hand, up to twelve tiles laid in any order. A tap picks the tile the board places (the stack then shows it); the row scrolls
 * sideways on a phone. On the HUD's frame, as the board's notices.
 */
export function ExpeditionHand({ hand, selected, onSelect, toCome, objectives, map, tileArt, disabled = false, className }: ExpeditionHandProps) {
  return (
    <div data-slot="expedition-hand" className={cn("relative isolate flex flex-col gap-1.5 px-2.5 py-2", className)}>
      <HudFrame px={13} />
      {map && <h2 className="text-outline text-sm leading-tight font-bold">{map}</h2>}
      <ul aria-label="Landmarks" className="flex flex-wrap gap-x-3 gap-y-0.5">
        {objectives.map((o) => (
          <li key={o.id} title={o.title} data-done={o.done || undefined} className={cn("flex items-center gap-1 text-xs font-bold", o.done ? "text-success" : "text-muted-foreground")}>
            <Icon name={o.done ? "check" : "flag"} size="xs" label={o.done ? "Done:" : "To do:"} />
            <span>{SHORT[o.id]}</span>
            {!o.done && o.count !== undefined && (
              <span className="numeric">
                {o.count}/{o.of}
              </span>
            )}
            <span className="numeric text-foreground/80">+{formatInteger(o.bonus)}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2">
        {hand.length === 0 ? (
          <p className="flex min-h-11 flex-1 items-center text-sm font-semibold text-muted-foreground">{toCome > 0 ? "The hand is empty: the next tiles come tomorrow." : "The hand is empty: the week's bag is drawn."}</p>
        ) : (
          <ScrollRegion orientation="horizontal" className="min-w-0 flex-1">
            <ul aria-label="Hand" className="flex w-max gap-1.5 p-0.5">
            {hand.map((tile, index) => (
              <li key={tile.card} className="shrink-0">
                <button
                  type="button"
                  disabled={disabled}
                  aria-pressed={tile.card === selected}
                  aria-label={`${tileName(tile.plan)}, tile ${index + 1} of ${hand.length}`}
                  onClick={() => onSelect?.(tile.card)}
                  className={cn(
                    "flex size-11 cursor-pointer items-center justify-center rounded-lg disabled:cursor-default",
                    tile.card === selected ? "ring-2 ring-primary" : "opacity-80",
                  )}
                >
                  <TileChip plan={tile.plan} art={tileArt} className="size-10" />
                </button>
              </li>
            ))}
            </ul>
          </ScrollRegion>
        )}
        <span className="flex shrink-0 flex-col items-end text-xs font-semibold text-muted-foreground">
          <span>
            <span className="numeric text-sm font-bold text-foreground">{hand.length}</span> in hand
          </span>
          <span>
            <span className="numeric text-sm font-bold text-foreground">{toCome}</span> to come
          </span>
        </span>
      </div>
    </div>
  );
}
