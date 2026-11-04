import * as m from "motion/react-m";
import { useEffect } from "react";
import { UiIcon } from "../elements/ui-icon";

export interface CameraControlProps {
  /** The Camera mode on. */
  on: boolean;
  onChange: (on: boolean) => void;
}

/**
 * The home's Camera mode (#875, the owner's decisions of 2026-10-28), at the bottom right: a tap frees the village's camera (the tilt
 * from 15 to 85 degrees, the turn all the way round, every change gliding), a second tap, or Escape, leaves it, and the camera eases
 * back to the play view. CAMERA-EXPLORE (the owner's asks of 2026-11-04): an icon over its word, alone over the village as the right
 * column's buttons (no box, its 64 px square a transparent hit box): out of the mode Explore, a house on its tile with an arrow in orbit
 * round it; in the mode Exit (named Exit camera), the same house with a straight arrow going out of it, in the screen's corner (the
 * overlays gone, `data-corner`), under a hint of the controls for the pointer in use. It comes with the stage's chunk
 * (`village-stage.tsx`) (FIRST-LOAD).
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
    // Taps reach it: the overlays' box lets them through to the village (`pointer-events-none`), its controls take them back.
    <div className="pointer-events-auto flex flex-col items-end gap-2">
      {on && (
        <p key="hint" className="max-w-64 rounded-2xl bg-card/90 px-3 py-1.5 text-right text-xs text-muted-foreground shadow-lg backdrop-blur">
          <span className="pointer-coarse:hidden">Right drag turns and tilts, left drag pans, the wheel zooms</span>
          <span className="hidden pointer-coarse:inline">One finger turns and tilts, two pinch, pan and twist</span>
        </p>
      )}
      {/* One button in both states, so the focus stays on it. */}
      <m.button
        key="button"
        type="button"
        whileTap={{ scale: 0.92 }}
        onClick={() => onChange(!on)}
        aria-label={on ? "Exit camera" : "Explore"}
        data-slot="camera-control"
        className="relative grid size-16 shrink-0 cursor-pointer place-items-center outline-none"
      >
        <span aria-hidden className="flex flex-col items-center">
          <UiIcon name={on ? "exit" : "explore"} px={40} className="size-10" />
          <span className="text-outline -mt-1 text-xs leading-none font-black tracking-tight">{on ? "Exit" : "Explore"}</span>
        </span>
      </m.button>
    </div>
  );
}
