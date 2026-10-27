import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { BoardTile } from "@paved/chain";
import { useReducedMotionConfig } from "motion/react";
import * as m from "motion/react-m";
import { browserRandomLayoutRunner, freshSeed, type RandomLayoutRunner } from "../../lib/random-layout-runner";
import { cn } from "../../lib/utils";
import { HoldButton } from "../elements/hold-button";
import { InlineError } from "../elements/inline-error";
import { type TileArt } from "../elements/tile-chip";
import { tileName } from "../elements/tile-render";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Icon } from "../ui/icon";
import type { BoardBubble } from "./board-viewport";
import { InventoryTray } from "./inventory-tray";
import type { LayoutBoardView, LayoutPending } from "./layout-board";
import { STARTER, canLift, draftOf, fittingAt, layoutScore, legalSpots, placeTile, rememberPoints, sameLayout, slotsFor, stockOf, trayOf, type Inventory, type Spot, type VillageLayout } from "./layout-rules";
import { TileBubble } from "./tile-bubble";

// The v2 village's editor (#739), shared by the village page (`VillageLayoutScene`) and the home's edit mode (#753): its state
// (the draft, the tile in hand), its rules (the layout valid at every step, never past the slots), its panel (the hint, the
// inventory, Save; the still bubble of the plan view) and Reset all.

/** A layout saved: the score it gives, against the one before. */
export interface LayoutSaved {
  score: number;
  previous: number;
}

/**
 * The tile in hand: a plan of the inventory, not set down yet (its legal cells lit), or a tile of the layout under the bubble
 * (#756), placed already: `origin` is where it stood when it was lifted; null, it came from the inventory, so Cancel sends it
 * back there.
 */
export type LayoutHand = { from: "inventory"; plan: number } | { from: "board"; id: number; origin: BoardTile | null };

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
  /**
   * Where the stories start: the editor open on this draft (the saved layout when unset), a plan in hand or a tile lifted, and
   * `initialPending`, the cell the plan was placed on or the lifted tile moved to; the leave dialog.
   */
  initialEditing?: boolean;
  initialDraft?: readonly BoardTile[];
  initialHand?: { plan: number } | { lift: number } | null;
  initialPending?: Spot | null;
  initialLeaving?: boolean;
  /** Back with the editor closed. */
  onBack?: () => void;
  /** Save the draft, with the score the engine gives it. */
  onSave?: (tiles: readonly BoardTile[], score: number) => void;
  onDismissSaved?: () => void;
  /** The editor holds changes not saved (true), or none (false). */
  onDirtyChange?: (dirty: boolean) => void;
  /**
   * The die's builder (#803): the browser's Web Worker when unset; null hides the die (no Web Workers). The stories and tests
   * pass their own.
   */
  randomizer?: RandomLayoutRunner | null;
  /** The seed of each press of the die: a new one each time when unset. */
  randomSeed?: () => number;
  /** How long the die builds before it says "Still building…" with a cancel, ms (default 1 s). */
  slowRollMs?: number;
  /** Where the stories start: the die pressed as the editor opens. */
  initialRolling?: boolean;
}

/** The orientation the tile takes on `spot`: the one it has if it fits there, else the first that does. */
const fitOn = (spot: Spot, orientation: number) => (spot.orientations.includes(orientation) ? orientation : spot.orientations[0]!);

/** The draft and the hand a story starts on: a plan placed on `at`, or a tile lifted and moved there. */
function startOf(tiles: readonly BoardTile[], hand: LayoutEditorOptions["initialHand"], at: Spot | null): { draft: readonly BoardTile[]; hand: LayoutHand | null } {
  if (!hand) return { draft: tiles, hand: null };
  if ("plan" in hand) {
    if (!at) return { draft: tiles, hand: { from: "inventory", plan: hand.plan } };
    const draft = placeTile(tiles, hand.plan, fitOn(at, 1), at);
    return { draft, hand: { from: "board", id: draft[draft.length - 1]!.id, origin: null } };
  }
  const tile = tiles.find((t) => t.id === hand.lift);
  if (!tile) return { draft: tiles, hand: null };
  const draft = at ? tiles.map((t) => (t.id === tile.id ? { ...t, x: at.x, y: at.y, orientation: fitOn(at, t.orientation) } : t)) : tiles;
  return { draft, hand: { from: "board", id: tile.id, origin: tile } };
}

/** How long a refused tile shakes, ms. */
const SHAKE_MS = 1_600;
/** How long the die builds before it says so, with a cancel, ms. */
const SLOW_ROLL_MS = 1_000;
/** What the die says when its worker failed. */
export const ROLL_FAILED = "The die could not build a village. Try again.";

