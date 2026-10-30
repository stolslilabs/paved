import { useEffect } from "react";
import { WorldIcon } from "../elements/world-icon";
import { Button } from "../ui/button";

export interface CameraControlProps {
  /** The Camera mode on. */
  on: boolean;
  onChange: (on: boolean) => void;
}

/**
 * The home's Camera mode (#875, the owner's decisions of 2026-10-28), beside Edit: a tap frees the village's camera (the tilt from
 * 15 to 85 degrees, the turn all the way round, every change gliding), a second tap, or Escape, leaves it, and the camera eases
 * back to the play view. In the mode the button reads Exit camera, under a hint of the controls for the pointer in use. It comes with
 * the stage's chunk (`village-stage.tsx`), with the camera's icon (FIRST-LOAD).
 */
export function CameraControl({ on, onChange }: CameraControlProps) {
  useEffect(() => {
    if (!on) return;
    const leave = (event: KeyboardEvent) => {
      if (event.key === "Escape") onChange(false);
    };
    window.addEventListener("keydown", leave);
    return () => window.removeEventListener("keydown", leave);
  }, [on, onChange]);
  return (
    <div className="flex flex-col items-end gap-2">
      {on && (
        <p key="hint" className="max-w-64 rounded-2xl bg-card/90 px-3 py-1.5 text-right text-xs text-muted-foreground shadow-lg backdrop-blur">
          <span className="pointer-coarse:hidden">Right drag turns and tilts, left drag pans, the wheel zooms</span>
          <span className="hidden pointer-coarse:inline">One finger turns and tilts, two pinch and pan</span>
        </p>
      )}
      {/* One button in both states, so the focus stays on it. */}
      <Button
        key="button"
        variant="outline"
        size={on ? "lg" : "icon"}
        onClick={() => onChange(!on)}
        aria-label={on ? "Exit camera" : "Camera"}
        className={on ? "h-14 rounded-full bg-card/90 px-5 shadow-lg backdrop-blur" : "size-14 rounded-full bg-card/90 shadow-lg backdrop-blur"}
      >
        <WorldIcon name="video" size="lg" />
        {on && <span>Exit camera</span>}
      </Button>
    </div>
  );
}
