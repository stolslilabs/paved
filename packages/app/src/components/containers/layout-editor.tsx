import { useEffect, useMemo, useRef, useState } from "react";
import type { BoardTile } from "@paved/chain";
import { cn } from "../../lib/utils";
import { HoldButton } from "../elements/hold-button";
import { type TileArt } from "../elements/tile-chip";
import { tileName } from "../elements/tile-render";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Icon } from "../ui/icon";
import { InventoryTray } from "./inventory-tray";
import type { LayoutPending } from "./layout-board";
import { STARTER, canLift, fittingAt, layoutScore, legalSpots, placeTile, sameLayout, slotsFor, trayOf, type Inventory, type Spot, type VillageLayout } from "./layout-rules";
import { TileBubble } from "./tile-bubble";

// The v2 village's editor (#739), shared by the village page (`VillageLayoutScene`) and the home's edit mode (#753): its state
// (the draft, the tile in hand, the cell it is set on), its rules (the layout valid at every step, never past the slots) and its
// panel (the bubble, the hint, the inventory, Reset all, Discard and Save).

/** A layout saved: the score it gives, against the one before. */
export interface LayoutSaved {
  score: number;
  previous: number;
}

/** The tile in hand: from the inventory (a plan), or lifted from the board (the tile, its cell and rotation kept). */
export type LayoutHand = { from: "inventory"; plan: number } | { from: "board"; tile: BoardTile };

export interface LayoutEditorOptions {
  village: VillageLayout;
  inventory?: Inventory;
  /** The player's own village: only it opens the editor. */
  own?: boolean;
  /** The save on its way: the editor waits. */
  saving?: boolean;
  /** The last save landed: the editor closes. */
  saved?: LayoutSaved | null;
  /**
   * The editor open, held by the caller (the home's URL, `?edit`): a change asks `onEditingChange`. Unset: the editor keeps it
   * itself, from `initialEditing`.
   */
  editing?: boolean;
  onEditingChange?: (editing: boolean) => void;
  /** Where the stories start: the editor open on this draft (the saved layout when unset), a tile in hand, set on a cell, the leave dialog. */
  initialEditing?: boolean;
  initialDraft?: readonly BoardTile[];
  initialHand?: { plan: number } | { lift: number } | null;
  initialPending?: Spot | null;
  initialLeaving?: boolean;
  /** Back with the editor closed. */
  onBack?: () => void;
  onSave?: (tiles: readonly BoardTile[]) => void;
  onDismissSaved?: () => void;
  /** The editor holds changes not saved (true), or none (false). */
  onDirtyChange?: (dirty: boolean) => void;
}

/** The orientation the tile takes on `spot`: the one it has if it fits there, else the first that does. */
const fitOn = (spot: Spot, orientation: number) => (spot.orientations.includes(orientation) ? orientation : spot.orientations[0]!);

/**
 * The editor's state and moves. Placing works as on the board (the owner's decisions): a card of the inventory puts its tile in
 * hand, its legal cells light up (`plates`), a tap sets it on one (`pending`), and the bubble rotates it, sends it back or places
 * it with a hold. A placed tile is lifted into the hand with a tap; a tile that holds the village together shakes instead. The
 * starter never moves. Back with changes asks first (`leaving`).
 */
