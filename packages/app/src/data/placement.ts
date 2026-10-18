import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_PLACEMENT_SETTINGS } from "@paved/renderer";
import type { BoardGhost } from "../components/containers/board-viewport";

/**
 * The board's placement state (SLOTS, P-68; PLATES, P-74), for the Training and Challenge boards: the plates of the
 * tile in hand, where it stands, and whether Confirm may send it.
 *
 * - idle: no tile in hand. The board draws no plate.
 * - in-hand: a plate on every free cell next to a tile (`boardPlates`): playable (blue) where some rotation fits, invalid
 *   (grey) where none does. The tile hovered is drawn blue at half opacity.
 * - placed: the tile chosen on a slot, not yet sent, tinted yellow. A cell is chosen in a rotation that fits, and Rotate turns
 *   only through the rotations that fit there (`nextValid`), so the red state (`placed-red`, a fallback) is unreachable;
 *   Cancel (`clear`) puts the tile back.
 * - confirmed: the move sent; a green tint on the tile fades to none (`useConfirmFlash`).
 */
export type Slot = { x: number; y: number };
export type BoardSlot = Slot & { fits: boolean };
export type PlacementPhase = "idle" | "in-hand" | "placed" | "placed-red";

export const same = (a: Slot | null | undefined, b: Slot | null | undefined) => !!a && !!b && a.x === b.x && a.y === b.y;

/** A plate's state: some rotation fits (playable), or none does (invalid). */
export type PlateState = "playable" | "invalid";
export type BoardPlate = Slot & { state: PlateState };

/** The cells next to a cell: north, east, south, west. */
const SIDES = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
] as const;

/**
 * The plates of the tile in hand: every slot given (playable, whether or not the current rotation fits), then
 * every other free cell next to a tile, invalid (no rotation fits there), in reading order. `slots` undefined (no tile in
 * hand): no plate. An empty list is a tile in hand that fits nowhere: every free cell next to a tile is an invalid plate.
 * Coordinates are the caller's, the same for the tiles and the slots.
 */
export function boardPlates(tiles: ReadonlyArray<Slot>, slots: ReadonlyArray<Slot> | undefined): BoardPlate[] {
  if (!slots) return [];
  const taken = new Set(tiles.map((t) => `${t.x},${t.y}`));
  const plates = new Map<string, BoardPlate>();
  for (const s of slots) plates.set(`${s.x},${s.y}`, { x: s.x, y: s.y, state: "playable" });
  const invalid: BoardPlate[] = [];
  for (const t of tiles) {
    for (const [dx, dy] of SIDES) {
      const [x, y] = [t.x + dx, t.y + dy];
      const key = `${x},${y}`;
      if (taken.has(key) || plates.has(key)) continue;
      const plate: BoardPlate = { x, y, state: "invalid" };
      plates.set(key, plate);
      invalid.push(plate);
    }
  }
  invalid.sort((a, b) => b.y - a.y || a.x - b.x);
  return [...[...plates.values()].filter((p) => p.state !== "invalid"), ...invalid];
}

/** The four rotations, 1 North to 4 West. */
export const ORIENTATIONS = [1, 2, 3, 4] as const;

/** The next rotation: all four in turn. Only the Tutorial uses it (its own rules, until #546); the boards use `nextValid`. */
export function nextOrientation(orientation: number): number {
  return (orientation % 4) + 1;
}

/**
 * The next of the `valid` rotations after `orientation`, clockwise (1 North to 4 West, then round): the first valid one
 * after it, or `orientation` itself when it is the only one. Empty `valid`: `orientation` unchanged.
 */
export function nextValid(orientation: number, valid: ReadonlyArray<number>): number {
  for (let step = 1; step <= 4; step++) {
    const o = ((orientation - 1 + step) % 4) + 1;
    if (valid.includes(o)) return o;
  }
  return orientation;
}

/**
 * Every slot the tile in hand may take in any rotation (`slotsAt` of each), once each, in the order first seen, with
 * `fits` where the current `orientation` fits.
 */
export function boardSlots(slotsAt: (orientation: number) => Slot[], orientation: number): BoardSlot[] {
  const all = new Map<string, BoardSlot>();
  for (const o of ORIENTATIONS) {
    for (const s of slotsAt(o)) {
      const key = `${s.x},${s.y}`;
      const slot = all.get(key) ?? { x: s.x, y: s.y, fits: false };
      if (o === orientation) slot.fits = true;
      all.set(key, slot);
    }
  }
  return [...all.values()];
}

export interface PlacementInput {
  /** The tile in hand's plan, null with no tile (or one the viewer cannot play). */
  plan: number | null;
  /** `boardSlots` of the tile in hand. */
  slots: BoardSlot[];
  /** The slot chosen (the tile placed, not sent). */
  chosen: Slot | null;
  /** The cell under the pointer, a slot or not. */
  hovered: Slot | null;
  orientation: number;
  /** The rotations the tile fits at a cell (the engine's legality). */
  orientationsAt: (cell: Slot) => number[];
}

export interface PlacementView {
  phase: PlacementPhase;
  /** The move as the ghost shows it: the chosen slot at the current rotation, or a hovered slot (its rotation that fits). */
  move: { x: number; y: number; orientation: number } | null;
  /** The tile drawn on its slot: placed (chosen) or a hover preview; `fits` false: red. */
  ghost: BoardGhost | null;
  /** Confirm may send `move`: a placed tile whose rotation fits. */
  canConfirm: boolean;
}

