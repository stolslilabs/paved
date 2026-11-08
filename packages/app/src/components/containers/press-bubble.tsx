import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { GameScene } from "@paved/renderer";
import { cn } from "../../lib/utils";
import type { Hold } from "../../lib/use-hold";
import type { PressPhase } from "../../lib/use-press-action";
import { PaintedHold } from "../elements/hold-button";
import type { UiIconName } from "../elements/ui-art";
import { Button } from "../ui/button";
import { ActionArt, PAINTED, placeActions, useFollowTile, type ActionsLayout } from "./tile-action";
import { layoutTileAction, type ActionSide } from "./tile-actions-layout";

/**
 * Where the long press's one action stands round the tile: Confirm's place among the tile's actions (TILE-ACTIONS), up and to the right.
 * There the right column decides, and its top is the held action that commits, Confirm; Edit village is that too, a hold whose end acts.
 * It is also where #799 stood its bubble, at the tile's top-right corner, and the pressing finger, which covers the tile from below,
 * never hides it.
 */
export const PRESS_SIDE: ActionSide = "top-right";

/** The button alone at its place: the tile actions' rules for one (`layoutTileAction`), no absent neighbour moving it. */
const ALONE: ActionsLayout = (outline, box, avoid) => ({ [PRESS_SIDE]: layoutTileAction(PRESS_SIDE, outline, box, avoid) });

export interface PressBubbleProps {
  /** The button's accessible name: "Edit village". */
  label: string;
  /** The painted round button (`UI_ICONS`, one of the tile actions' set): the village's Edit, the white hammer on the blue disc. */
  art: UiIconName;
  /** The press's hold (`usePressAction`): the ring fills while the press goes on. */
  hold: Hold;
  phase: PressPhase;
  /** The button tapped (the press let go early): the action at once. */
  onTap: () => void;
  /** A press elsewhere or Escape while the bubble lingers: it goes at once. */
  onDismiss: () => void;
  /**
   * The renderer's scene and the pressed tile's cell (the renderer's grid): the button follows the tile as the tile's actions do. Without
   * a scene (the plan view) it stands by its parent (the pressed cell's box) by the same rules, inside the plan's scrolling region.
   */
  scene?: GameScene | null;
  cell?: { x: number; y: number };
  className?: string;
}

/**
 * The plan view's placing: the button round its parent (the pressed cell, a box of the plan's grid) by the tile actions' rules, the
 * plan's scrolling region its room, again as the plan scrolls, or as it or a part the button keeps clear of resizes.
 */
function usePlanPlace(ref: RefObject<HTMLDivElement | null>, on: boolean) {
  useLayoutEffect(() => {
    const el = ref.current;
    const region = el?.closest<HTMLElement>("[data-slot=scroll-region]");
    if (!on || !el || !region) return;
    const place = () => {
      const tile = el.getBoundingClientRect();
      const box = region.getBoundingClientRect();
      const x = tile.left - box.left;
      const y = tile.top - box.top;
      const outline = [
        { x, y },
        { x: x + tile.width, y },
        { x: x + tile.width, y: y + tile.height },
        { x, y: y + tile.height },
      ];
      placeActions(el, { outline, box, origin: { x, y } }, ALONE);
    };
    place();
    region.addEventListener("scroll", place, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(place);
    for (const e of [region, ...document.querySelectorAll("[data-bubble-avoid]")]) observer?.observe(e);
    return () => {
      region.removeEventListener("scroll", place);
      observer?.disconnect();
    };
  }, [ref, on]);
}

/**
 * The long press's action by a tile (LONGPRESS-EDIT, #799; PRESS-BUILD: one of the tile's actions, TILE-ACTIONS): the village's Edit, a
 * painted round button out of the pressed tile at Confirm's place (`PRESS_SIDE`), a constant gap in screen px from it at every zoom,
 * kept clear of the HUD and the dock (`layoutTileAction`, the tile's actions' own rules for one), following it through pans and zooms. Its
 * ring is the press's hold, the tile actions' painted one (`PaintedHold`: the gold rail, its glow and spark, the painting swelling,
 * the burst at the end), which fills as the press goes on; at its end the action. Let go early, it lingers with its button tappable,
 * then fades (no fade under reduced motion: the ring alone moves). A press anywhere else, or Escape, hides it at once.
 */
export function PressBubble({ label, art, hold, phase, onTap, onDismiss, scene, cell, className }: PressBubbleProps) {
  const ref = useRef<HTMLDivElement>(null);
  // The ring first drawn empty, its style flushed, then the hold's: the fill is a transition from the empty ring, even when the
  // bubble comes with the hold already started.
  const [drawn, setDrawn] = useState(false);
  useLayoutEffect(() => {
    ref.current?.getBoundingClientRect();
    setDrawn(true);
  }, []);

  useFollowTile(ref, scene, cell, "", ALONE);
  usePlanPlace(ref, !scene);

  // Lingering: a press anywhere else hides it (before the press itself, which may start a new one), as Escape does.
  const lingering = phase !== "holding";
  useEffect(() => {
    if (!lingering) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onDismiss();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onDismiss();
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [lingering, onDismiss]);

  return (
    <div
      ref={ref}
      data-press-bubble={phase}
      data-follows={scene ? "tile" : undefined}
      className={cn("pointer-events-none absolute inset-0 transition-opacity duration-200 motion-reduce:transition-none", phase === "fading" && "opacity-0", className)}
    >
      <div data-side={PRESS_SIDE} style={{ visibility: "hidden" }} className="pointer-events-auto absolute top-0 left-0 flex rounded-full will-change-transform">
        <Button
          variant="ghost"
          size="icon"
          aria-label={label}
          title={label}
          data-state={hold.state}
          onClick={onTap}
          onContextMenu={(e) => e.preventDefault()}
          className={cn(PAINTED, "relative touch-none select-none [-webkit-touch-callout:none]")}
        >
          <PaintedHold glyph={<ActionArt art={art} />} state={drawn ? hold.state : "idle"} holdMs={hold.holdMs} />
        </Button>
      </div>
    </div>
  );
}

export default PressBubble;