export function useLayoutEditor({
  village,
  inventory = {},
  own = true,
  saving = false,
  saved = null,
  editing: held,
  onEditingChange,
  initialEditing = false,
  initialDraft,
  initialHand = null,
  initialPending = null,
  initialLeaving = false,
  onBack,
  onSave,
  onDismissSaved,
  onDirtyChange,
}: LayoutEditorOptions) {
  const slots = slotsFor(village.level);
  const start = initialDraft ?? village.tiles;
  const startHand: LayoutHand | null = !initialHand
    ? null
    : "plan" in initialHand
      ? { from: "inventory", plan: initialHand.plan }
      : (() => {
          const tile = start.find((t) => t.id === initialHand.lift);
          return tile ? { from: "board", tile } : null;
        })();
  const [ownEditing, setOwnEditing] = useState(own && initialEditing);
  const editing = own && (held ?? ownEditing);
  const setEditing = (next: boolean) => {
    if (held === undefined) setOwnEditing(next);
    onEditingChange?.(next);
  };
  const [draft, setDraft] = useState<readonly BoardTile[]>(startHand?.from === "board" ? start.filter((t) => t.id !== startHand.tile.id) : start);
  const [hand, setHand] = useState<LayoutHand | null>(startHand);
  const [pending, setPending] = useState<LayoutPending | null>(() => {
    if (startHand?.from === "board") return { ...startHand.tile };
    if (startHand && initialPending) return { x: initialPending.x, y: initialPending.y, plan: startHand.plan, orientation: initialPending.orientations[0]! };
    return null;
  });
  const [shaking, setShaking] = useState<number | null>(null);
  const [leaving, setLeaving] = useState(initialLeaving);
  const shake = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (shake.current && clearTimeout(shake.current)), []);

  // A save that landed closes the editor on the new layout.
  const closeOnSave = useRef(setEditing);
  closeOnSave.current = setEditing;
  useEffect(() => {
    if (!saved) return;
    closeOnSave.current(false);
    setHand(null);
    setPending(null);
  }, [saved]);
  // The saved layout changed (a save, a read), or the editor closed from outside (the home's Back): a closed editor follows it.
  useEffect(() => {
    if (editing) return;
    setDraft(village.tiles);
    setHand(null);
    setPending(null);
    setLeaving(false);
  }, [village.tiles, editing]);

  const lifted = hand?.from === "board" ? hand.tile : null;
  // The layout as it stands: the draft, the lifted tile back at its cell until it goes elsewhere.
  const whole = useMemo(() => (lifted ? [...draft, lifted] : draft), [draft, lifted]);
  const tiles = editing ? draft : village.tiles;
  // A lifted tile still takes its slot: it is in hand, not in the inventory.
  const used = editing ? whole.length : village.tiles.length;
  const full = used >= slots;
  const over = used > slots;
  const tray = trayOf(inventory, village.tiles, whole);
  const handPlan = hand ? (hand.from === "inventory" ? hand.plan : hand.tile.plan) : null;
  const plates = useMemo(() => (editing && handPlan != null ? legalSpots(draft, handPlan) : []), [editing, handPlan, draft]);
  const score = useMemo(() => (editing ? layoutScore(whole) : village.score), [editing, whole, village.score]);
  const changed = !sameLayout(whole, village.tiles);
  const dirty = editing && changed;
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  const open = () => {
    onDismissSaved?.();
    setDraft(village.tiles);
    setHand(null);
    setPending(null);
    setEditing(true);
  };
  /** The tile in hand put down: a lifted tile back where it was, an inventory tile back in the inventory. */
  const putBack = () => {
    if (lifted) setDraft((d) => [...d, lifted]);
    setHand(null);
    setPending(null);
  };
  const close = () => {
    setDraft(village.tiles);
    setHand(null);
    setPending(null);
    setLeaving(false);
    setEditing(false);
  };
  const back = () => {
    if (!editing) return onBack?.();
    if (changed) setLeaving(true);
    else close();
  };

  const choosePlan = (plan: number | null) => {
    if (saving) return;
    // Every slot used: no inventory tile comes into the hand (the lifted one, if any, stays in hand).
    if (plan != null && full) return;
    if (lifted) setDraft((d) => [...d, lifted]);
    setHand(plan == null ? null : { from: "inventory", plan });
    setPending(null);
  };
  const choosePlate = (spot: Spot) => {
    if (handPlan == null || saving) return;
    setPending((p) => ({ x: spot.x, y: spot.y, plan: handPlan, orientation: fitOn(spot, p?.orientation ?? (lifted?.orientation ?? 1)) }));
  };
  const lift = (tile: BoardTile) => {
    if (saving) return;
    // What is in hand goes back first: one tile in hand at a time.
    const base = lifted ? [...draft, lifted] : draft;
    if (!canLift(base, tile.id)) {
      setShaking(tile.id);
      if (shake.current) clearTimeout(shake.current);
      shake.current = setTimeout(() => setShaking(null), 1_600);
      setDraft(base);
      setHand(null);
      setPending(null);
      return;
    }
    setShaking(null);
    setDraft(base.filter((t) => t.id !== tile.id));
    setHand({ from: "board", tile });
    setPending({ ...tile });
  };
  const rotations = pending ? fittingAt(draft, pending.plan, pending) : [];
  const rotate = () => {
    if (!pending || rotations.length < 2) return;
    const i = rotations.indexOf(pending.orientation);
    setPending({ ...pending, orientation: rotations[(i + 1) % rotations.length]! });
  };
  const confirm = () => {
    if (!pending || !hand) return;
    if (hand.from === "board") {
      setDraft((d) => [...d, { ...hand.tile, x: pending.x, y: pending.y, orientation: pending.orientation }]);
      setHand(null);
    } else {
      // Never past the slots: an inventory tile needs a free one (the editor never places more than S tiles).
      if (whole.length >= slots) return;
      setDraft((d) => placeTile(d, hand.plan, pending.orientation, pending));
      // The plan stays in hand while some are left and a slot is free: several of one plan go down in a row.
      if ((tray[hand.plan] ?? 0) <= 1 || used + 1 >= slots) setHand(null);
    }
    setPending(null);
  };
  const sendBack = () => {
    setHand(null);
    setPending(null);
  };
  const reset = () => {
    setDraft([{ ...STARTER }]);
    setHand(null);
    setPending(null);
  };
  const discard = () => {
    setDraft(village.tiles);
    setHand(null);
    setPending(null);
  };
  const save = () => {
    // What is in hand stays where it is: a lifted tile at its cell, an inventory tile in the inventory.
    if (over) return;
    putBack();
    onSave?.(whole);
  };

  const hint =
    shaking != null
      ? "This tile holds the village together: take the outer tiles first."
      : pending
        ? "Rotate, then hold the check to place it."
        : hand
          ? plates.length
            ? `Tap a lit cell for ${tileName(handPlan!)}.`
            : `${tileName(handPlan!)} fits nowhere yet: send it back, or place another tile first.`
          : full
            ? "Every slot is used: lift a tile to move it, or send it back to free one."
            : "Choose a tile in the inventory, or tap a placed tile to lift it.";

  return {
    editing,
    slots,
    tiles,
    whole,
    draft,
    hand,
    pending: editing ? pending : null,
    plates,
    shaking,
    used,
    full,
    over,
    tray,
    score,
    changed,
    dirty,
    rotations,
    saving,
    hint,
    leaving,
    setLeaving,
    open,
    close,
    back,
    putBack,
    choosePlan,
    choosePlate,
    lift,
    rotate,
    confirm,
    sendBack,
    reset,
    discard,
    save,
  };
}

