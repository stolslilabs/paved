import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { BoardTile } from "@paved/chain";
import { formatInteger } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { Cobbles } from "../elements/cobbles";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { Notice } from "../elements/notice";
import { Score } from "../elements/score";
import { TileChip, type TileArt } from "../elements/tile-chip";
import { tileName } from "../elements/tile-render";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Skeleton } from "../ui/skeleton";
import { InventoryTray } from "../containers/inventory-tray";
import { LayoutBoard } from "../containers/layout-board";
import {
  checkLayout,
  isStarter,
  layoutProblem,
  moveTile,
  placeTile,
  rotateTile,
  sameLayout,
  slotsFor,
  takeOffTile,
  trayOf,
  type Cell,
  type Inventory,
  type VillageLayout,
} from "../containers/layout-rules";
import { SkinsStatusView, type SkinsStatus } from "../containers/skins-status";
import { TopBar } from "../containers/top-bar";

/** Why the village is not shown: a guest (Connect), the reads on their way, a failed read (Retry). */
export type VillageLayoutStatus = SkinsStatus;

/** A layout saved: the score it gives, against the one before. */
export interface LayoutSaved {
  score: number;
  previous: number;
}

export interface VillageLayoutSceneProps {
  /** The village; omitted, `status` says why. */
  village?: VillageLayout;
  status?: VillageLayoutStatus | null;
  /** The collected tiles off the saved layout, per plan (own village). */
  inventory?: Inventory;
  /** The player's own village (edit, chests, shop), or someone else's, read-only. */
  mode?: "own" | "visit";
  /** The player's Cobbles (own village). */
  cobbles?: number;
  /** The chests waiting to be opened (own village): a count on Chests. */
  chests?: number;
  /** The save on its way: the editor waits. */
  saving?: boolean;
  /** The last save landed: the new score, until dismissed. The editor closes. */
  saved?: LayoutSaved | null;
  /** The save's refusal, until dismissed. */
  refusal?: string | null;
  refusalDetail?: ErrorDetail;
  tileArt?: TileArt;
  /** Where the stories start: the editor open on this draft (the saved layout when unset), a tile chosen, a plan held. */
  initialEditing?: boolean;
  initialDraft?: readonly BoardTile[];
  initialSelected?: number | null;
  initialHeld?: number | null;
  onBack?: () => void;
  onConnect?: () => void;
  onRetry?: () => void;
  /** Save the draft: a valid, connected layout that holds the starter, within the slots. */
  onSave?: (tiles: readonly BoardTile[]) => void;
  onDismissSaved?: () => void;
  onDismissRefusal?: () => void;
  onOpenChests?: () => void;
  onOpenShop?: () => void;
}

/** A press becomes a drag past this many pixels (the sheets' slop); under it, it is a tap. */
const DRAG_SLOP = 6;

/** What a drag carries: a plan from the tray, or a placed tile. */
type DragSource = { kind: "plan"; plan: number } | { kind: "tile"; id: number };
type DropTarget = { kind: "cell"; cell: Cell } | { kind: "tray" } | null;

/** What is under the pointer while dragging: a board cell (`data-cell`), the tray (`data-tray`), or nothing. */
function targetAt(x: number, y: number): DropTarget {
  const under = document.elementFromPoint?.(x, y);
  if (under?.closest("[data-tray]")) return { kind: "tray" };
  const el = under?.closest<HTMLElement>("[data-cell]");
  if (!el) return null;
  const [cx, cy] = (el.dataset.cell ?? "").split(",").map(Number);
  return { kind: "cell", cell: { x: cx!, y: cy! } };
}

/**
 * The v2 village (#739, part of #732): a free layout of the player's collected tiles, rearranged at any time, capped by the
 * slots unlocked (8 + level). The view shows the layout under the fog, which lifts around its tiles, the score, the level
 * and the slots used ("21 / 28"), and leads to the chests and the shop. Edit opens the editor: drag a tile from the inventory
 * onto the board (or tap it, then a cell), drag a placed tile to move it (onto another, they swap) or back onto the inventory
 * to take it off; a tap on a placed tile chooses it, to turn or take off. Any state is allowed while editing: the faulty edges
 * are marked, the tiles cut off from the starter outlined, and Save waits for a valid, connected layout with the starter (it
 * stays at the centre). Saving shows the new score. A visit shows someone else's village read-only. Data and the save come
 * as props and callbacks: the page wires them to the v2 contracts (#733) in a later task.
 */
