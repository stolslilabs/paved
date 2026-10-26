import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { GameScene } from "@paved/renderer";
import { cn } from "../../lib/utils";
import type { Hold } from "../../lib/use-hold";
import type { PressPhase } from "../../lib/use-press-action";
import { HoldRing } from "../elements/hold-button";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { MARGIN_PX, bubbleLimits, bubbleSize, placeBubble } from "./tile-bubble";

export interface PressBubbleProps {
  /** The button's accessible name: "Edit village". */
  label: string;
  /** A Font Awesome name drawn in the ring. */
  icon: string;
  /** The press's hold (`usePressAction`): the ring fills while the press goes on. */
  hold: Hold;
  phase: PressPhase;
  /** The button tapped (the press let go early): the action at once. */
  onTap: () => void;
  /** A press elsewhere or Escape while the bubble lingers: it goes at once. */
  onDismiss: () => void;
  /**
   * The renderer's scene and the pressed tile's cell (the renderer's grid): the bubble follows the tile's top-right corner, as the
   * tile's bubble does. Without a scene (the plan view) it stands where the caller puts it.
   */
  scene?: GameScene | null;
  cell?: { x: number; y: number };
  className?: string;
}

const SIZE = bubbleSize(1);

/**
 * The press bubble (LONGPRESS-EDIT, #799): one button by the pressed tile, its ring the press's hold, which fills as the press goes
 * on (the village's Edit, the hammer). Let go early, it lingers with its button tappable, then fades (no fade under reduced motion:
 * the ring alone moves). A press anywhere else, or Escape, hides it at once.
 */
export function PressBubble({ label, icon, hold, phase, onTap, onDismiss, scene, cell, className }: PressBubbleProps) {
  const ref = useRef<HTMLDivElement>(null);
  // The ring first drawn empty, its style flushed, then the hold's: the fill is a transition from the empty ring, even when the
  // bubble comes with the hold already started.
  const [drawn, setDrawn] = useState(false);
  useLayoutEffect(() => {
    ref.current?.getBoundingClientRect();
    setDrawn(true);
  }, []);

  const place = useCallback(() => {
    const el = ref.current;
    const box = el?.parentElement?.getBoundingClientRect();
    if (!el || !box || !scene || !cell) return;
    const corner = scene.projectCell(cell.x, cell.y);
    if (!corner) return;
    const avoid = Array.from(document.querySelectorAll("[data-bubble-avoid]"), (e) => e.getBoundingClientRect());
    const rough = placeBubble(corner, SIZE, { left: MARGIN_PX, right: box.width - MARGIN_PX, top: MARGIN_PX, bottom: box.height - MARGIN_PX });
    const at = placeBubble(corner, SIZE, bubbleLimits(box, avoid, rough.x, SIZE.width));
    el.style.transform = `translate(${Math.round(at.x)}px, ${Math.round(at.y)}px)`;
    el.style.visibility = "visible";
  }, [scene, cell?.x, cell?.y]);
  useLayoutEffect(() => {
    place();
    return scene?.onCameraChange(place);
  }, [place, scene]);

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
      data-input-surface
      data-press-bubble={phase}
      data-follows={scene ? "tile" : undefined}
      style={scene ? { visibility: "hidden" } : undefined}
      className={cn(
        "pointer-events-auto w-fit rounded-full border bg-card/95 p-1 shadow-lg backdrop-blur transition-opacity duration-200 motion-reduce:transition-none",
        scene && "absolute top-0 left-0 will-change-transform",
        phase === "fading" && "opacity-0",
        className,
      )}
    >
      <Button
        size="icon"
        aria-label={label}
        title={label}
        data-state={hold.state}
        onClick={onTap}
        onContextMenu={(e) => e.preventDefault()}
        className="relative size-11 touch-none rounded-full shadow-md select-none focus-visible:ring-offset-card [-webkit-touch-callout:none]"
      >
        <Icon name={icon} size="md" />
        <HoldRing state={drawn ? hold.state : "idle"} holdMs={hold.holdMs} />
      </Button>
    </div>
  );
}

export default PressBubble;
