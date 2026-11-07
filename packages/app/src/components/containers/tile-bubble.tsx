import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { GameScene } from "@paved/renderer";
import { Button } from "../ui/button";
import { HoldButton } from "../elements/hold-button";
import { UiIcon } from "../elements/ui-icon";
import type { UiIconName } from "../elements/ui-art";
import { cn } from "../../lib/utils";
import { haptic } from "../../lib/haptics";
import { useHold, type Hold } from "../../lib/use-hold";
import { useSfx } from "./audio-provider";
import { COACH_RING } from "./coach";
import { DiscardHold } from "./discard-hold";
import { ACTION_PX, ACTION_SIDES, actionRoom, actionsSpan, avoidOf, clampActions, tileActionPlaces, type ActionSide } from "./tile-actions-layout";

export interface TileBubbleProps {
  /** How many rotations the tile has at its cell; Rotate shows only when there is more than one. */
  rotations: number;
  onRotate: () => void;
  /** Cancels the placement: the tile goes back to the hand (the village editor's: back where it started). Escape too. */
  onClose: () => void;
  /**
   * The Cancel button shows (the default). Off: Escape alone cancels (the village editor's tile from the inventory, #756, whose
   * Cancel would do what Back to the inventory does).
   */
  cancelButton?: boolean;
  /** Discards the tile in hand: the end of a hold on the trash (`HoldButton`, destructive), as the stack's (#606). */
  onDiscard?: () => void;
  /** What a discard costs, said in its title ("Hold to discard: -50 points"); none: free. */
  discardCost?: number;
  /** Discard is enabled: no move on its way. */
  canDiscard?: boolean;
  /**
   * Sends the tile back to the inventory: the village editor's action in Discard's place (#739, #756). A tap, not a hold: nothing is
   * lost, the tile is in the inventory again.
   */
  onReturn?: () => void;
  /**
   * Validates the placement: the end of a hold on the check (`HoldButton`), the only way to place a tile on the boards (#568).
   * Unset: no Confirm (the village editor, whose tile is placed by the tap that sets it, #756): its place stays empty.
   */
  onConfirm?: () => void;
  /** The tile can be placed (its rotation fits, the points are known): Confirm is enabled. */
  canConfirm?: boolean;
  /** The move (or the editor's save) is on its way: Confirm shows a spinner and is disabled, Discard and Back to the inventory wait. */
  busy?: boolean;
  /** A Story coach mark points at the placement (Confirm is ringed) or at Discard (the trash is). */
  coach?: boolean | "place" | "discard";
  /** The tile's rotation now: a change during a hold on Confirm drops the hold (it never places a rotation not shown). */
  orientation?: number;
  /** The hold's length, ms (`HOLD_MS` by default; the stories tune it). */
  holdMs?: number;
  /**
   * The renderer's scene and the tile's cell (the renderer's grid): each action stands out of its side of the tile and follows it.
   * Without a scene (the plan view) the actions stand still in a row, where the parent puts them.
   */
  scene?: GameScene | null;
  cell?: { x: number; y: number };
  /**
   * Where the board finds Confirm's hold (TILE-HOLD, #630): a press on the placed tile starts and lets go of this same hold, so
   * Confirm's ring fills whichever of the two is held. Set while the actions are up, null once they are gone.
   */
  holdRef?: RefObject<Hold | null>;
  className?: string;
}

/** A painted action: the book's round button, the whole 44 px target; hover and press are every button's white states (`state-layer`). */
const PAINTED = "size-11 rounded-full p-0";

/** One of the actions tapped (Cancel, Rotate, Back to the inventory): the book's painted round button alone, its name for assistive technology and a desktop's tooltip. */
function ActionButton({ art, label, title, disabled, onClick }: { art: UiIconName; label: string; title: string; disabled?: boolean; onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className={PAINTED}
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={() => {
        haptic("light");
        onClick();
      }}
    >
      <Painted art={art} />
    </Button>
  );
}

/** A painted button's art at the target's size. */
function Painted({ art }: { art: UiIconName }) {
  return <UiIcon name={art} px={ACTION_PX} className="pointer-events-none size-11" />;
}

/**
 * The actions on the tile being placed (TILE-ACTIONS, after the Paved UX Book's board screen, mockup 3 of "Resume a Challenge"): one
 * painted round button out of each side of the tile, each in its place on screen whatever the compass (the owner's order of 2026-11-07:
 * the left column cancels and turns, the right one decides):
 *
 * - up and left, Cancel: the white cross on a neutral grey disc; Escape too;
 * - down and left, Rotate: the blue turning arrow, clockwise through the valid rotations only; R too;
 * - up and right, Confirm, held: the gold check, the Missions' gold rail filling round its rim (#568); Enter or Space held on it.
 *   Holding the placed tile itself holds it too, with its ring (TILE-HOLD, #630: `holdRef`);
 * - down and right, Discard, held: the white trash on red, the same rail in red filling round it, its cost in its name (#606); in the
 *   village editor, Back to the inventory in its place (the blue box and its arrow, a tap: nothing is lost).
 *
 * An action that is not offered leaves its place empty (Rotate with one valid rotation, Discard where the mode has none, Confirm and
 * Discard in the editor); the others never move. The places follow the tile through pans, zooms and the compass without a render of
 * their own: on each camera notification they are computed from the tile's outline on screen (`tileActionPlaces`), a constant gap in
 * screen px from it, kept inside the room the HUD, the hand panel and the editor's side menu leave (`data-bubble-avoid`), and written to
 * the buttons. Its own chunk (`lazy-tile-bubble.tsx`).
 */