export function VillageLayoutScene({ village, status, mode = "own", onBack, onConnect, onRetry, ...props }: VillageLayoutSceneProps) {
  if (village) return <LayoutView village={village} mode={mode} onBack={onBack} {...props} />;
  const own = mode === "own";
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <TopBar title={own ? "My village" : "Village"} onBack={onBack} />
      <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-4">
        {status && (
          <SkinsStatusView
            status={status}
            guestTitle="Connect to build your village"
            guestText="Your village is kept on your account: chests after your games and the daily shop fill your inventory, and others attack it."
            errorTitle="The village could not be read"
            skeleton={
              <div className="flex flex-col gap-3">
                <Skeleton className="h-10 w-full rounded-lg" />
                <Skeleton className="aspect-square w-full rounded-2xl" />
              </div>
            }
            onConnect={onConnect}
            onRetry={onRetry}
          />
        )}
      </main>
    </div>
  );
}

function LayoutView({
  village,
  mode = "own",
  inventory = {},
  cobbles = 0,
  chests = 0,
  saving = false,
  saved = null,
  refusal = null,
  refusalDetail,
  tileArt,
  initialEditing = false,
  initialDraft,
  initialSelected = null,
  initialHeld = null,
  onBack,
  onSave,
  onDismissSaved,
  onDismissRefusal,
  onOpenChests,
  onOpenShop,
}: Omit<VillageLayoutSceneProps, "village" | "status" | "onConnect" | "onRetry"> & { village: VillageLayout }) {
  const own = mode === "own";
  const slots = slotsFor(village.level);
  const [editing, setEditing] = useState(own && initialEditing);
  const [draft, setDraft] = useState<readonly BoardTile[]>(initialDraft ?? village.tiles);
  const [selected, setSelected] = useState<number | null>(initialSelected);
  const [held, setHeld] = useState<number | null>(initialHeld);
  const [orientation, setOrientation] = useState(1);
  const [drag, setDrag] = useState<{ source: DragSource; x: number; y: number; over: DropTarget } | null>(null);
  const press = useRef<{ source: DragSource; x: number; y: number; moved: boolean; el: HTMLElement } | null>(null);
  const clickAfterDrag = useRef(false);
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);

  // A save that landed closes the editor on the new layout.
  useEffect(() => {
    if (!saved) return;
    setEditing(false);
    setSelected(null);
    setHeld(null);
  }, [saved]);
  // The saved layout changed (a save, a read): a closed editor follows it.
  useEffect(() => {
    if (!editing) setDraft(village.tiles);
  }, [village.tiles, editing]);

  const tiles = editing ? draft : village.tiles;
  const check = checkLayout(tiles, slots);
  const problem = layoutProblem(check);
  const changed = !sameLayout(draft, village.tiles);
  const tray = trayOf(inventory, village.tiles, draft);
  const full = draft.length >= slots;
  const chosen = selected != null ? (draft.find((t) => t.id === selected) ?? null) : null;

  const open = () => {
    onDismissSaved?.();
    setDraft(village.tiles);
    setSelected(null);
    setHeld(null);
    setEditing(true);
  };
  const cancel = () => {
    setDraft(village.tiles);
    setSelected(null);
    setHeld(null);
    setEditing(false);
  };
  const place = (plan: number, cell: Cell) => {
    if ((tray[plan] ?? 0) <= 0 || full || draft.some((t) => t.x === cell.x && t.y === cell.y)) return;
    setDraft((d) => placeTile(d, plan, orientation, cell));
    // The plan stays in hand while some are left: several of one plan go down in a row.
    if ((tray[plan] ?? 0) <= 1 || draft.length + 1 >= slots) setHeld(null);
  };
  const move = (id: number, cell: Cell) => {
    setDraft((d) => moveTile(d, id, cell));
    setSelected(null);
  };
  const takeOff = (id: number) => {
    setDraft((d) => takeOffTile(d, id));
    setSelected(null);
  };

  const onCell = (cell: Cell) => {
    if (saving) return;
    if (held != null) place(held, cell);
    else if (selected != null) move(selected, cell);
  };
  const onTile = (tile: BoardTile) => {
    if (saving) return;
    if (clickAfterDrag.current) {
      clickAfterDrag.current = false;
      return;
    }
    // A tile chosen and another tapped: the two swap; the same one again lets it go.
    if (selected != null && selected !== tile.id && !isStarter(tile) && chosen && !isStarter(chosen)) return move(selected, tile);
    setHeld(null);
    setSelected(selected === tile.id ? null : tile.id);
  };
  const onSelectPlan = (plan: number | null) => {
    if (clickAfterDrag.current) {
      clickAfterDrag.current = false;
      return;
    }
    setSelected(null);
    setHeld(plan);
    setOrientation(1);
  };

  const drop = (source: DragSource, target: DropTarget) => {
    if (!target) return;
    if (source.kind === "plan" && target.kind === "cell") place(source.plan, target.cell);
    if (source.kind === "tile" && target.kind === "cell") move(source.id, target.cell);
    if (source.kind === "tile" && target.kind === "tray") takeOff(source.id);
  };
  const startDrag = (source: DragSource, e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0 || saving) return;
    if (source.kind === "tile" && isStarter({ id: source.id })) return;
    stop.current?.();
    press.current = { source, x: e.clientX, y: e.clientY, moved: false, el: e.currentTarget };
    const moveAt = (ev: PointerEvent) => {
      const p = press.current;
      if (!p) return;
      if (!p.moved && Math.hypot(ev.clientX - p.x, ev.clientY - p.y) < DRAG_SLOP) return;
      p.moved = true;
      setDrag({ source: p.source, x: ev.clientX, y: ev.clientY, over: targetAt(ev.clientX, ev.clientY) });
    };
    const end = (ev: PointerEvent, dropped: boolean) => {
      const p = press.current;
      press.current = null;
      stop.current?.();
      if (!p?.moved) return;
      // A release over the element it started on is followed by a click on it: that click ends the drag, it is no tap.
      const under = document.elementFromPoint?.(ev.clientX, ev.clientY);
      if (under && p.el.contains(under)) {
        clickAfterDrag.current = true;
        setTimeout(() => (clickAfterDrag.current = false), 0);
      }
      setDrag(null);
      if (dropped) drop(p.source, targetAt(ev.clientX, ev.clientY));
    };
    const up = (ev: PointerEvent) => end(ev, true);
    const cancelDrag = (ev: PointerEvent) => end(ev, false);
    window.addEventListener("pointermove", moveAt);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancelDrag);
    stop.current = () => {
      window.removeEventListener("pointermove", moveAt);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancelDrag);
      stop.current = null;
    };
  };

  const draggedTile = drag?.source.kind === "tile" ? draft.find((t) => drag.source.kind === "tile" && t.id === drag.source.id) : undefined;
  const dragged = drag?.source.kind === "plan" ? { plan: drag.source.plan, orientation } : draggedTile ? { plan: draggedTile.plan, orientation: draggedTile.orientation } : null;
  const overCell = drag?.over?.kind === "cell" ? drag.over.cell : null;
  const targets = editing && !saving && (held != null || (chosen != null && !isStarter(chosen)) || drag != null);

  const title = own ? "My village" : `${village.owner}'s village`;
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <TopBar
        title={editing ? "Edit layout" : title}
        onBack={editing ? cancel : onBack}
        ownCobbles={own}
        end={
          own ? (
            <span className="pr-2">
              <Cobbles value={cobbles} />
            </span>
          ) : undefined
        }
      />
      <div className="flex min-h-0 flex-1 flex-col desktop:flex-row desktop:gap-4 desktop:p-4 desktop:pt-0">
        <div className="flex min-h-0 flex-1 flex-col desktop:overflow-hidden desktop:rounded-2xl desktop:border desktop:border-border">
          <div className="flex items-end justify-between gap-3 border-b border-border px-4 pb-2 desktop:pt-2">
            <Score value={village.score} label="Village score" size="sm" className="shrink-0" />
            <div className="flex flex-wrap items-center justify-end gap-2">
              {!own && (
                <Badge variant="outline">
                  <Icon name="user" size="xs" /> Visiting
                </Badge>
              )}
              <Badge variant="secondary" aria-label={`Level ${village.level}`}>
                Lv <span className="numeric">{village.level}</span>
              </Badge>
              <Badge variant={check.over > 0 ? "warning" : "secondary"} aria-label={`${check.used} of ${slots} slots used`}>
                <Icon name="layer-group" size="xs" />
                <span className="numeric">
                  {check.used} / {slots}
                </span>
              </Badge>
            </div>
          </div>
          {editing && (
            <div role="status" aria-live="polite" className={cn("flex items-center gap-2 border-b border-border px-4 py-2 text-sm", problem ? "text-warning" : "text-success")}>
              <Icon name={problem ? "triangle-exclamation" : "circle-check"} size="sm" />
              <span>{problem ?? (changed ? "A valid layout: save it to score it." : "Your saved layout.")}</span>
            </div>
          )}
          <LayoutBoard
            tiles={tiles}
            editing={editing}
            selected={selected}
            targets={targets}
            faults={editing ? check.faults : []}
            detached={editing ? new Set(check.detached.map((t) => t.id)) : undefined}
            over={overCell}
            preview={drag ? dragged : null}
            tileArt={tileArt}
            onTile={onTile}
            onCell={onCell}
            onTilePress={(tile, e) => startDrag({ kind: "tile", id: tile.id }, e)}
            className="min-h-0 flex-1"
          />
          {own && saved && !editing && (
            <div className="border-t border-border px-4 py-2">
              <Notice icon="circle-check" title="Layout saved">
                Your village scores <span className="numeric font-semibold">{formatInteger(saved.score)}</span>
                {saved.score !== saved.previous && (
                  <span className={cn("numeric", saved.score > saved.previous ? "text-success" : "text-muted-foreground")}>
                    {" "}
                    ({saved.score > saved.previous ? "+" : "−"}
                    {formatInteger(Math.abs(saved.score - saved.previous))})
                  </span>
                )}
                : attackers play against it now.
              </Notice>
            </div>
          )}
          {own && refusal && (
            <div className="border-t border-border px-4 py-2">
              <InlineError
                title="Not saved"
                message={refusal}
                detail={refusalDetail}
                action={
                  onDismissRefusal && (
                    <Button size="sm" variant="ghost" onClick={onDismissRefusal}>
                      Dismiss
                    </Button>
                  )
                }
              />
            </div>
          )}
          {!own && <p className="border-t border-border px-4 py-2 text-center text-xs text-muted-foreground">Read-only: the tiles stay as their owner laid them out.</p>}
          {own && !editing && (
            <div className="grid grid-cols-3 gap-2 border-t border-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] desktop:hidden">
              <ViewActions chests={chests} onEdit={open} onOpenChests={onOpenChests} onOpenShop={onOpenShop} />
            </div>
          )}
        </div>
        {own && (
          <aside
            aria-label={editing ? "Editor" : "Village"}
            className={cn(
              "flex shrink-0 flex-col gap-3 border-t border-border bg-card p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] desktop:w-96 desktop:self-start desktop:rounded-2xl desktop:border desktop:p-4",
              !editing && "hidden desktop:flex",
            )}
          >
            {editing ? (
              <>
                {chosen ? (
                  <ChosenTile tile={chosen} tileArt={tileArt} busy={saving} onRotate={() => setDraft((d) => rotateTile(d, chosen.id))} onTakeOff={() => takeOff(chosen.id)} onDone={() => setSelected(null)} />
                ) : held != null ? (
                  <div className="flex items-center justify-between gap-2 px-1">
                    <p className="text-sm">
                      Placing <span className="font-semibold">{tileName(held)}</span>
                    </p>
                    <Button size="icon" variant="outline" aria-label="Rotate the tile" onClick={() => setOrientation((o) => (o % 4) + 1)}>
                      <Icon name="rotate-right" size="sm" />
                    </Button>
                  </div>
                ) : null}
                <InventoryTray
                  tray={tray}
                  held={held}
                  orientation={orientation}
                  full={full}
                  dropping={drag?.source.kind === "tile" && drag.over?.kind === "tray"}
                  dragging={drag?.source.kind === "plan" ? drag.source.plan : null}
                  tileArt={tileArt}
                  onSelect={onSelectPlan}
                  onDragStart={(plan, e) => startDrag({ kind: "plan", plan }, e)}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" onClick={cancel} disabled={saving}>
                    Cancel
                  </Button>
                  <Button onClick={() => onSave?.(draft)} disabled={!check.valid || !changed} loading={saving} aria-describedby={problem ? "layout-problem" : undefined}>
                    <Icon name="floppy-disk" size="sm" /> Save
                  </Button>
                </div>
                {problem && (
                  <p id="layout-problem" className="sr-only">
                    {problem}
                  </p>
                )}
              </>
            ) : (
              <>
                <h2 className="font-display text-lg">Your village</h2>
                <p className="text-sm text-muted-foreground">
                  <span className="numeric">{check.used}</span> of your <span className="numeric">{slots}</span> slots hold a tile; each level unlocks one more, up to 28.
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <ViewActions chests={chests} onEdit={open} onOpenChests={onOpenChests} onOpenShop={onOpenShop} />
                </div>
              </>
            )}
          </aside>
        )}
      </div>
      {drag && dragged && (
        <span aria-hidden className="pointer-events-none fixed z-50 size-16 -translate-x-1/2 -translate-y-1/2 drop-shadow-lg" style={{ left: drag.x, top: drag.y }}>
          <TileChip plan={dragged.plan} orientation={dragged.orientation} art={tileArt} className={cn("size-full border-primary", drag.over && "opacity-60")} />
        </span>
      )}
    </div>
  );
}

