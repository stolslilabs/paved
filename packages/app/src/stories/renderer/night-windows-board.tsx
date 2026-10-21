import { DayNightBoard, freezeAt } from "./daynight-board";
import type { QualityTier, DayPhase, Season, WindowDetection } from "@paved/renderer";
import type { View } from "./outlines-tour";

export interface NightWindowsBoardProps {
  /** One scene, or the windows at four moments of the evening (the stagger). */
  layout: "single" | "moments";
  /** Held at dusk or at night, or running (the ramp: the windows light one by one as the night comes). */
  phase: DayPhase | "running";
  season: Season | "random";
  /** 1: real time; 10: the cycle in 12 s, so the stagger of the ramp shows. */
  speed: number;
  view: View;
  distance?: number;
  /** The windows' light (`dayNight.windowLight`): strength, reach, falloff, margin past the border, stagger. */
  windowIntensity: number;
  reach: number;
  falloff: number;
  margin: number;
  stagger: number;
  /** Which openings are found: through the walls into rooms (#571), or recesses only. */
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
 * The recorded 72-tile board with the board's night lights, the windows and doors (NIGHT-WINDOWS, #513; NIGHT-WINDOWS-2, #571;
 * the default since NIGHT-WINDOWS-DEFAULT, #583), at one moment or at four moments of the evening, at any of the game's views.
 * Held at dusk or at night, or running through the ramp. Software WebGL is marked: a capture there shows layout and colour,
 * never a frame time or the outlines.
 */
export function NightWindowsBoard({ layout, phase, season, speed, view, distance, windowIntensity, reach, falloff, margin, stagger, detection, quality, force, forest }: NightWindowsBoardProps) {
  const windowLight = { intensity: windowIntensity, reach, falloff, margin, stagger, detection };
  const board = (label: string, at?: number) => (
    <div className="relative h-full" style={{ minHeight: "50dvh" }}>
      <DayNightBoard
        cycleSeconds={120}
        phase={phase}
        at={at}
        season={season}
        speed={speed}
        nightLights
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
  const name = `windows and doors (${detection === "recesses" ? "recesses only, " : ""}reach ${reach}, falloff ${falloff}, margin ${margin}, x${windowIntensity})`;
  if (layout === "single") return <div className="min-h-dvh">{board(name)}</div>;
  const base = Math.max(0, freezeAt(season, "dawn") - 0.025);
  return (
    <div className="grid min-h-dvh gap-px bg-border" style={COLUMNS}>
      {MOMENTS.map(([label, moment]) => (
        <div key={label}>{board(`windows, ${label}`, base + moment)}</div>
      ))}
    </div>
  );
}
