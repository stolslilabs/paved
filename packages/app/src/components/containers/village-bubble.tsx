import { useCallback, useEffect, useLayoutEffect, useRef, type CSSProperties } from "react";
import type { GameScene } from "@paved/renderer";
import { haptic } from "../../lib/haptics";
import { cn } from "../../lib/utils";
import { UiIcon } from "../elements/ui-icon";
import type { UiIconName } from "../elements/ui-art";
import { MARGIN_PX, bubbleLimits } from "./tile-bubble";

export interface VillageBubbleProps {
  /** How many rotations the tile has at its cell; Rotate shows only when there is more than one. */
  rotations: number;
  onRotate: () => void;
  /** Back to the inventory: the tile leaves the layout, its slot free. */
  onReturn: () => void;
  /** Cancel (Escape too): the tile back where it started. */
  onClose: () => void;
  /** The Cancel button shows: a lifted tile's (an inventory tile's would do what Back to the inventory does, #756). Escape cancels either. */
  cancelButton?: boolean;
  /** A save on its way: the buttons wait. */
  busy?: boolean;
  /**
   * The renderer's scene and the tile's cell (the renderer's grid): the veil stands centred above the cell's projected corner and
   * follows it. Without a scene (the plan view) it stands still where its parent puts it.
   */
  scene?: GameScene | null;
  cell?: { x: number; y: number };
  className?: string;
}

/** The gap kept between the veil's foot and the tile's corner, CSS px. */
const GAP_PX = 6;
/**
 * The veil: the home's mission preview's (HOME-EDGES: see-through, blurred, its edges faded, no border), so the icons sit in the scene
 * rather than on a panel.
 */
const VEIL: CSSProperties = {
  background: "color-mix(in oklab, var(--background) 40%, transparent)",
  backdropFilter: "blur(6px)",
  maskImage: "radial-gradient(ellipse at center, black 62%, transparent 100%)",
};

/** A part of the screen the bubble keeps clear of: its box, and whether it is the side menu (#1033). */
export interface BubbleAvoid {
  rect: DOMRect;
  side: boolean;
}

/** An element marked `data-bubble-avoid` as the bubble keeps clear of it: the side menu by its marks, not its place or size. */
export const avoidOf = (e: Element): BubbleAvoid => ({
  rect: e.getBoundingClientRect(),
  side: e.getAttribute("data-edit-panel") === "side" || e.getAttribute("data-edit-bar") === "docked",
});

/**
 * The bubble's room in `box` (#1033): the side menu from `tablet` (`data-edit-panel="side"`, its bar docked in its head:
 * `data-edit-bar="docked"`) narrows it from the right, wherever its edge falls (half a tablet's screen to the pixel, or its 22 rem
 * past the half of a narrow one); the floating bar and a phone's sheet from the top and the foot (`bubbleLimits`).
 */
export function villageBubbleRoom(box: DOMRect, avoid: readonly BubbleAvoid[], x: number, width: number) {
  const room = bubbleLimits(
    box,
    avoid.filter((a) => !a.side).map((a) => a.rect),
    x,
    width,
  );
  for (const a of avoid) if (a.side) room.right = Math.min(room.right, a.rect.left - box.left - MARGIN_PX);
  return room;
}

/** One of the bubble's buttons: the book's painted icon alone (its name for assistive technology and a desktop's tooltip). */
function BubbleButton({ art, label, title, disabled, onClick }: { art: UiIconName; label: string; title: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={() => {
        haptic("light");
        onClick();
      }}
      className="grid size-11 place-items-center rounded-full outline-none disabled:opacity-50"
    >
      <UiIcon name={art} size="md" className="drawer-icon" px={32} />
    </button>
  );
}

/**
 * The tile's actions in the home's editor (EDIT-VILLAGE, after the Paved UX Book's "Edit my village"; the owner's asks of 2026-11-05:
 * anchored in the scene as subtly as the home's mission preview, icons only): the book's three painted icons on a soft veil just above
 * the tile, no frame, no tail, no word: Rotate (the blue arrows; when the tile has more than one rotation at its cell), Back to the
 * inventory (the crate and its green arrow) and Cancel (the red cross; a lifted tile's, #756). Keys as the boards' bubble: R rotates,
 * Escape cancels. It follows the tile through pans and zooms without a render of its own (the position is written to the element on
 * the renderer's camera notifications), kept clear of the bar and the panel (`data-bubble-avoid`). Its own chunk.
 */
export function VillageBubble({ rotations, onRotate, onReturn, onClose, cancelButton = true, busy = false, scene, cell, className }: VillageBubbleProps) {
  const ref = useRef<HTMLDivElement>(null);
  const canRotate = rotations > 1;

  const place = useCallback(() => {
    const el = ref.current;
    const box = el?.parentElement?.getBoundingClientRect();
    if (!el || !box || !scene || !cell) return;
    const corner = scene.projectCell(cell.x, cell.y);
    if (!corner) return;
    const size = { width: el.offsetWidth, height: el.offsetHeight };
    // Centred over the tile's corner, a gap above it.
    const want = { x: corner.x - size.width / 2, y: corner.y - size.height - GAP_PX };
    const free = { left: MARGIN_PX, right: box.width - MARGIN_PX, top: MARGIN_PX, bottom: box.height - MARGIN_PX };
    const clamp = (x: number, y: number, l: typeof free) => ({
      x: Math.min(Math.max(x, l.left), Math.max(l.left, l.right - size.width)),
      y: Math.min(Math.max(y, l.top), Math.max(l.top, l.bottom - size.height)),
    });
    const rough = clamp(want.x, want.y, free);
    const room = villageBubbleRoom(box, Array.from(document.querySelectorAll("[data-bubble-avoid]"), avoidOf), rough.x, size.width);
    const at = clamp(want.x, want.y, room);
    el.style.transform = `translate(${Math.round(at.x)}px, ${Math.round(at.y)}px)`;
    el.style.visibility = "visible";
  }, [scene, cell?.x, cell?.y]);

  useLayoutEffect(() => {
    place();
    return scene?.onCameraChange(place);
  }, [place, scene, rotations, cancelButton]);
  // The bar or the panel resizes: the bubble is placed again.
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
      style={scene ? { ...VEIL, visibility: "hidden" } : VEIL}
      className={cn("pointer-events-auto flex w-fit items-center rounded-full px-2.5 py-0.5", scene ? "absolute top-0 left-0 will-change-transform" : "mx-auto", className)}
    >
      {canRotate && <BubbleButton art="rotate-tile" label="Rotate tile" title="Rotate (R)" onClick={onRotate} />}
      <BubbleButton art="to-inventory" label="Back to the inventory" title="Back to the inventory" disabled={busy} onClick={onReturn} />
      {cancelButton && <BubbleButton art="cancel" label="Cancel placement" title="Cancel (Esc)" onClick={onClose} />}
    </div>
  );
}

export default VillageBubble;
