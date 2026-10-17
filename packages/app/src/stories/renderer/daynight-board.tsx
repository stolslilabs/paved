import { useCallback, useEffect, useMemo, useState } from "react";
import { GameCanvas } from "@paved/renderer/react";
import { DAY_PHASE_AT, SEASONS, TILE_SIZE, type DayPhase, type GameScene, type QualityTier, type RendererSettingsInput, type Season } from "@paved/renderer";
import { toRenderTiles } from "../../components/containers/board-viewport";
import { APP_ASSETS } from "../../mocks/assets";
import { BOARD_72 } from "../../mocks/board";
import { viewPose, type Bounds, type View } from "./outlines-tour";

export interface DayNightBoardProps {
  /** One cycle (a day and a night of one season), in seconds: 120 in the game. */
  cycleSeconds: number;
  /** Hold the cycle at one phase ("running": it moves). */
  phase: DayPhase | "running";
  /** The season it starts from, or holds at; "random" draws one per page. */
  season: Season | "random";
  /** 1: real time; 10: a whole cycle in 12 s. */
  speed: number;
  /** The city and road lights at night. */
  nightLights: boolean;
  /** The night lights' strength (an emissive radiance). */
  nightLightIntensity?: number;
  /** The night's floor: the sky light and ambient at least this share of the day's. */
  brightnessFloor?: number;
  /** Reduced motion: a still day (unset: the device's). */
  reducedMotion?: boolean;
  quality?: QualityTier | "auto";
  view: View;
  distance?: number;
  /** Draw every frame even when nothing moves, as the frame-time measures need. */
  redraw?: boolean;
  readout?: boolean;
  force?: "auto" | "on" | "off";
}

const tiles = toRenderTiles(BOARD_72.tiles, 1);

function boundsOf(): Bounds {
  const xs = tiles.map((t) => t.worldX * TILE_SIZE);
  const zs = tiles.map((t) => t.worldZ * TILE_SIZE);
  const [minX, maxX, minZ, maxZ] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  const [cx, cz] = [(minX + maxX) / 2, (minZ + maxZ) / 2];
  const near = xs.map((x, i) => ({ x, z: zs[i], d: (x - cx) ** 2 + (zs[i] - cz) ** 2 })).sort((a, b) => a.d - b.d)[0];
  return { minX, maxX, minZ, maxZ, anchor: [near.x, near.z] };
}
const BOUNDS = boundsOf();

/** The cycle's moment for a held phase: the season's index plus the phase's moment in its cycle (summer when "random"). */
export function freezeAt(season: Season | "random", phase: DayPhase): number {
  return Math.max(0, SEASONS.indexOf(season as Season)) + DAY_PHASE_AT[phase];
}

/**
 * The recorded 72-tile board under the day and night cycle (DAYNIGHT, P-73): the gradient behind it, the sun moving east to
 * west with its shadows, the moon, and the city and road lights at night. `data-ready` is set once the board is drawn at
 * the held view. The scene is exposed to the measuring scripts as `window.__dayNightScene`.
 */
export function DayNightBoard({ cycleSeconds, phase, season, speed, nightLights, nightLightIntensity, brightnessFloor, reducedMotion, quality = "auto", view, distance, redraw = false, readout = true, force = "auto" }: DayNightBoardProps) {
  const [scene, setScene] = useState<GameScene | null>(null);
  const [ready, setReady] = useState(false);
  const [where, setWhere] = useState("");
  const key = JSON.stringify([cycleSeconds, phase, season, speed, nightLights, nightLightIntensity, brightnessFloor, reducedMotion, quality, force]);
  const settings = useMemo<RendererSettingsInput>(
    () => ({
      quality,
      outlines: { force },
      dayNight: {
        enabled: true,
        cycleMs: cycleSeconds * 1000,
        speed,
        season,
        freezeAt: phase === "running" ? null : freezeAt(season, phase),
        nightLights,
        ...(nightLightIntensity === undefined ? {} : { nightLightIntensity }),
        ...(brightnessFloor === undefined ? {} : { brightnessFloor }),
        ...(reducedMotion === undefined ? {} : { reducedMotion }),
      },
    }),
    [key], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const onReady = useCallback((s: GameScene) => {
    setScene(s);
    (window as unknown as { __dayNightScene?: GameScene }).__dayNightScene = s;
  }, []);

  useEffect(() => {
    if (!scene) return;
    const pose = viewPose(view, BOUNDS, distance);
    scene.controls.controls.target.set(...pose.target);
    scene.camera.position.set(...pose.position);
    scene.camera.lookAt(...pose.target);
    scene.requestRender();
    let id = requestAnimationFrame(() => (id = requestAnimationFrame(() => setReady(true))));
    return () => cancelAnimationFrame(id);
  }, [scene, view, distance]);

  useEffect(() => {
    if (!scene || !redraw) return;
    let id = 0;
    const step = () => {
      scene.requestRender();
      id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [scene, redraw]);

  useEffect(() => {
    if (!scene || !readout) return;
    let id = 0;
    const step = () => {
      const point = scene.getDayNight();
      setWhere(point ? `${point.season} · ${point.phase} · ${(point.position * 100).toFixed(0)} % of the cycle` : "loading the cycle");
      id = window.setTimeout(step, 250);
    };
    step();
    return () => clearTimeout(id);
  }, [scene, readout]);

  return (
    <div className="relative h-full min-h-dvh w-full bg-board" data-ready={ready || undefined}>
      <GameCanvas tiles={tiles} basePath={APP_ASSETS} settings={settings} onReady={onReady} style={{ position: "absolute", inset: 0 }} />
      {readout && where && (
        <output className="absolute top-3 left-3 rounded-md bg-background/80 px-3 py-2 font-mono text-xs text-foreground numeric" aria-live="off">
          {where}
        </output>
      )}
    </div>
  );
}
