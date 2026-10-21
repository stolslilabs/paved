import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { cn } from "../../lib/utils";
import { Cobbles } from "../elements/cobbles";
import { Score } from "../elements/score";
import { TileChip, type TileArt } from "../elements/tile-chip";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { ParcelSheet, type ParcelOffer } from "../containers/parcel-sheet";
import { RewardSheet, type RewardOffer } from "../containers/reward-sheet";
import { TiersSheet } from "../containers/tiers-sheet";
import { TopBar } from "../containers/top-bar";
import { VillageBoard, type VillageBoardProps, type VillageFog, type VillagePlacing } from "../containers/village-board";
import { MAX_CELLS, copyTargets, dropOrientation, legalCells, type Cell, type Village } from "../containers/village-rules";

/** A reward's tile placed on a free cell: the chain's write once wired (#642). */
export interface VillagePlace {
  plan: number;
  x: number;
  y: number;
  orientation: number;
}

/** A reward's tile added as a copy to a placed tile of its plan. */
export interface VillageCopy {
  plan: number;
  tileId: number;
}

export interface VillageSceneProps {
  village: Village;
  /** The player's own village (rewards, parcels), or someone else's, read-only. */
  mode?: "own" | "visit";
  /** A visit: from the PvP scout (#647) or from a player's profile. */
  from?: "scout" | "profile";
  /** The player's Cobbles (own village). */
  cobbles?: number;
  /** A reward waiting (after a game): its sheet shows under the board. */
  reward?: RewardOffer | null;
  /** The next parcel's price and level gate; null: none (the village is full). */
  parcel?: ParcelOffer | null;
  /** The plan's fog (#633's village variant), when the plan is drawn. */
  fog?: VillageFog;
  /**
   * The board, given by the page: the 3D village with the fog of war (`VillageViewport`, #648), from the board's props the scene
   * computes. Unset: the plan (`VillageBoard`), which is also the fallback without WebGL.
   */
  renderBoard?: (board: VillageBoardProps) => ReactNode;
  /** The board's tile art (`useTileArt`); the plans' areas without it. */
  tileArt?: TileArt;
  /** A write on its way: the reward's and the parcel's controls wait. */
  busy?: boolean;
  /** Where the stories start: a reward's tile chosen, a parcel's sheet open, the tiers open. */
  initialSelected?: number | null;
  initialParcel?: Cell | null;
  initialTiers?: boolean;
  onBack?: () => void;
  onPlace?: (place: VillagePlace) => void;
  onAddCopy?: (copy: VillageCopy) => void;
  onTakeCobbles?: () => void;
  onBuyParcel?: (cell: Cell) => void;
  onGetCobbles?: () => void;
  onOpenSkins?: () => void;
}

/** What is under the pointer while a reward's tile is dragged: a board cell (`data-cell`), or nothing. */
function cellUnder(x: number, y: number): (Cell & { kind: string }) | null {
  const el = document.elementFromPoint?.(x, y)?.closest<HTMLElement>("[data-cell]");
  if (!el) return null;
  const [cx, cy] = (el.dataset.cell ?? "").split(",").map(Number);
  return { x: cx!, y: cy!, kind: el.dataset.kind ?? "" };
}

/** A press becomes a drag past this many pixels (the sheets' slop); under it, it is a tap that chooses the tile. */
const DRAG_SLOP = 6;

/**
 * The village (#646, part of #637): the player's metagame and calling card. The board (owned cells, the parcels around them,
 * the fog beyond), the village's score, the player's level and Cobbles. After a game a reward waits under the board: drag one of
 * its three tiles to a lit cell, or onto a ringed tile of its plan to add a copy, or take Cobbles. A tap on a plus opens the
 * parcel's sheet (price, level gate); Tiers opens the ladder and each plan's progress. A visit (from the PvP scout or a
 * profile) shows someone else's village read-only. Data and writes come as props and callbacks: nothing is wired yet
 * (#640, #642).
 */