/**
 * The editor's state and moves. Placing works as on the boards, with no validation (#756, the owner's decisions): a card of the
 * inventory puts its plan in hand and lights its legal cells; a tap on one places the tile there at once, in the draft, and the
 * bubble stands by it (Rotate, Back to the inventory). A tap on another lit cell moves that tile; a tap on another placed tile
 * lifts that one instead, the first staying where it is; a tap on the tile under the bubble lets it go. Cancel (Escape) puts it
 * back where it started: a lifted tile at its first cell, an inventory tile in the inventory. A tile that holds the village
 * together shakes instead of lifting, and the starter never moves: the layout is valid after every tap. Back with changes asks
 * first (`leaving`).
 */
export function useLayoutEditor({
  village,
  inventory = {},
  own = true,
  saving = false,
  saved = null,
  editing: heldOpen,
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
  randomizer: givenRandomizer,
  randomSeed = freshSeed,
  slowRollMs = SLOW_ROLL_MS,
  initialRolling = false,
}: LayoutEditorOptions) {
  const slots = slotsFor(village.level);
  const [start] = useState(() => startOf(initialDraft ?? village.tiles, initialHand, initialPending));
  const [ownEditing, setOwnEditing] = useState(own && initialEditing);
  const editing = own && (heldOpen ?? ownEditing);
  const setEditing = (next: boolean) => {
    if (heldOpen === undefined) setOwnEditing(next);
    onEditingChange?.(next);
  };
  const [draft, setDraft] = useState<readonly BoardTile[]>(start.draft);
  const [hand, setHand] = useState<LayoutHand | null>(start.hand);
  const [shaking, setShaking] = useState<number | null>(null);
  const [leaving, setLeaving] = useState(initialLeaving);
  const shake = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (shake.current && clearTimeout(shake.current)), []);
  // The die (#803): its builder (made once), the press at work (its number, null when none), whether it is slow, a failure.
  const [ownRandomizer] = useState(() => (givenRandomizer === undefined ? browserRandomLayoutRunner() : null));
  const randomizer = givenRandomizer === undefined ? ownRandomizer : givenRandomizer;
  const [rolling, setRolling] = useState<number | null>(null);
  const [slowRoll, setSlowRoll] = useState(false);
  const [rollError, setRollError] = useState<string | null>(null);
  const [rolls, setRolls] = useState(0);
  const press = useRef(0);
  // A build at work, known at once (the busy state follows in a transition, so an edit made before it lands still cancels).
  const building = useRef(false);
  const slowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A save that landed closes the editor on the new layout.
  const closeOnSave = useRef(setEditing);
  closeOnSave.current = setEditing;
  useEffect(() => {
    if (!saved) return;
    closeOnSave.current(false);
    setHand(null);
  }, [saved]);
  // The editor closed from outside (the home's Back): it lets go of the draft.
  useEffect(() => {
    if (editing) return;
    setDraft(village.tiles);
    setHand(null);
    setLeaving(false);
  }, [village.tiles, editing]);
  // The saved layout changed (a save, a read, the village arriving after the editor opened on `?edit`): a draft with nothing
  // changed on the old layout follows it; one with changes is the player's, and stays.
  const savedTiles = useRef(village.tiles);
  useEffect(() => {
    const before = savedTiles.current;
    savedTiles.current = village.tiles;
    if (before === village.tiles || !editing) return;
    setDraft((d) => (sameLayout(d, before) ? village.tiles : d));
  }, [village.tiles, editing]);
  // The editor closed or gone: the die's build at work stops.
  useEffect(() => {
    if (editing) return;
    cancelRollRef.current();
    setRollError(null);
  }, [editing]);
  useEffect(() => () => {
    press.current += 1;
    randomizer?.dispose();
    if (slowTimer.current) clearTimeout(slowTimer.current);
  }, [randomizer]);
  const rollRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (initialRolling && editing) rollRef.current();
    // The stories' start only, once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The tile under the bubble, placed; the layout without it (where it may move).
  const held = (hand?.from === "board" && draft.find((t) => t.id === hand.id)) || null;
  const rest = useMemo(() => (held ? draft.filter((t) => t.id !== held.id) : draft), [draft, held]);
  const tiles = editing ? rest : village.tiles;
  const used = editing ? draft.length : village.tiles.length;
  const full = used >= slots;
  const over = used > slots;
  // What the panel shows of the draft (the tray, the live score, the points): one render behind, in a commit of its own, so a
  // change of the whole village (the die's, #803) is two short tasks, the board's then the panel's, never one long one.
  const shown = useDeferredValue(draft);
  const tray = useMemo(() => trayOf(inventory, village.tiles, shown), [inventory, village.tiles, shown]);
  const handPlan = hand?.from === "inventory" ? hand.plan : (held?.plan ?? null);
  // The legal cells of the plan in hand, or of the tile under the bubble without its own cell.
  const plates = useMemo(
    () => (editing && handPlan != null ? legalSpots(rest, handPlan).filter((s) => !held || s.x !== held.x || s.y !== held.y) : []),
    [editing, handPlan, rest, held],
  );
  const score = useMemo(() => (editing ? layoutScore(shown) : village.score), [editing, shown, village.score]);
  const changed = !sameLayout(draft, village.tiles);
  const dirty = editing && changed;
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);
  const pending: LayoutPending | null = useMemo(
    () => (editing && held ? { id: held.id, x: held.x, y: held.y, plan: held.plan, orientation: held.orientation } : null),
    [editing, held],
  );
  const rotations = held ? fittingAt(rest, held.plan, held) : [];

  const open = () => {
    onDismissSaved?.();
    setDraft(village.tiles);
    setHand(null);
    setEditing(true);
  };
  const close = () => {
    setDraft(village.tiles);
    setHand(null);
    setLeaving(false);
    setEditing(false);
  };
  const back = () => {
    if (!editing) return onBack?.();
    if (changed) setLeaving(true);
    else close();
  };

  const choosePlan = (plan: number | null) => {
    cancelRoll();
    if (saving) return;
    // Every slot used: no inventory tile comes into the hand.
    if (plan != null && full) return;
    // The tile under the bubble stays where it is: the card takes the next one.
    setHand(plan == null ? null : { from: "inventory", plan });
  };
  const choosePlate = (spot: Spot) => {
    cancelRoll();
    if (saving || !hand) return;
    if (hand.from === "inventory") {
      // Never past the slots: an inventory tile needs a free one.
      if (draft.length >= slots) return;
      const next = placeTile(draft, hand.plan, fitOn(spot, 1), spot);
      setDraft(next);
      setHand({ from: "board", id: next[next.length - 1]!.id, origin: null });
    } else if (held) {
      setDraft((d) => d.map((t) => (t.id === held.id ? { ...t, x: spot.x, y: spot.y, orientation: fitOn(spot, t.orientation) } : t)));
    }
  };
  /** The tile under the bubble let go: it stays where it is. */
  const letGo = () => setHand(null);
  const lift = (tile: BoardTile) => {
    cancelRoll();
    if (saving) return;
    if (held?.id === tile.id) return letGo();
    if (!canLift(draft, tile.id)) {
      setShaking(tile.id);
      if (shake.current) clearTimeout(shake.current);
      shake.current = setTimeout(() => setShaking(null), SHAKE_MS);
      return;
    }
    setShaking(null);
    setHand({ from: "board", id: tile.id, origin: tile });
  };
  const rotate = () => {
    cancelRoll();
    if (!held || rotations.length < 2) return;
    const next = rotations[(rotations.indexOf(held.orientation) + 1) % rotations.length]!;
    setDraft((d) => d.map((t) => (t.id === held.id ? { ...t, orientation: next } : t)));
  };
  /** The tile in hand back where it started: a lifted tile at its first cell and rotation, an inventory tile in the inventory. */
  const cancel = () => {
    cancelRoll();
    if (hand?.from === "board") {
      const { id, origin } = hand;
      setDraft((d) => (origin ? d.map((t) => (t.id === id ? origin : t)) : d.filter((t) => t.id !== id)));
    }
    setHand(null);
  };
  /** The tile under the bubble back to the inventory: its slot is free. */
  const sendBack = () => {
    cancelRoll();
    if (held) setDraft((d) => d.filter((t) => t.id !== held.id));
    setHand(null);
  };
  const reset = () => {
    cancelRoll();
    setDraft([{ ...STARTER }]);
    setHand(null);
  };
  const rollDone = () => {
    building.current = false;
    if (slowTimer.current) clearTimeout(slowTimer.current);
    slowTimer.current = null;
    setRolling(null);
    setSlowRoll(false);
  };
  /** The die pressed: a new village from the whole stock, built off the main thread; a press at work is cancelled first. */
  const roll = () => {
    if (!randomizer || saving) return;
    const n = ++press.current;
    building.current = true;
    if (slowTimer.current) clearTimeout(slowTimer.current);
    // The stage re-renders whole (the board included): a transition, cut into short tasks, so the press never holds a frame.
    startTransition(() => {
      setRolling(n);
      setRolls(n);
      setSlowRoll(false);
      setRollError(null);
    });
    slowTimer.current = setTimeout(() => press.current === n && startTransition(() => setSlowRoll(true)), slowRollMs);
    randomizer.run(stockOf(inventory, village.tiles), slots, randomSeed()).then(
      ({ tiles, points }) => {
        if (press.current !== n) return;
        const next = draftOf(tiles);
        // The worker's points: the live score and the points read them, no rebuild on the main thread.
        if (points) rememberPoints(next, points);
        building.current = false;
        // The draft only: Save, Back (asking first) and Reset all take it as any edit. The board takes it first; the panel
        // follows in its own commit (`shown`).
        rollDone();
        setDraft(next);
        setHand(null);
      },
      () => {
        if (press.current !== n) return;
        rollDone();
        setRollError(ROLL_FAILED);
      },
    );
  };
  /**
   * The build at work stopped: the draft stays as it was. Cancel, and any edit of the player's while the die builds (Reset all,
   * a tile chosen, placed, lifted, turned or sent back, Save): the build's late answer would undo the edit.
   */
  const cancelRoll = () => {
    if (!building.current) return;
    press.current += 1;
    randomizer?.cancel();
    rollDone();
  };
  const cancelRollRef = useRef(cancelRoll);
  cancelRollRef.current = cancelRoll;
  rollRef.current = roll;
  const save = () => {
    cancelRoll();
    if (over) return;
    setHand(null);
    // The saved draft's own score: the one shown may be a render behind (`shown`). The die's drafts read their worker's points.
    onSave?.(draft, layoutScore(draft));
  };

  const hint =
    rolling !== null
      ? slowRoll
        ? "Still building a village from your tiles…"
        : "Building a village from your tiles…"
      : shaking != null
      ? "This tile holds the village together: take the outer tiles first."
      : held
        ? `Tap a lit cell to move ${tileName(held.plan)}, or tap it to let it go.`
        : handPlan != null
          ? plates.length
            ? `Tap a lit cell to place ${tileName(handPlan)}.`
            : `${tileName(handPlan)} fits nowhere yet: place another tile first.`
          : full
            ? "Every slot is used: tap a placed tile to move it, or send it back to free one."
            : "Choose a tile in the inventory, or tap a placed tile to move it.";

  // The moves, the same functions across renders (each calls this render's): the board, the inventory and the bubble take them
  // as props, so a change that leaves them as they were (the die pressed, the hint) does not draw them again.
  const latest = useRef({ lift, choosePlate, letGo, choosePlan, rotate, cancel, sendBack });
  latest.current = { lift, choosePlate, letGo, choosePlan, rotate, cancel, sendBack };
  const [moves] = useState(() => ({
    lift: (tile: BoardTile) => latest.current.lift(tile),
    choosePlate: (spot: Spot) => latest.current.choosePlate(spot),
    letGo: () => latest.current.letGo(),
    choosePlan: (plan: number | null) => latest.current.choosePlan(plan),
    rotate: () => latest.current.rotate(),
    cancel: () => latest.current.cancel(),
    sendBack: () => latest.current.sendBack(),
  }));
  const cancelButton = hand?.from === "board" && hand.origin !== null;
  const bubble: BoardBubble | null = useMemo(
    () =>
      pending && {
        cell: pending,
        rotations: rotations.length,
        orientation: pending.orientation,
        busy: saving,
        onRotate: moves.rotate,
        onClose: moves.cancel,
        onReturn: moves.sendBack,
        // Cancel shows for a lifted tile; an inventory tile's would do what Back to the inventory does (Escape does it for both).
        cancelButton,
      },
    [pending, rotations.length, saving, moves, cancelButton],
  );
  const view: LayoutBoardView = useMemo(
    () => ({ tiles, editing, plates, pending, shaking, onTile: moves.lift, onPlate: moves.choosePlate, onPending: moves.letGo }),
    [tiles, editing, plates, pending, shaking, moves],
  );

  return {
    editing,
    slots,
    tiles,
    draft,
    shown,
    hand,
    held,
    pending,
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
    bubble,
    view,
    leaving,
    setLeaving,
    open,
    close,
    back,
    choosePlan: moves.choosePlan,
    choosePlate: moves.choosePlate,
    lift: moves.lift,
    letGo: moves.letGo,
    rotate: moves.rotate,
    cancel: moves.cancel,
    sendBack: moves.sendBack,
    reset,
    save,
    canRoll: !!randomizer,
    rolling: rolling !== null,
    rolls,
    slowRoll,
    rollError,
    roll,
    cancelRoll,
    dismissRollError: () => setRollError(null),
  };
}

