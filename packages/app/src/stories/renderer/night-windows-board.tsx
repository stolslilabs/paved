import { DayNightBoard } from "./daynight-board";
import type { QualityTier, DayPhase, Season } from "@paved/renderer";
import type { View } from "./outlines-tour";

export interface NightWindowsBoardProps {
  /** Both side by side, or one with the toggle `lights`. */
  layout: "side-by-side" | "single";
  /** The source shown when `layout` is "single". */
  lights: "columns" | "windows";
  /** Held at dusk or at night, or running (the ramp: the windows light one by one as the night comes). */
  phase: DayPhase | "running";
  season: Season | "random";
  /** 1: real time; 10: the cycle in 12 s, so the stagger of the ramp shows. */
  speed: number;
  view: View;
  distance?: number;
  nightLightIntensity: number;
  quality: QualityTier | "auto";
  force: "auto" | "on" | "off";
  /** Every plan on its Forest variants (their windows come from the same detection, through the skin). */
  forest: boolean;
}

/**
 * The recorded 72-tile board at night with today's lights ("columns") against the windows' ("windows") (NIGHT-WINDOWS, #513),
 * side by side (two scenes, the same clock, season and view) or one at a time with a toggle, at any of the game's views. Held at
 * dusk or at night, or running through the ramp. Software WebGL is marked: a capture there shows layout and colour, never a
 * frame time or the outlines.
 */
export function NightWindowsBoard({ layout, lights, phase, season, speed, view, distance, nightLightIntensity, quality, force, forest }: NightWindowsBoardProps) {
  const board = (source: "columns" | "windows") => (
    <div className="relative h-full min-h-dvh">
      <DayNightBoard
        cycleSeconds={120}
        phase={phase}
        season={season}
        speed={speed}
        nightLights
        lights={source}
        nightLightIntensity={nightLightIntensity}
        quality={quality}
        view={view}
        distance={distance}
        readout={false}
        force={force}
        forest={forest}
      />
      <output className="absolute bottom-3 left-3 rounded-md bg-background/80 px-3 py-2 font-mono text-xs text-foreground" aria-live="off">
        {source === "columns" ? "columns (today's night lights)" : "windows (baked per model)"}
      </output>
    </div>
  );
  return layout === "single" ? board(lights) : <div className="grid min-h-dvh grid-cols-2 gap-px bg-border">{board("columns")}{board("windows")}</div>;
}