export type LayoutEditor = ReturnType<typeof useLayoutEditor>;

/**
 * The editor's tools: the bubble of the tile set on a cell, the hint, the inventory's carousel, Reset all (held), Discard and
 * Save.
 */
export function LayoutEditorPanel({ editor, tileArt, holdMs, className }: { editor: LayoutEditor; tileArt?: TileArt; holdMs?: number; className?: string }) {
  const { pending, hand, saving } = editor;
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {pending && hand && (
        <TileBubble
          rotations={editor.rotations.length}
          orientation={pending.orientation}
          cell={pending}
          holdMs={holdMs}
          busy={saving}
          onRotate={editor.rotate}
          onClose={editor.putBack}
          onReturn={editor.sendBack}
          onConfirm={editor.confirm}
          canConfirm={hand.from === "board" || editor.whole.length < editor.slots}
        />
      )}
      <p role="status" aria-live="polite" className={cn("px-1 text-xs", editor.shaking != null ? "text-warning" : "text-muted-foreground")}>
        {editor.hint}
      </p>
      <InventoryTray tray={editor.tray} held={hand?.from === "inventory" ? hand.plan : null} full={editor.full} busy={saving} tileArt={tileArt} onSelect={editor.choosePlan} />
      <div className="flex items-center gap-2">
        <HoldButton label="Hold to reset all: the starter alone, every tile back in the inventory" title="Hold to reset all" icon="rotate" tone="destructive" holdMs={holdMs} disabled={saving || editor.draft.length <= 1} onComplete={editor.reset} />
        <Button variant="outline" className="flex-1" onClick={editor.discard} disabled={!editor.changed || saving} aria-label="Discard changes">
          Discard
        </Button>
        <Button className="flex-1" onClick={editor.save} disabled={!editor.changed || editor.over || saving} loading={saving}>
          <Icon name="check" size="sm" /> Save
        </Button>
      </div>
    </div>
  );
}

/** Back with unsaved changes: asked first. */
export function LeaveEditDialog({ editor }: { editor: LayoutEditor }) {
  return (
    <Dialog open={editor.leaving} onOpenChange={editor.setLeaving}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Leave without saving?</DialogTitle>
          <DialogDescription>Your changes to the layout are lost; the village stays as it was saved.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => editor.setLeaving(false)}>
            Keep editing
          </Button>
          <Button variant="destructive" onClick={editor.close}>
            Leave
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
