import { useState } from "react";
import { COLOSSUS_DISTRICT, formatInteger } from "@paved/game-core";
import type { ColossusBoardState, ColossusOptions, ColossusPlace } from "../../data/colossus-source";
import { cn } from "../../lib/utils";
import { GOLD_ACTION, GoldShine } from "../elements/gold-action";
import { TileChip, type TileArt } from "../elements/tile-chip";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";

export interface ColossusBoardProps {
  board: ColossusBoardState;
  /** The day of the week, 0 Monday to 6 Sunday: a tile of the day before leaves the hand tonight. */
  day: number;
  /** The card picked in the hand; null: none. */
  selected: number | null;
  onSelect?: (card: number) => void;
  /** Where the picked card may go; null while it is read (or with no card picked). */
  options: ColossusOptions | null;
  /** The tile on its way: the board waits. */
  busy?: boolean;
  onPlace?: (tile: ColossusPlace) => void;
  /** The tiles' images (`useTileArt`). */
  tileArt?: TileArt;
  className?: string;
}

/** The heart's four quarters, a district's size each: the board shows one at a time, so a cell stays a finger wide on a phone. */
const QUARTERS = ["North-west", "North-east", "South-west", "South-east"] as const;

const cellName = (x: number, y: number, size: number): string => `row ${size - y}, column ${x + 1}`;

/**
 * One board of the Colossus (the weekly collective event): a district's 8 by 8 cells inside its wall, or a quarter of the heart's 16
 * by 16. Pre-built tiles and builders' tiles, dimmed until a closed structure sets them as stones; the holes; the sealed holes, walls
 * now. Under it the viewer's hand: a tap picks a tile, the board then marks each hole it may take with the stones it would set, and
 * the holes fair play refuses. A tap on a marked hole shows the tile there (again: its next turn), and Place lays it.
 */
