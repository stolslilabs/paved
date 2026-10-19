import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { GameScene } from "@paved/renderer";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { HoldButton } from "../elements/hold-button";
import { cn } from "../../lib/utils";
import { useSfx } from "./audio-provider";
import { COACH_RING } from "./coach";

/** Where the bubble may stand, in CSS px of the board's box. */
export interface BubbleLimits {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** The bubble's size: a touch target of 44 px per button (two or three), 4 px of padding, a 4 px gap. */
export const BUTTON_PX = 44;
const PAD_PX = 4;
const GAP_PX = 4;
/** The bubble overlaps the tile's corner by this much, so it reads as attached to it. */
const OVERLAP_PX = 10;
/** The clearance kept from the box edge and from the HUD and the hand panel. */
const MARGIN_PX = 8;

export function bubbleSize(buttons: number): { width: number; height: number } {
  return { width: buttons * BUTTON_PX + (buttons - 1) * GAP_PX + 2 * PAD_PX, height: BUTTON_PX + 2 * PAD_PX };
}

/**
 * The bubble's top-left for a tile whose top-right corner is at `corner`: the bubble sits above and to the right of it,
 * overlapping by `OVERLAP_PX`, then is pushed inside `limits` (the box without the HUD and the hand panel), so it never
 * leaves the screen or goes under them.
 */
export function placeBubble(corner: { x: number; y: number }, size: { width: number; height: number }, limits: BubbleLimits): { x: number; y: number } {
  const x = Math.min(Math.max(corner.x - OVERLAP_PX, limits.left), Math.max(limits.left, limits.right - size.width));
  const y = Math.min(Math.max(corner.y - size.height + OVERLAP_PX, limits.top), Math.max(limits.top, limits.bottom - size.height));
  return { x, y };
}

/**
 * The limits of the bubble in `box`: its edges less a margin, then the elements marked `data-bubble-avoid` (the HUD, the
 * hand panel) that the bubble would overlap horizontally push the top or the bottom limit in, by the side they are on.
 */
export function bubbleLimits(box: DOMRect, avoid: Iterable<DOMRect>, x: number, width: number): BubbleLimits {
  const limits: BubbleLimits = { left: MARGIN_PX, right: box.width - MARGIN_PX, top: MARGIN_PX, bottom: box.height - MARGIN_PX };
  for (const r of avoid) {
    const left = r.left - box.left;
    if (left >= x + width || left + r.width <= x) continue;
    const top = r.top - box.top;
    if (top + r.height / 2 < box.height / 2) limits.top = Math.max(limits.top, top + r.height + MARGIN_PX);
    else limits.bottom = Math.min(limits.bottom, top - MARGIN_PX);
  }
  return limits;
}

export interface TileBubbleProps {
  /** How many rotations the tile has at its cell; Rotate shows only when there is more than one. */
  rotations: number;
  onRotate: () => void;
  /** Cancels the placement: the tile goes back to the hand. */
  onClose: () => void;
  /** Validates the placement: the end of a hold on the check (`HoldButton`), the only way to place a tile (#568). */
  onConfirm?: () => void;
  /** The tile can be placed (its rotation fits, the points are known): Validate is enabled. */
  canConfirm?: boolean;
  /** The move is on its way: Validate shows a spinner and is disabled. */
  busy?: boolean;
  /** A Story coach mark points at the placement: Validate is ringed. */
  coach?: boolean;
  /** The tile's rotation now: a change during a hold on Validate drops the hold (it never places a rotation not shown). */
  orientation?: number;
  /** The hold's length, ms (`HOLD_MS` by default; the stories tune it). */
  holdMs?: number;
  /**
   * The renderer's scene and the tile's cell (the renderer's grid): the bubble follows the tile's top-right corner. Without
   * a scene (the plan view) it stands still, centred above the hand panel.
   */
  scene?: GameScene | null;
  cell?: { x: number; y: number };
  className?: string;
}

/**
 * The bubble's buttons: 44 px, round, the focus ring offset on the bubble's card. Their hover (desktop) and pressed (touch)
 * states are every button's since #537 (`state-layer`, white at 10 % and 20 % over any fill, the gold Validate's too).
 */
const BUBBLE_BUTTON = "size-11 rounded-full focus-visible:ring-offset-card";
/** Validate, the strongest: filled with the primary colour (the default variant), raised. */
const BUBBLE_PRIMARY = "size-11 rounded-full shadow-md focus-visible:ring-offset-card";

/**
 * The bubble on the tile being handled, in this order: Close (cancel), Rotate (clockwise through the valid rotations only,
 * when there is more than one) and Validate, held to place the tile (PLACE-POLISH, #568). The primary action is last, at
 * the end the reading and the thumb reach last, as a dialog's; Rotate, the step before it, is next to it, and Close is
 * apart from both. Keys: R rotates, Escape closes, Enter or Space held on Validate places. It follows the tile through
 * pans, zooms and the compass without a render of its own: the position is written to the element on the renderer's
 * camera notifications.
 */
export function TileBubble({ rotations, onRotate, onClose, onConfirm, canConfirm = true, busy = false, coach = false, orientation, holdMs, scene, cell, className }: TileBubbleProps) {
  const ref = useRef<HTMLDivElement>(null);
  // Each rotation asked from the bubble (its button or R): with the cell and the rotation, what Validate's hold validates.
  const [turns, setTurns] = useState(0);
  const rotate = useCallback(() => {
    setTurns((t) => t + 1);
    onRotate();
  }, [onRotate]);
  const holdKey = `${cell?.x},${cell?.y}:${orientation ?? ""}:${turns}`;
  const play = useSfx();
  const canRotate = rotations > 1;
  const size = bubbleSize((canRotate ? 2 : 1) + (onConfirm ? 1 : 0));

  const place = useCallback(() => {
    const el = ref.current;
    const box = el?.parentElement?.getBoundingClientRect();
    if (!el || !box || !scene || !cell) return;
    const corner = scene.projectCell(cell.x, cell.y);
    if (!corner) return;
    const avoid = Array.from(document.querySelectorAll("[data-bubble-avoid]"), (e) => e.getBoundingClientRect());
    const rough = placeBubble(corner, size, { left: MARGIN_PX, right: box.width - MARGIN_PX, top: MARGIN_PX, bottom: box.height - MARGIN_PX });
    const at = placeBubble(corner, size, bubbleLimits(box, avoid, rough.x, size.width));
    el.style.transform = `translate(${Math.round(at.x)}px, ${Math.round(at.y)}px)`;
    el.style.visibility = "visible";
  }, [scene, cell?.x, cell?.y, size.width, size.height]);

  useLayoutEffect(() => {
    place();
    return scene?.onCameraChange(place);
  }, [place, scene]);
  // The hand panel resizes (a refusal appears): the bubble is placed again.
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

  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label="Tile"
      data-input-surface
      data-follows={scene ? "tile" : "hand"}
      style={scene ? { visibility: "hidden" } : undefined}
      className={cn(
        "pointer-events-auto flex gap-1 rounded-full border bg-card/95 p-1 shadow-lg backdrop-blur",
        scene ? "absolute top-0 left-0 will-change-transform" : "mx-auto w-fit",
        className,
      )}
    >
      <Button variant="ghost" size="icon" className={BUBBLE_BUTTON} onClick={onClose} aria-label="Cancel placement" title="Cancel (Esc)">
        <Icon name="xmark" size="md" />
      </Button>
      {canRotate && (
        <Button variant="ghost" size="icon" className={BUBBLE_BUTTON} onClick={rotate} aria-label="Rotate tile" title="Rotate (R)">
          <Icon name="rotate-right" size="md" />
        </Button>
      )}
      {onConfirm && (
        <HoldButton
          label="Hold to place the tile"
          title="Hold to place"
          icon="check"
          holdMs={holdMs}
          holdKey={holdKey}
          disabled={!canConfirm}
          busy={busy}
          onComplete={confirm}
          className={cn(BUBBLE_PRIMARY, coach && COACH_RING, coach && "rounded-full")}
        />
      )}
    </div>
  );
}

export default TileBubble;
