import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import type { GameScene } from "@paved/renderer";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { cn } from "../../lib/utils";

/** Where the bubble may stand, in CSS px of the board's box. */
export interface BubbleLimits {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** The bubble's size: two touch targets of 44 px (and one when there is a single choice), 4 px of padding, a 4 px gap. */
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
  /**
   * The renderer's scene and the tile's cell (the renderer's grid): the bubble follows the tile's top-right corner. Without
   * a scene (the plan view) it stands still, centred above the hand panel.
   */
  scene?: GameScene | null;
  cell?: { x: number; y: number };
  className?: string;
}

/**
 * The bubble on the tile being handled: Rotate (clockwise through the valid rotations only) and Close (cancel), with the
 * R and Escape keys. It follows the tile through pans, zooms and the compass without a render of its own: the position is
 * written to the element on the renderer's camera notifications.
 */
export function TileBubble({ rotations, onRotate, onClose, scene, cell, className }: TileBubbleProps) {
  const ref = useRef<HTMLDivElement>(null);
  const canRotate = rotations > 1;
  const size = bubbleSize(canRotate ? 2 : 1);

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
      else if ((e.key === "r" || e.key === "R") && canRotate) onRotate();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onRotate, canRotate]);

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
      {canRotate && (
        <Button variant="secondary" size="icon" className="size-11 rounded-full" onClick={onRotate} aria-label="Rotate tile" title="Rotate (R)">
          <Icon name="rotate-right" size="md" />
        </Button>
      )}
      <Button variant="ghost" size="icon" className="size-11 rounded-full" onClick={onClose} aria-label="Cancel placement" title="Cancel (Esc)">
        <Icon name="xmark" size="md" />
      </Button>
    </div>
  );
}

export default TileBubble;