export function VillageScene({
  village,
  mode = "own",
  from = "profile",
  cobbles = 0,
  reward = null,
  parcel = null,
  fog = "village",
  renderBoard,
  tileArt,
  busy,
  initialSelected = null,
  initialParcel = null,
  initialTiers = false,
  onBack,
  onPlace,
  onAddCopy,
  onTakeCobbles,
  onBuyParcel,
  onGetCobbles,
  onOpenSkins,
}: VillageSceneProps) {
  const own = mode === "own";
  const [selected, setSelected] = useState<number | null>(initialSelected);
  const [orientation, setOrientation] = useState(1);
  const [chosenParcel, setChosenParcel] = useState<Cell | null>(initialParcel);
  const [tiers, setTiers] = useState(initialTiers);
  const [drag, setDrag] = useState<{ index: number; x: number; y: number; over: Cell | null } | null>(null);
  const press = useRef<{ index: number; x: number; y: number; moved: boolean; source: HTMLElement } | null>(null);
  const tapAfterDrag = useRef(false);
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);

  // A new reward (or none) clears the choice.
  useEffect(() => {
    setSelected(initialSelected);
    setOrientation(1);
  }, [reward, initialSelected]);

  const offer = own ? reward : null;
  // A parcel bought joins the village: its sheet closes.
  const openParcel = chosenParcel && !village.cells.some((c) => c.x === chosenParcel.x && c.y === chosenParcel.y) ? chosenParcel : null;
  const activeIndex = drag?.index ?? selected;
  const activePlan = offer && activeIndex != null ? (offer.plans[activeIndex] ?? null) : null;
  const placing: VillagePlacing | null =
    activePlan != null
      ? { plan: activePlan, orientation, legal: legalCells(village, activePlan), copies: copyTargets(village, activePlan).map((t) => t.id) }
      : null;

  const place = (plan: number, cell: Cell) => {
    const o = dropOrientation(village, plan, orientation, cell);
    if (o == null || busy) return;
    onPlace?.({ plan, x: cell.x, y: cell.y, orientation: o });
    setSelected(null);
  };
  const copy = (plan: number, tileId: number) => {
    if (busy) return;
    onAddCopy?.({ plan, tileId });
    setSelected(null);
  };
  const drop = (index: number, target: (Cell & { kind: string }) | null) => {
    const plan = offer?.plans[index];
    if (plan == null || !target) return;
    if (target.kind === "legal") place(plan, target);
    else if (target.kind === "copy") {
      const tile = village.tiles.find((t) => t.x === target.x && t.y === target.y && t.plan === plan);
      if (tile) copy(plan, tile.id);
    }
  };

  const startDrag = (index: number, e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    stop.current?.();
    press.current = { index, x: e.clientX, y: e.clientY, moved: false, source: e.currentTarget };
    const move = (ev: PointerEvent) => {
      const p = press.current;
      if (!p) return;
      if (!p.moved && Math.hypot(ev.clientX - p.x, ev.clientY - p.y) < DRAG_SLOP) return;
      p.moved = true;
      const over = cellUnder(ev.clientX, ev.clientY);
      setDrag({ index: p.index, x: ev.clientX, y: ev.clientY, over: over && (over.kind === "legal" || over.kind === "copy") ? over : null });
    };
    const end = (ev: PointerEvent, dropped: boolean) => {
      const p = press.current;
      press.current = null;
      stop.current?.();
      if (!p?.moved) return;
      // Only a release over its own card is followed by a click on it: that click is the drag's end, not a tap. Released
      // anywhere else, no click comes, and the next tap must count. The timer drops the flag once the click had its chance.
      const target = document.elementFromPoint?.(ev.clientX, ev.clientY);
      if (target && p.source.contains(target)) {
        tapAfterDrag.current = true;
        setTimeout(() => (tapAfterDrag.current = false), 0);
      }
      setDrag(null);
      if (dropped) drop(p.index, cellUnder(ev.clientX, ev.clientY));
    };
    const up = (ev: PointerEvent) => end(ev, true);
    const cancel = (ev: PointerEvent) => end(ev, false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    stop.current = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      stop.current = null;
    };
  };

  const select = (index: number | null) => {
    // The click that ends a drag on its own card is not a tap.
    if (tapAfterDrag.current) {
      tapAfterDrag.current = false;
      return;
    }
    setSelected(index);
    setOrientation(1);
  };

  const title = own ? "My village" : `${village.owner}'s village`;
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <TopBar
        title={title}
        onBack={onBack}
        className="mb-0"
        end={
          own ? (
            <span className="pr-2">
              <Cobbles value={cobbles} />
            </span>
          ) : undefined
        }
      />
      <div className="flex min-h-0 flex-1 flex-col desktop:flex-row desktop:gap-4 desktop:p-4">
        <div className="flex min-h-0 flex-1 flex-col desktop:overflow-hidden desktop:rounded-2xl desktop:border desktop:border-border">
          <div className="flex items-end justify-between gap-3 border-b border-border px-4 py-2">
            <Score value={village.score} label="Village score" size="sm" className="shrink-0" />
            <div className="flex flex-wrap items-center justify-end gap-2">
              {!own && (
                <Badge variant="outline">
                  <Icon name={from === "scout" ? "binoculars" : "user"} size="xs" />
                  {from === "scout" ? "Scouting" : "Visiting"}
                </Badge>
              )}
              <Badge variant="secondary" aria-label={`Level ${village.level}`}>
                Lv <span className="numeric">{village.level}</span>
              </Badge>
              <Badge variant="secondary" aria-label={`${village.cells.length} of ${MAX_CELLS} cells`}>
                <span className="numeric">
                  {village.cells.length}/{MAX_CELLS}
                </span>
              </Badge>
              <Button variant="outline" size="sm" onClick={() => setTiers(true)}>
                <Icon name="layer-group" size="xs" /> Tiers
              </Button>
            </div>
          </div>
          {(renderBoard ?? ((props: VillageBoardProps) => <VillageBoard {...props} />))({
            village,
            fog,
            parcels: own && !offer,
            parcel: openParcel,
            placing,
            over: drag?.over ?? null,
            tileArt,
            onParcel: setChosenParcel,
            onPlace: (cell) => activePlan != null && place(activePlan, cell),
            onCopy: (tile) => activePlan != null && copy(activePlan, tile.id),
            className: "min-h-0 flex-1",
          })}
          {own && !offer && (
            <p className="border-t border-border px-4 py-2 text-center text-xs text-muted-foreground">
              {parcel ? "Tap a plus to buy the parcel next to your village." : "Your village is full."}
            </p>
          )}
          {!own && <p className="border-t border-border px-4 py-2 text-center text-xs text-muted-foreground">Read-only: the tiles stay as their owner placed them.</p>}
        </div>
        {offer && (
          <RewardSheet
            offer={offer}
            village={village}
            selected={selected}
            orientation={orientation}
            dragging={drag?.index ?? null}
            busy={busy}
            tileArt={tileArt}
            onSelect={select}
            onRotate={() => setOrientation((o) => (o % 4) + 1)}
            onTakeCobbles={onTakeCobbles}
            onDragStart={startDrag}
            className="shrink-0 desktop:w-96 desktop:self-start"
          />
        )}
      </div>
      {drag && offer && (
        <span aria-hidden className="pointer-events-none fixed z-50 size-16 -translate-x-1/2 -translate-y-1/2 drop-shadow-lg" style={{ left: drag.x, top: drag.y }}>
          <TileChip plan={offer.plans[drag.index] ?? 0} orientation={orientation} art={tileArt} className={cn("size-full border-primary", drag.over && "opacity-60")} />
        </span>
      )}
      {own && (
        <ParcelSheet
          cell={openParcel}
          offer={parcel}
          level={village.level}
          cobbles={cobbles}
          cells={village.cells.length}
          buying={busy}
          onBuy={onBuyParcel}
          onClose={() => setChosenParcel(null)}
          onGetCobbles={onGetCobbles}
        />
      )}
      <TiersSheet open={tiers} onOpenChange={setTiers} copies={village.copies} tileArt={tileArt} onOpenSkins={own ? onOpenSkins : undefined} />
    </div>
  );
}
