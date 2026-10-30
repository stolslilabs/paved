import { Suspense, memo, useEffect, useLayoutEffect, useRef, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import type { BoardTile } from "@paved/chain";
import type { CellAreas } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { usePressAction } from "../../lib/use-press-action";
import { TileChip, type TileArt } from "../elements/tile-chip";
import { tileName } from "../elements/tile-render";
import { Icon } from "../ui/icon";
import { ScrollRegion } from "../ui/scroll-region";
import { FogVeil, cellName } from "./village-board";
import type { BoardBubble, BoardPress } from "./board-viewport";
import { LazyPressBubble, loadPressBubble } from "./lazy-tile-bubble";
import { SIDES, cellKey, isStarter, type Cell, type Spot } from "./layout-rules";

/** The tile under the editor's bubble (#756), placed on its cell: drawn ringed, apart from the layout. */
export interface LayoutPending extends Cell {
  plan: number;
  orientation: number;
  /** Its id in the draft: the 3D scene draws it as a placed tile while a lit structure holds it (#758). */
  id?: number;
}

export interface LayoutBoardProps {
  /** The layout's tiles (the tile under the bubble, `pending`, is not among them). */
  tiles: readonly BoardTile[];
  /** The layout being edited: the placed tiles and the plates are buttons. Off: drawn, inert, under the fog. */
  editing?: boolean;
  /** The legal cells of the tile in hand, as the board's plates. */
  plates?: readonly Spot[];
  /** The tile under the bubble on its cell, ringed: a tap on it lets it go (`onPending`). */
  pending?: LayoutPending | null;
  /**
   * A structure lit (#758), its areas by cell: the plan view rings its tiles and dims the rest (the 3D scene lights its areas).
   * Null: no light.
   */
  lit?: readonly CellAreas[] | null;
  /** A tile that cannot be lifted (its removal would split the village): it shakes. */
  shaking?: number | null;
  tileArt?: TileArt;
  /**
   * Fit the plan to its box, below the 44 px touch floor if need be, so it never scrolls across: a view where no cell is tapped
   * (the home, #753). Off: every cell keeps the floor, and a plan wider than the box scrolls.
   */
  fit?: boolean;
  /**
   * In view, a long press on a tile (the starter included) opens this action (#799: the village's Edit), through a one-button
   * bubble standing by the tile, its ring filling as the press goes on, as on the 3D scene. Unset: the plan is inert in view.
   */
  press?: BoardPress | null;
  /** A placed tile chosen (never the starter): lift it into the hand. */
  onTile?: (tile: BoardTile) => void;
  /** A plate chosen: the tile in hand goes there. */
  onPlate?: (spot: Spot) => void;
  /** The tile under the bubble tapped: let go, it stays where it is. */
  onPending?: () => void;
  className?: string;
}

/**
 * What a drawing of the layout takes (the plan view here, the home's 3D scene, #753): the editor's state and its taps, and the
 * bubble the 3D scene stands by the tile (#756; the plan view's stands still in the editor's panel).
 */
export type LayoutBoardView = Required<Pick<LayoutBoardProps, "tiles" | "editing" | "plates" | "pending" | "shaking">> &
  Pick<LayoutBoardProps, "onTile" | "onPlate" | "onPending" | "lit" | "press"> & {
    bubble?: BoardBubble | null;
    /** The home's Camera mode (#875): the 3D village's camera free (the plan view has none). */
    camera?: boolean;
  };

/** A cell's least width with its gap: the 44 px touch floor and the grid's 2 px gap. */
const MIN_CELL = 46;

/** The empty rings around the tiles: room for the plates while editing, the fog's roll-off in the view. */
const RINGS = 2;

/** How far a press may move and stay a press, px (the renderer's click threshold): past it, it is a pan or a scroll. */
const PRESS_SLOP_PX = 5;


/**
 * The v2 village from above (#739): a free layout of tiles, no territory. In the view, the tiles under the fog, which lifts
 * around them as on every board. While editing, placing works as on the board: the tile in hand lights its legal cells
 * (plates, `data-cell`), a tap places it on one (ringed, under the bubble, #756), and a placed tile is a button that lifts
 * it into the hand. The starter wears its lock and is never a button.
 */
function LayoutBoardBase({ tiles, editing = false, plates = [], pending = null, lit = null, shaking = null, fit = false, tileArt, press = null, onTile, onPlate, onPending, className }: LayoutBoardProps) {
  const grid = useRef<HTMLDivElement>(null);
  // A board wider than the screen opens on its middle, where the village is: before its first paint, then after each paint
  // that changed its size, where the layout is read already (read in the commit, it forced one: a long task for a whole new
  // village, the die's, #803).
  const extent = tiles.length;
  const centred = useRef(false);
  const centre = () => {
    const el = grid.current?.parentElement;
    if (!el) return;
    el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
    el.scrollTop = (el.scrollHeight - el.clientHeight) / 2;
  };
  useLayoutEffect(() => {
    if (centred.current) return;
    centred.current = true;
    centre();
  }, []);
  useEffect(() => {
    // A task posted from the next frame runs once that frame is drawn: its layout is clean, the read costs nothing.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const frame = requestAnimationFrame(() => (timer = setTimeout(centre, 0)));
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [extent, editing]);

  const presses = usePlanPress(press, editing);

  const byCell = new Map(tiles.map((t) => [cellKey(t), t]));
  const plateAt = new Map(plates.map((p) => [cellKey(p), p]));
  const all: Cell[] = [...tiles, ...plates, ...(pending ? [pending] : [])];
  const xs = all.length ? all.map((t) => t.x) : [0];
  const ys = all.length ? all.map((t) => t.y) : [0];
  const minX = Math.min(...xs) - RINGS;
  const maxX = Math.max(...xs) + RINGS;
  const minY = Math.min(...ys) - RINGS;
  const maxY = Math.max(...ys) + RINGS;
  const cols = maxX - minX + 1;
  const rows = maxY - minY + 1;
  const at = (c: Cell) => ({ gridColumn: c.x - minX + 1, gridRow: maxY - c.y + 1 });
  const pendingKey = pending ? cellKey(pending) : null;
  // The lit structure's tiles (#758): ringed, the others dimmed.
  const litCells = lit ? new Set(lit.map(cellKey)) : null;
  const litClass = (key: string) => (litCells ? (litCells.has(key) ? "z-10 ring-2 ring-primary ring-offset-1 ring-offset-board" : "opacity-40") : undefined);
  // The fog's clear cells in the view: the tiles and the cells next to them, as on every board (#739).
  const clear: Cell[] = [];
  if (!editing) {
    const keys = new Set<string>();
    for (const t of tiles) for (const c of [{ x: t.x, y: t.y }, ...SIDES.map(([dx, dy]) => ({ x: t.x + dx, y: t.y + dy }))]) keys.add(cellKey(c));
    for (const k of keys) {
      const [x, y] = k.split(",").map(Number);
      clear.push({ x: x!, y: y! });
    }
  }

  const cells: ReactNode[] = [];
  for (let y = maxY; y >= minY; y--) {
    for (let x = minX; x <= maxX; x++) {
      const c = { x, y };
      const key = cellKey(c);
      const tile = byCell.get(key);
      if (tile) {
        const starter = isStarter(tile);
        const chip = <TileChip plan={tile.plan} orientation={tile.orientation} art={tileArt} className={cn("size-full rounded-[2px] border-0", editing && pending && "opacity-70")} />;
        const lock = starter && (
          <span aria-hidden className="absolute top-0.5 left-0.5 grid size-4 place-items-center rounded-sm bg-background/80 text-primary">
            <Icon name="lock" size="xs" />
          </span>
        );
        cells.push(
          editing && !starter ? (
            <button
              key={key}
              type="button"
              data-cell={key}
              data-kind="tile"
              data-tile={tile.id}
              data-lit={litCells?.has(key) || undefined}
              aria-label={`${tileName(tile.plan)} at ${cellName(c)}: lift it`}
              onClick={() => onTile?.(tile)}
              style={at(c)}
              className={cn("relative block min-h-0 min-w-0 rounded-[3px] outline-none focus-visible:ring-2 focus-visible:ring-ring", litClass(key), shaking === tile.id && "tile-shake ring-2 ring-warning")}
            >
              {chip}
            </button>
          ) : (
            <span
              key={key}
              data-cell={key}
              data-kind={starter ? "starter" : "tile"}
              data-lit={litCells?.has(key) || undefined}
              aria-label={starter && editing ? "The starter: it stays" : undefined}
              style={at(c)}
              className={cn("relative block min-h-0 min-w-0 rounded-[3px]", litClass(key))}
            >
              {chip}
              {lock}
            </span>
          ),
        );
        continue;
      }
      if (key === pendingKey && pending) {
        cells.push(
          <button
            key={key}
            type="button"
            data-cell={key}
            data-kind="pending"
            aria-label={`${tileName(pending.plan)} at ${cellName(c)}: let it go`}
            aria-pressed
            data-lit={litCells?.has(key) || undefined}
            onClick={onPending}
            style={at(c)}
            className="relative z-10 block min-h-0 min-w-0 rounded-[3px] ring-2 ring-primary ring-offset-2 ring-offset-board outline-none focus-visible:ring-ring"
          >
            <TileChip plan={pending.plan} orientation={pending.orientation} art={tileArt} className="size-full rounded-[2px] border-0" />
          </button>,
        );
        continue;
      }
      const plate = editing ? plateAt.get(key) : undefined;
      if (plate) {
        cells.push(
          <button
            key={key}
            type="button"
            data-cell={key}
            data-kind="plate"
            aria-label={`Place it at ${cellName(c)}`}
            onClick={() => onPlate?.(plate)}
            style={at(c)}
            className="state-layer relative block min-h-0 min-w-0 rounded-[3px] border border-primary/60 bg-plate/55 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />,
        );
        continue;
      }
      cells.push(<span key={key} aria-hidden style={at(c)} className={cn("block min-h-0 min-w-0 rounded-[3px]", editing ? "border border-dashed border-input/40" : "bg-secondary/20")} />);
    }
  }

  return (
    // `safe center`: a board wider than the screen scrolls from its edge, not from a centre cut off on both sides.
    <ScrollRegion orientation="both" className={cn("grid size-full bg-board p-4", className)} style={{ placeItems: "safe center" }}>
      <div
        ref={grid}
        role={editing || presses.shown ? "group" : "img"}
        aria-label={`Village layout of ${tiles.length} ${tiles.length === 1 ? "tile" : "tiles"}`}
        className={cn("relative grid shrink-0 gap-0.5", press && !editing && "select-none [-webkit-touch-callout:none]")}
        style={{
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridTemplateRows: `repeat(${rows}, 1fr)`,
          aspectRatio: `${cols} / ${rows}`,
          // Every cell keeps the 44 px touch floor: past what the screen holds, the board scrolls.
          width: fit ? "min(100%, 70dvh)" : `max(${cols * MIN_CELL}px, min(100%, 70dvh))`,
        }}
        {...presses.handlers}
      >
        {cells}
        {press && presses.shown && (
          // Standing still by the pressed tile, above its top-right corner.
          <div style={at(presses.shown.cell)} className="pointer-events-none relative z-30 min-h-0 min-w-0">
            <Suspense fallback={null}>
              <LazyPressBubble
                label={press.label}
                icon={press.icon}
                hold={presses.hold}
                phase={presses.shown.phase}
                onTap={presses.act}
                onDismiss={presses.dismiss}
              />
            </Suspense>
          </div>
        )}
        {!editing && <FogVeil clear={clear} minX={minX} maxY={maxY} cols={cols} rows={rows} />}
      </div>
    </ScrollRegion>
  );
}

/**
 * The plan view's presses in view (#799), from its pointer events: a press down on a tile's cell (`data-cell`, the starter
 * included) is the press's `down`; a move past `PRESS_SLOP_PX`, a second pointer, the pointer leaving or a browser cancel drops
 * it; the let go releases it. The press's hold (`usePressAction`) does the rest. Off in edit mode, or without an action.
 */
function usePlanPress(press: BoardPress | null, editing: boolean) {
  const enabled = !!press && !editing;
  const action = usePressAction<Cell>({ onAct: () => press?.onAct(), enabled, holdMs: press?.holdMs });
  useEffect(() => {
    if (enabled) void loadPressBubble().catch(() => {});
  }, [enabled]);
  const down = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const end = (how: "release" | "cancel") => {
    if (!down.current) return;
    down.current = null;
    if (how === "release") action.release();
    else action.cancel();
  };
  const handlers = enabled
    ? {
        onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
          if (down.current && down.current.pointerId !== e.pointerId) return end("cancel");
          if (e.button > 0) return;
          const cell = (e.target as HTMLElement).closest<HTMLElement>("[data-kind=tile], [data-kind=starter]")?.dataset.cell;
          if (!cell) return;
          const [x, y] = cell.split(",").map(Number);
          down.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
          action.down({ x: x!, y: y! });
        },
        onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
          const d = down.current;
          if (d && d.pointerId === e.pointerId && Math.hypot(e.clientX - d.x, e.clientY - d.y) > PRESS_SLOP_PX) end("cancel");
        },
        onPointerUp: (e: PointerEvent<HTMLDivElement>) => down.current?.pointerId === e.pointerId && end("release"),
        onPointerCancel: () => end("cancel"),
        onPointerLeave: () => end("cancel"),
        // A long press on a tile shows the bubble: no context menu comes with it (nor a text selection, a loupe or an iOS callout).
        onContextMenu: (e: MouseEvent<HTMLDivElement>) => e.preventDefault(),
      }
    : {};
  return { ...action, handlers };
}

/** The board, drawn again only when its props change: the editor's other changes (the die pressed, the hint, the panel) leave it. */
export const LayoutBoard = memo(LayoutBoardBase);