export function TileBubble({ rotations, onRotate, onClose, cancelButton = true, onDiscard, discardCost, canDiscard = true, onReturn, onConfirm, canConfirm = true, busy = false, coach = false, orientation, holdMs, scene, cell, holdRef, className }: TileBubbleProps) {
  const ref = useRef<HTMLDivElement>(null);
  // Each rotation asked from the actions (the button or R): with the cell and the rotation, what Confirm's hold validates.
  const [turns, setTurns] = useState(0);
  const rotate = useCallback(() => {
    setTurns((t) => t + 1);
    onRotate();
  }, [onRotate]);
  const coachPlace = coach === true || coach === "place";
  const holdKey = `${cell?.x},${cell?.y}:${orientation ?? ""}:${turns}`;
  const play = useSfx();
  const canRotate = rotations > 1;

  const place = useCallback(() => {
    const el = ref.current;
    if (!el || !scene || !cell) return;
    const outline = scene.projectCellOutline(cell.x, cell.y);
    if (!outline) return;
    const box = el.getBoundingClientRect();
    const free = tileActionPlaces(outline);
    const span = actionsSpan(free);
    const avoid = Array.from(document.querySelectorAll("[data-bubble-avoid]"), avoidOf);
    const at = clampActions(free, actionRoom(box, avoid, span.x, span.width));
    for (const button of el.querySelectorAll<HTMLElement>("[data-side]")) {
      const p = at[button.dataset.side as ActionSide];
      if (!p) continue;
      button.style.transform = `translate(${Math.round(p.x - ACTION_PX / 2)}px, ${Math.round(p.y - ACTION_PX / 2)}px)`;
      button.style.visibility = "visible";
    }
  }, [scene, cell?.x, cell?.y]);

  // An action that comes or goes (Rotate, Cancel) is placed with the others.
  const shown = `${cancelButton}:${!!(onDiscard || onReturn)}:${canRotate}:${!!onConfirm}`;
  useLayoutEffect(() => {
    place();
    return scene?.onCameraChange(place);
  }, [place, scene, shown]);
  // The hand panel resizes (a refusal appears), the editor's panel or bar moves: the actions are placed again.
  useEffect(() => {
    if (!scene || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(place);
    for (const e of document.querySelectorAll("[data-bubble-avoid]")) observer.observe(e);
    return () => observer.disconnect();
  }, [scene, place]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable], [role=dialog]")) return;
      if (e.key === "Escape") onClose();
      else if ((e.key === "r" || e.key === "R") && canRotate) rotate();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, rotate, canRotate]);

  // The hold completed: the place sound of #541 with the buzz the button gives.
  const confirm = useCallback(() => {
    play("place");
    onConfirm?.();
  }, [play, onConfirm]);
  // Confirm's hold, the button's and the board's (#630): one ring whichever holds it.
  // Charged (TILE-ACTIONS): the ticks quicken as it fills, a strong buzz at the end, whether the button or the tile is held.
  const hold = useHold({ onComplete: confirm, holdMs, holdKey, disabled: !onConfirm || !canConfirm || busy, charge: true });
  useLayoutEffect(() => {
    if (holdRef) holdRef.current = hold;
  }, [holdRef, hold]);
  useLayoutEffect(() => {
    if (!holdRef) return;
    return () => {
      holdRef.current = null;
    };
  }, [holdRef]);

  const actions: Record<ActionSide, ReactNode> = {
    "top-left": cancelButton && <ActionButton art="tile-cancel" label="Cancel placement" title="Cancel (Esc)" onClick={onClose} />,
    "top-right": onConfirm && (
      <HoldButton
        painted
        label="Hold to place the tile"
        title="Hold to place"
        glyph={<Painted art="tile-confirm" />}
        hold={hold}
        disabled={!canConfirm}
        busy={busy}
        onComplete={confirm}
        className={cn(PAINTED, coachPlace && COACH_RING, coachPlace && "rounded-full")}
      />
    ),
    "bottom-left": canRotate && <ActionButton art="tile-rotate" label="Rotate tile" title="Rotate (R)" onClick={rotate} />,
    "bottom-right": onDiscard ? (
      <DiscardHold
        onDiscard={onDiscard}
        cost={discardCost}
        disabled={!canDiscard || busy}
        holdMs={holdMs}
        glyph={<Painted art="tile-discard" />}
        className={cn(PAINTED, coach === "discard" && COACH_RING, coach === "discard" && "rounded-full")}
      />
    ) : (
      onReturn && <ActionButton art="tile-return" label="Back to the inventory" title="Back to the inventory" disabled={busy} onClick={onReturn} />
    ),
  };

  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label="Tile"
      data-follows={scene ? "tile" : "hand"}
      data-tile-actions
      className={cn(scene ? "pointer-events-none absolute inset-0" : "pointer-events-auto mx-auto flex w-fit gap-1", className)}
    >
      {ACTION_SIDES.map(
        (side) =>
          actions[side] && (
            <div
              key={side}
              data-side={side}
              style={scene ? { visibility: "hidden" } : undefined}
              className={cn("flex rounded-full", scene && "pointer-events-auto absolute top-0 left-0 will-change-transform")}
            >
              {actions[side]}
            </div>
          ),
      )}
    </div>
  );
}

export default TileBubble;
