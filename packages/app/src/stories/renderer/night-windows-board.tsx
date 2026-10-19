import { DayNightBoard, freezeAt } from "./daynight-board";
import type { QualityTier, DayPhase, Season, WindowDetection, WindowRuleSetting } from "@paved/renderer";
import type { View } from "./outlines-tour";

export interface NightWindowsBoardProps {
  /** Both side by side, one with the toggle `lights`, or the windows at four moments of the evening (the stagger). */
  layout: "side-by-side" | "single" | "moments";
  /** The source shown when `layout` is "single". */
  lights: "columns" | "windows";
  /** Held at dusk or at night, or running (the ramp: the windows light one by one as the night comes). */
  phase: DayPhase | "running";
  season: Season | "random";
  /** 1: real time; 10: the cycle in 12 s, so the stagger of the ramp shows. */
  speed: number;
  view: View;
  distance?: number;
  /** The columns' strength (today's night lights: 0.4). */
  nightLightIntensity: number;
  /** The windows' own light (NIGHT-WINDOWS-2, #571): strength, reach, falloff, margin past the border, stagger, rule. */
  windowIntensity: number;
  reach: number;
  falloff: number;
  margin: number;
  stagger: number;
  rule: WindowRuleSetting;
  /** Which openings are found: through the walls into rooms (#571), or the first pass's recesses only (#513). */
  detection: WindowDetection;
  quality: QualityTier | "auto";
  force: "auto" | "on" | "off";
  /** Every plan on its Forest variants (their windows come from the same detection, through the skin). */
  forest: boolean;
}

/** One column on a phone, two on a desktop (inline: the stories add no class to the app's CSS). */
const COLUMNS = { gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))" } as const;

/** The moments of the "moments" layout: from the first lights of the dusk to the full night, in a cycle (`DAY_PHASE_AT`). */
const MOMENTS: ReadonlyArray<readonly [string, number]> = [
  ["early dusk", 0.53],
  ["dusk", 0.57],
  ["late dusk", 0.62],
  ["night", 0.805],
];

/**
 * The recorded 72-tile board at night with today's lights ("columns") against the windows' ("windows") (NIGHT-WINDOWS, #513;
 * NIGHT-WINDOWS-2, #571), side by side (two scenes, the same clock, season and view), one at a time with a toggle, or the windows
 * at four moments of the evening, at any of the game's views. Held at dusk or at night, or running through the ramp. Software
 * WebGL is marked: a capture there shows layout and colour, never a frame time or the outlines.
 */
export function NightWindowsBoard({ layout, lights, phase, season, speed, view, distance, nightLightIntensity, windowIntensity, reach, falloff, margin, stagger, rule, detection, quality, force, forest }: NightWindowsBoardProps) {
  const windowLight = { intensity: windowIntensity, reach, falloff, margin, stagger, rule, detection };
  const board = (source: "columns" | "windows", label: string, at?: number) => (
    <div className="relative h-full" style={{ minHeight: "50dvh" }}>
      <DayNightBoard
        cycleSeconds={120}
        phase={phase}
        at={at}
        season={season}
        speed={speed}
        nightLights
        lights={source}
        nightLightIntensity={nightLightIntensity}
        windowLight={windowLight}
        quality={quality}
        view={view}
        distance={distance}
        readout={false}
        force={force}
        forest={forest}
      />
      <output className="absolute bottom-3 left-3 rounded-md bg-background/80 px-3 py-2 font-mono text-xs text-foreground" aria-live="off">
        {label}
      </output>
    </div>
  );
  const name = (source: "columns" | "windows") => (source === "columns" ? "columns (today's night lights)" : `windows (${detection === "recesses" ? "first pass: recesses, " : ""}reach ${reach}, margin ${margin}, x${windowIntensity})`);
  if (layout === "single") return <div className="min-h-dvh">{board(lights, name(lights))}</div>;
  if (layout === "moments") {
    const base = Math.max(0, freezeAt(season, "dawn") - 0.025);
    return (
      <div className="grid min-h-dvh gap-px bg-border" style={COLUMNS}>
        {MOMENTS.map(([label, moment]) => (
          <div key={label}>{board("windows", `windows, ${label}`, base + moment)}</div>
        ))}
      </div>
    );
  }
  return (
    <div className="grid min-h-dvh gap-px bg-border" style={COLUMNS}>
      {board("columns", name("columns"))}
      {board("windows", name("windows"))}
    </div>
  );
}