/** The view's three ways on: edit the layout, open the chests (their count), the shop. */
function ViewActions({ chests, onEdit, onOpenChests, onOpenShop }: { chests: number; onEdit: () => void; onOpenChests?: () => void; onOpenShop?: () => void }) {
  return (
    <>
      <Button onClick={onEdit}>
        <Icon name="pen-to-square" size="sm" /> Edit
      </Button>
      <Button variant="outline" onClick={onOpenChests} aria-label={chests > 0 ? `Chests, ${chests} waiting` : "Chests"} className="relative">
        <Icon name="treasure-chest" size="sm" /> Chests
        {chests > 0 && (
          <span aria-hidden className="numeric absolute -top-1.5 -right-1.5 grid min-w-5 place-items-center rounded-full bg-primary px-1 text-xs font-semibold text-primary-foreground">
            {chests}
          </span>
        )}
      </Button>
      <Button variant="outline" onClick={onOpenShop}>
        <Icon name="store" size="sm" /> Shop
      </Button>
    </>
  );
}

/** The placed tile chosen: turn it, take it off, or let it go. The starter stays as it is. */
function ChosenTile({ tile, tileArt, busy, onRotate, onTakeOff, onDone }: { tile: BoardTile; tileArt?: TileArt; busy: boolean; onRotate: () => void; onTakeOff: () => void; onDone: () => void }) {
  const starter = isStarter(tile);
  return (
    <div className="flex items-center gap-3 px-1">
      <TileChip plan={tile.plan} orientation={tile.orientation} art={tileArt} className="size-12 rounded-[3px] border-0" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-semibold">{starter ? "The starter" : tileName(tile.plan)}</span>
        <span className="text-xs text-muted-foreground">{starter ? "It stays at the centre, as it is." : "Tap a cell to move it, or a tile to swap."}</span>
      </div>
      {!starter && (
        <>
          <Button size="icon" variant="outline" aria-label="Rotate the tile" onClick={onRotate} disabled={busy}>
            <Icon name="rotate-right" size="sm" />
          </Button>
          <Button size="icon" variant="outline" aria-label="Take it off" onClick={onTakeOff} disabled={busy}>
            <Icon name="arrow-down" size="sm" />
          </Button>
        </>
      )}
      <Button size="icon" variant="ghost" aria-label="Done" onClick={onDone}>
        <Icon name="xmark" size="sm" />
      </Button>
    </div>
  );
}