export function ColossusBoard({ board, day, selected, onSelect, options, busy = false, onPlace, tileArt, className }: ColossusBoardProps) {
  const [quarter, setQuarter] = useState(0);
  // The cell picked, with the place of its turn among those legal there; dropped when the card or its options change.
  const [pick, setPick] = useState<{ card: number | null; x: number; y: number; turn: number } | null>(null);
  const view = COLOSSUS_DISTRICT;
  const x0 = board.size > view && quarter % 2 === 1 ? view : 0;
  const y0 = board.size > view && quarter < 2 ? view : 0;
  const plan = board.hand.find((c) => c.card === selected)?.plan ?? null;
  const tiles = new Map(board.tiles.map((t) => [`${t.x},${t.y}`, t]));
  const sealed = new Set(board.sealed.map((s) => `${s.x},${s.y}`));
  const refused = new Set((options?.refused ?? []).map((r) => `${r.x},${r.y}`));
  const legal = new Map<string, ColossusOptions["placements"]>();
  for (const p of options?.placements ?? []) legal.set(`${p.x},${p.y}`, [...(legal.get(`${p.x},${p.y}`) ?? []), p]);
  const turns = pick && pick.card === selected ? (legal.get(`${pick.x},${pick.y}`) ?? []) : [];
  const chosen = turns.length ? turns[pick!.turn % turns.length]! : null;
  const cells: { x: number; y: number }[] = [];
  for (let y = y0 + view - 1; y >= y0; y--) for (let x = x0; x < x0 + view; x++) cells.push({ x, y });
  const here = (options?.placements ?? []).some((p) => p.x >= x0 && p.x < x0 + view && p.y >= y0 && p.y < y0 + view);
  return (
    <div data-slot="colossus-board" className={cn("flex flex-col gap-3", className)}>
      {board.size > view && (
        <div role="group" aria-label="Quarter of the heart" className="grid grid-cols-2 gap-1.5">
          {QUARTERS.map((name, i) => (
            <Button key={name} size="sm" variant={i === quarter ? "default" : "secondary"} aria-pressed={i === quarter} onClick={() => setQuarter(i)}>
              {name}
            </Button>
          ))}
        </div>
      )}
      <div role="grid" aria-label={board.heart ? `The heart, ${QUARTERS[quarter]!.toLowerCase()} quarter` : `District ${board.name}`} className="drawer-carved grid grid-cols-8 gap-px overflow-hidden rounded-xl p-1">
        {cells.map(({ x, y }) => {
          const key = `${x},${y}`;
          const tile = tiles.get(key);
          const fits = legal.get(key);
          const name = cellName(x, y, board.size);
          if (tile)
            return (
              <span key={key} role="gridcell" aria-label={`${name}: ${tile.mine ? "your tile" : tile.prebuilt ? "a pre-built tile" : "a builder's tile"}${tile.stone ? ", a stone" : ""}`} data-stone={tile.stone || undefined} data-mine={tile.mine || undefined} className="relative aspect-square">
                <TileChip plan={tile.plan} orientation={tile.orientation} art={tileArt} className={cn("size-full rounded-sm border-0", !tile.stone && "opacity-55")} />
                {tile.mine && <span aria-hidden className="pointer-events-none absolute inset-0 rounded-sm border-2 border-info" />}
              </span>
            );
          if (sealed.has(key))
            return (
              <span key={key} role="gridcell" aria-label={`${name}: sealed, a wall`} data-sealed className="flex aspect-square items-center justify-center rounded-sm bg-muted text-muted-foreground">
                <Icon name="lock" size="xs" />
              </span>
            );
          if (fits && plan !== null) {
            const picked = chosen !== null && pick!.x === x && pick!.y === y;
            const most = Math.max(...fits.map((o) => o.stones));
            return (
              <button
                key={key}
                type="button"
                role="gridcell"
                disabled={busy}
                aria-pressed={picked}
                aria-label={`${name}: ${picked ? `your tile here sets ${formatInteger(chosen.stones)} stones` : most > 0 ? `sets up to ${formatInteger(most)} stones` : "fits, no stone yet"}`}
                data-option
                onClick={() => setPick(picked && pick ? { ...pick, turn: pick.turn + 1 } : { card: selected, x, y, turn: 0 })}
                className={cn("relative flex aspect-square cursor-pointer items-center justify-center rounded-sm border-2 border-dashed border-primary bg-primary/15 disabled:cursor-default", picked && "border-solid")}
              >
                {picked ? <TileChip plan={plan} orientation={chosen.orientation} art={tileArt} className="size-full rounded-none border-0" /> : most > 0 ? <span className="numeric text-outline text-xs font-bold text-primary">+{formatInteger(most)}</span> : null}
              </button>
            );
          }
          if (refused.has(key) && plan !== null)
            return (
              <span key={key} role="gridcell" aria-label={`${name}: refused, it would leave a hole no tile fits`} title="Refused: it would leave a hole no tile fits" data-refused className="flex aspect-square items-center justify-center rounded-sm border-2 border-warning/70 text-warning">
                <Icon name="ban" size="xs" />
              </span>
            );
          return <span key={key} role="gridcell" aria-label={`${name}: a hole`} data-hole className="aspect-square rounded-sm bg-background/70" />;
        })}
      </div>

      <div className="flex items-center gap-2">
        {board.hand.length === 0 ? (
          <p className="flex min-h-11 flex-1 items-center text-sm font-semibold text-muted-foreground">Your hand is empty: three new tiles come at 00:00 UTC.</p>
        ) : (
          <ul aria-label="Hand" className="flex min-w-0 flex-1 flex-wrap gap-1.5">
            {board.hand.map((tile, index) => (
              <li key={tile.card}>
                <button
                  type="button"
                  disabled={busy || !board.open}
                  aria-pressed={tile.card === selected}
                  aria-label={`Tile ${index + 1} of ${board.hand.length}${tile.day < day ? ", leaves tonight" : ""}`}
                  onClick={() => onSelect?.(tile.card)}
                  className={cn("relative flex size-11 cursor-pointer items-center justify-center rounded-lg disabled:cursor-default", tile.card === selected ? "ring-2 ring-primary" : "opacity-80")}
                >
                  <TileChip plan={tile.plan} art={tileArt} className="size-10" />
                  {tile.day < day && <span aria-hidden className="absolute -top-1 -right-1 size-2.5 rounded-full border border-background bg-warning" />}
                </button>
              </li>
            ))}
          </ul>
        )}
        <span className="flex shrink-0 flex-col items-end text-xs font-semibold text-muted-foreground">
          <span>
            <span className="numeric text-sm font-bold text-foreground">{board.hand.length}</span> in hand
          </span>
          <span>
            <span className="numeric text-sm font-bold text-foreground">{formatInteger(board.holes)}</span> holes
          </span>
        </span>
      </div>

      <div data-slot="colossus-action" className="flex min-h-12 items-center gap-2">
        {!board.open ? (
          <p className="flex-1 text-sm font-semibold text-muted-foreground">{board.heart && board.holes > 0 ? "The heart opens when the gauge reaches 50%." : "This board takes no more tile."}</p>
        ) : chosen && plan !== null ? (
          <>
            {turns.length > 1 && (
              <Button variant="secondary" className="h-12" disabled={busy} onClick={() => setPick({ ...pick!, turn: pick!.turn + 1 })}>
                <Icon name="rotate-right" size="sm" /> Turn
              </Button>
            )}
            <Button
              variant="ghost"
              style={GOLD_ACTION}
              className="relative h-12 min-w-0 flex-1 px-2 text-lg font-black text-foreground"
              disabled={busy}
              aria-busy={busy || undefined}
              onClick={() => onPlace?.({ card: selected!, board: board.board, x: chosen.x, y: chosen.y, orientation: chosen.orientation })}
            >
              {!busy && <GoldShine />}
              Place{chosen.stones > 0 && <span className="numeric">· +{formatInteger(chosen.stones)}</span>}
            </Button>
          </>
        ) : (
          <p className="flex-1 text-sm font-semibold text-muted-foreground">
            {board.hand.length === 0
              ? "Come back tomorrow."
              : plan === null
                ? "Pick a tile of your hand."
                : options === null
                  ? "Looking where it fits…"
                  : options.placements.length === 0
                    ? "This tile fits nowhere on this board."
                    : here
                      ? "Tap a marked hole: the figure is the stones the tile would set."
                      : "It fits in another quarter of the heart."}
          </p>
        )}
      </div>
    </div>
  );
}