export type LayoutEditor = ReturnType<typeof useLayoutEditor>;

/**
 * Reset all (#756): the eraser held, in the style of the board's discard (a grey circle whose ring fills red). Only its look
 * changed: held, it brings the village back to the starter alone, every tile in the inventory, as before. Its place is the
 * edit bar, beside the slots.
 */
export function ResetAllHold({ editor, holdMs, className }: { editor: LayoutEditor; holdMs?: number; className?: string }) {
  return (
    <HoldButton
      label="Hold to reset all: the starter alone, every tile back in the inventory"
      title="Hold to reset all"
      icon="eraser"
      tone="destructive"
      holdMs={holdMs}
      disabled={editor.saving || editor.draft.length <= 1}
      onComplete={editor.reset}
      className={cn("size-11 rounded-full", className)}
    />
  );
}

/**
 * The die (#803), beside Reset all: a press builds a random compact village from every tile the player holds, off the main
 * thread, and puts it in the draft (never saved by itself); each press another. It spins once per press, and on while it
 * builds (not under reduced motion); past a second it says "Still building…" with a cancel, under it. Hidden where Web Workers
 * are missing.
 */
export function RandomDie({ editor, className }: { editor: LayoutEditor; className?: string }) {
  const still = useReducedMotionConfig() ?? false;
  if (!editor.canRoll) return null;
  return (
    <div className={cn("relative shrink-0", className)}>
      <Button
        size="icon"
        variant="secondary"
        onClick={editor.roll}
        disabled={editor.saving}
        aria-busy={editor.rolling || undefined}
        aria-label={editor.rolling ? "Building a random village: press for another" : "Random village from your tiles"}
        title="Random village"
        className="size-11 rounded-full"
      >
        <m.span
          key={editor.rolls}
          data-rolling={editor.rolling || undefined}
          className="inline-flex"
          initial={{ rotate: 0 }}
          animate={{ rotate: editor.rolls > 0 && !still ? 360 : 0 }}
          transition={editor.rolling ? { duration: 0.6, ease: "linear", repeat: Infinity } : { duration: 0.5, ease: "easeOut" }}
        >
          <Icon name="dice" size="md" />
        </m.span>
      </Button>
      {editor.slowRoll && (
        <div
          role="status"
          className="absolute top-full right-0 z-10 mt-2 flex items-center gap-1 rounded-lg border border-border bg-card/95 py-1 pr-1 pl-3 text-xs whitespace-nowrap shadow-lg backdrop-blur"
        >
          Still building…
          <Button size="sm" variant="ghost" onClick={editor.cancelRoll}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * The editor's tools: the hint, the inventory's carousel and Save. `bubble="panel"` (the plan view) also stands the bubble of
 * the tile in hand above them, still; `"scene"`: the 3D scene draws it by the tile (`BoardViewport`).
 */
export function LayoutEditorPanel({ editor, tileArt, bubble = "panel", className }: { editor: LayoutEditor; tileArt?: TileArt; bubble?: "panel" | "scene"; className?: string }) {
  const { hand, saving } = editor;
  const still = bubble === "panel" ? editor.bubble : null;
  return (
    <div className={cn("flex flex-col gap-3 desktop:min-h-0 desktop:flex-1", className)}>
      {still && (
        <TileBubble
          rotations={still.rotations}
          orientation={still.orientation}
          cell={still.cell}
          busy={saving}
          onRotate={still.onRotate}
          onClose={still.onClose}
          onReturn={still.onReturn}
          cancelButton={still.cancelButton}
        />
      )}
      <InlineError
        title="No random village"
        message={editor.rollError}
        action={
          <Button size="sm" variant="ghost" onClick={editor.dismissRollError}>
            Dismiss
          </Button>
        }
      />
      <p role="status" aria-live="polite" className={cn("px-1 text-xs", editor.shaking != null ? "text-warning" : "text-muted-foreground")}>
        {editor.hint}
      </p>
      <InventoryTray tray={editor.tray} held={hand?.from === "inventory" ? hand.plan : null} full={editor.full} busy={saving} tileArt={tileArt} onSelect={editor.choosePlan} />
      <Button onClick={editor.save} disabled={!editor.changed || editor.over || saving} loading={saving}>
        <Icon name="check" size="sm" /> Save
      </Button>
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