/**
 * The placement state from the board's inputs. A hovered slot (the pointer, not a choice) shows the tile in the rotation
 * a click would choose: the current one where it fits, else the first that does, so a hover is never red.
 */
export function placementView({ plan, slots, chosen, hovered, orientation, orientationsAt }: PlacementInput): PlacementView {
  if (plan === null) return { phase: "idle", move: null, ghost: null, canConfirm: false };
  if (chosen) {
    const fits = orientationsAt(chosen).includes(orientation);
    const move = { x: chosen.x, y: chosen.y, orientation };
    return { phase: fits ? "placed" : "placed-red", move, ghost: { ...move, plan, placed: true, fits }, canConfirm: fits };
  }
  const slot = hovered ? slots.find((s) => same(s, hovered)) : undefined;
  if (!slot) return { phase: "in-hand", move: null, ghost: null, canConfirm: false };
  const fits = orientationsAt(slot);
  const turn = fits.includes(orientation) ? orientation : fits[0];
  if (turn === undefined) return { phase: "in-hand", move: null, ghost: null, canConfirm: false };
  const move = { x: slot.x, y: slot.y, orientation: turn };
  return { phase: "in-hand", move, ghost: { ...move, plan, placed: false, fits: true }, canConfirm: false };
}

/** How long a confirm stays handed to the board after the renderer's fade (`motion.confirmMs`): its last frames. */
export const CONFIRM_MARGIN_MS = 300;

/** The confirm's hold for a fade of `confirmMs` (the renderer's default unless the board's settings change it). */
export function confirmHoldMs(confirmMs: number = DEFAULT_PLACEMENT_SETTINGS.motion.confirmMs): number {
  return Math.max(0, confirmMs) + CONFIRM_MARGIN_MS;
}

/**
 * The confirm's green fade: `flash(ghost)` hands the board the confirmed tile for `confirmHoldMs(confirmMs)` (each flash a
 * new key, so the same cell twice fades twice), then null.
 */
export function useConfirmFlash(confirmMs?: number): [(BoardGhost & { key: number }) | null, (ghost: BoardGhost) => void] {
  const holdMs = confirmHoldMs(confirmMs);
  const [confirmed, setConfirmed] = useState<(BoardGhost & { key: number }) | null>(null);
  const count = useRef(0);
  const flash = useCallback((ghost: BoardGhost) => {
    count.current += 1;
    setConfirmed({ ...ghost, placed: false, fits: true, key: count.current });
  }, []);
  useEffect(() => {
    if (!confirmed) return;
    const id = setTimeout(() => setConfirmed(null), holdMs);
    return () => clearTimeout(id);
  }, [confirmed, holdMs]);
  return [confirmed, flash];
}

/**
 * The Training and Challenge boards' placement: the rotation, the slot chosen and hovered, the lit slots, the ghost and
 * the confirm's flash, from the session's legality (`slotsAt`, `orientationsAt`). `resetKey` changes with a new tile in
 * hand: the slot and the rotation chosen for the last one go.
 */
export function usePlacement({
  plan,
  slotsAt,
  orientationsAt,
  version,
  resetKey,
  confirmMs,
}: {
  plan: number | null;
  slotsAt: (orientation: number) => Slot[];
  orientationsAt: (cell: Slot) => number[];
  /** Changes whenever the session's state does (the slots are those of the tile now in hand). */
  version: unknown;
  resetKey: unknown;
  /** The renderer's confirm fade (`placement.motion.confirmMs` of the board's settings); unset, the default. */
  confirmMs?: number;
}) {
  const [orientation, setOrientation] = useState(1);
  const [chosen, setChosen] = useState<Slot | null>(null);
  const [hovered, setHovered] = useState<Slot | null>(null);
  const [confirmed, flash] = useConfirmFlash(confirmMs);

  useEffect(() => {
    setChosen(null);
    setOrientation(1);
  }, [resetKey]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handSlots = useMemo(() => (plan === null ? [] : boardSlots(slotsAt, orientation)), [plan, slotsAt, orientation, version]);
  // Undefined with no tile in hand (no plate); an empty list is a tile that fits nowhere (invalid plates all around).
  const slots = plan === null ? undefined : handSlots;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const view = useMemo(() => placementView({ plan, slots: handSlots, chosen, hovered, orientation, orientationsAt }), [plan, handSlots, chosen, hovered, orientation, orientationsAt, version]);

  // A cell is chosen in a rotation the tile fits there: the current one, unless it does not fit.
  const choose = useCallback(
    (cell: Slot) => {
      const fits = orientationsAt(cell);
      if (fits.length === 0) return;
      setChosen(cell);
      if (!fits.includes(orientation)) setOrientation(fits[0]!);
    },
    [orientationsAt, orientation],
  );
  // The rotations the tile fits at the chosen cell: the bubble shows Rotate when there is more than one.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rotations = useMemo(() => (chosen ? orientationsAt(chosen) : []), [chosen, orientationsAt, version]);
  const rotate = useCallback(() => setOrientation((o) => nextValid(o, rotations)), [rotations]);
  /**
   * The move was accepted (the page says when: Training once `place` resolves true, Challenge once the engine's prediction
   * takes it): the slot goes, the board flashes green. A refusal calls nothing: the tile stays placed.
   */
  const accepted = useCallback(
    (ghost: BoardGhost | null = view.ghost) => {
      if (ghost) flash(ghost);
      setChosen(null);
    },
    [view.ghost, flash],
  );
  const clear = useCallback(() => setChosen(null), []);

  return { orientation, setOrientation, rotations, chosen, hovered, setHovered, slots, ...view, confirmed, choose, rotate, accepted, clear };
}
