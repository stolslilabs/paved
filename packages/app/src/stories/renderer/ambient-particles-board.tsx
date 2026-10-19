import { useCallback, useEffect, useMemo, useState } from "react";
import { GameCanvas } from "@paved/renderer/react";
import { DAY_PHASE_AT, DEFAULT_AMBIENT_PARTICLES, PLAY_DEFAULT_POLAR_ANGLE, TILE_SIZE, type GameScene, type QualityTier, type RendererSettingsInput, type TileRenderData } from "@paved/renderer";
import { getPlanKey, Plan } from "@paved/game-core";
import { toRenderTiles } from "../../components/containers/board-viewport";
import { APP_ASSETS } from "../../mocks/assets";
import { BOARD_72 } from "../../mocks/board";
import { viewPose, type Bounds, type View } from "./outlines-tour";
import { SKINS_MANIFEST, skinsFor } from "./skins-board";

/** The plans with water (rivers, ponds, the cities' fountains) and the two wonders: the tiles that emit. */
export const WATER_PLANS = ["rfffrfcfr", "rfrfrfcff", "cccccfffc", "ccccccccc", "cccccfrfc", "ffffcccff", "rfffrfffr", "rfrfffcfr"] as const;
export const WONDER_PLANS = ["wffffffff", "wfffffffr"] as const;
export const EMITTING_PLANS = [...WATER_PLANS, ...WONDER_PLANS] as const;
export type EmittingPlan = (typeof EMITTING_PLANS)[number];

/** One tile isolated, the 19 plans side by side, or the recorded 72-tile board. */
export type AmbientLayout = "tile" | "all-tiles" | "board";
/** The game's own camera (where and how tilted it opens, `focusBoard`), a phone's play distance at that tilt, or a tour view. */
export type AmbientView = "game" | "phone-play" | View;

export interface AmbientParticlesBoardProps {
  layout: AmbientLayout;
  /** The tile of the "tile" layout. */
  plan: EmittingPlan;
  view: AmbientView;
  /** Camera distance; unset, the view's own. */
  distance?: number;
  /** The effects on: the 'Ambient effects' setting. */
  enabled: boolean;
  /** The particles' count: each kind's density per emitter voxel, its cap per tile and the board's cap. */
  waterDensity: number;
  waterPerTile: number;
  wonderDensity: number;
  wonderPerTile: number;
  boardCap: number;
  /** A particle's diameter (world units), a multiplier of each kind's default, and its floor and cap on screen (CSS px). */
  size: number;
  minPixels: number;
  maxPixels: number;
  /** How fast the particles live (1: each kind's default life; 2: twice as fast). */
  speed: number;
  /** A multiplier of each kind's rise and drift. */
  rise: number;
  drift: number;
  /** A multiplier of each kind's opacity. */
  opacity: number;
  waterColor: string;
  wonderColor: string;
  /** The night glow's strength, and the board held at night to judge it (the day and night cycle frozen there). */
  nightGlow: number;
  night: boolean;
  zoomFade: boolean;
  /** The ambient loop's rate cap. */
  fps: number;
  quality: QualityTier | "auto";
  forest: boolean;
}

const planIndex = (key: string): number => {
  for (let plan = 1; plan <= 19; plan++) if (getPlanKey(Plan.from(plan).value) === key) return plan;
  throw new Error(`no plan ${key}`);
};

const tile = (plan: number, i: number, worldX: number, worldZ: number): TileRenderData => ({ game_id: 1, id: i + 1, player_id: "0x0", plan, orientation: 1, x: worldX, y: worldZ, worldX, worldZ });

/** The 19 plans, one tile each, on a 5 x 4 board. */
const ALL_TILES: TileRenderData[] = Array.from({ length: 19 }, (_, i) => tile(i + 1, i, (i % 5) - 2, Math.floor(i / 5) - 2));
const BOARD_TILES = toRenderTiles(BOARD_72.tiles, 1);

function boundsOf(tiles: TileRenderData[]): Bounds {
  const xs = tiles.map((t) => t.worldX * TILE_SIZE);
  const zs = tiles.map((t) => t.worldZ * TILE_SIZE);
  const [minX, maxX, minZ, maxZ] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  const [cx, cz] = [(minX + maxX) / 2, (minZ + maxZ) / 2];
  const near = xs.map((x, i) => ({ x, z: zs[i], d: (x - cx) ** 2 + (zs[i] - cz) ** 2 })).sort((a, b) => a.d - b.d)[0];
  return { minX, maxX, minZ, maxZ, anchor: [near.x, near.z] };
}

/**
 * The distance a player on a phone plays at: a tile about 1.5 times the opening size S (`OUTLINE_FADE_START`, where the outlines
 * and so the particles are fully on), 160 of the opening's 240.
 */
const PHONE_PLAY_DISTANCE = 160;

/** The readout: the particles drawn, the frame's draws (every pass) and its CPU time, p95 over the last 120 frames drawn. */
interface Readout {
  water: number;
  wonder: number;
  particleDraws: number;
  drawCalls: number;
  cpuP95: number;
  framesPerSecond: number;
  running: boolean;
  fps: number;
  webgl: string;
}

const p95 = (values: number[]) => (values.length ? [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * 0.95))]! : 0);

/**
 * The ambient particles (AMBIENT-PARTICLES, #572) on one tile, on the 19 plans side by side, or on the recorded 72-tile board, at
 * the game's camera or any of the tour's views. Every knob of `RendererSettings.ambient`, and a readout of what is drawn: the
 * particles, the draw calls of a frame (all passes; the particles add one per kind) and the CPU time of a frame (p95). A capture on
 * software WebGL (the readout names the renderer) shows layout and colour, never a frame time. The scene is exposed to the
 * measuring scripts as `window.__ambientScene`.
 */
export function AmbientParticlesBoard(props: AmbientParticlesBoardProps) {
  const { layout, plan, view, distance, quality, forest, night } = props;
  const [scene, setScene] = useState<GameScene | null>(null);
  const [ready, setReady] = useState(false);
  const [readout, setReadout] = useState<Readout | null>(null);
  const tiles = useMemo(() => (layout === "tile" ? [tile(planIndex(plan), 0, 0, 0)] : layout === "all-tiles" ? ALL_TILES : BOARD_TILES), [layout, plan]);
  const bounds = useMemo(() => boundsOf(tiles), [tiles]);
  const d = DEFAULT_AMBIENT_PARTICLES;
  const settings = useMemo<RendererSettingsInput>(
    () => ({
      quality,
      dayNight: night ? { enabled: true, freezeAt: DAY_PHASE_AT.night, reducedMotion: false } : { enabled: false },
      ambient: {
        enabled: props.enabled,
        fps: props.fps,
        reducedMotion: false,
        particles: {
          water: {
            density: props.waterDensity,
            perTile: props.waterPerTile,
            size: d.water.size * props.size,
            lifeSeconds: d.water.lifeSeconds / props.speed,
            rise: d.water.rise * props.rise,
            drift: d.water.drift * props.drift,
            opacity: Math.min(1, d.water.opacity * props.opacity),
            color: props.waterColor,
          },
          wonder: {
            density: props.wonderDensity,
            perTile: props.wonderPerTile,
            size: d.wonder.size * props.size,
            lifeSeconds: d.wonder.lifeSeconds / props.speed,
            rise: d.wonder.rise * props.rise,
            drift: d.wonder.drift * props.drift,
            opacity: Math.min(1, d.wonder.opacity * props.opacity),
            color: props.wonderColor,
          },
          boardCap: props.boardCap,
          minPixels: props.minPixels,
          maxPixels: props.maxPixels,
          nightGlow: props.nightGlow,
          zoomFade: props.zoomFade,
        },
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify([props.enabled, props.fps, props.waterDensity, props.waterPerTile, props.wonderDensity, props.wonderPerTile, props.boardCap, props.size, props.minPixels, props.maxPixels, props.speed, props.rise, props.drift, props.opacity, props.waterColor, props.wonderColor, props.nightGlow, props.zoomFade, quality, night])],
  );
  const onReady = useCallback((s: GameScene) => {
    setScene(s);
    (window as unknown as { __ambientScene?: GameScene }).__ambientScene = s;
  }, []);

  // The camera: the game's opening (`focusBoard`, at the distance it opens at), the phone's play distance, or a tour view.
  useEffect(() => {
    if (!scene) return;
    if (view === "game" || view === "phone-play") {
      scene.focusBoard();
      const target = scene.controls.controls.target;
      const at = distance ?? (view === "game" ? scene.camera.position.distanceTo(target) : PHONE_PLAY_DISTANCE);
      // At the game's own tilt (TILT-54: the board opens 27 degrees from straight down).
      scene.camera.position.set(target.x, target.y + at * Math.cos(PLAY_DEFAULT_POLAR_ANGLE), target.z + at * Math.sin(PLAY_DEFAULT_POLAR_ANGLE));
      scene.camera.lookAt(target);
    } else {
      const pose = viewPose(view, bounds, distance);
      scene.controls.controls.target.set(...pose.target);
      scene.camera.position.set(...pose.position);
      scene.camera.lookAt(...pose.target);
    }
    scene.requestRender();
    let id = requestAnimationFrame(() => (id = requestAnimationFrame(() => setReady(true))));
    return () => cancelAnimationFrame(id);
  }, [scene, view, distance, bounds, tiles]);

  // The readout: the frame observer times each frame drawn and counts its draws (three's counters kept over the passes).
  useEffect(() => {
    if (!scene) return;
    const info = scene.renderer.info;
    info.autoReset = false;
    const times: number[] = [];
    const stamps: number[] = [];
    let calls = 0;
    scene.setFrameObserver({
      beforeRender: () => info.reset(),
      afterTick: ({ cpuMs, rendered }) => {
        if (!rendered) return;
        calls = info.render.calls;
        times.push(cpuMs);
        stamps.push(performance.now());
        if (times.length > 120) times.shift();
        while (stamps.length && stamps[0]! < performance.now() - 1000) stamps.shift();
      },
    });
    const timer = window.setInterval(() => {
      const ambient = scene.getAmbient();
      setReadout({
        water: ambient.water,
        wonder: ambient.wonder,
        particleDraws: ambient.drawCalls,
        drawCalls: calls,
        cpuP95: p95(times),
        framesPerSecond: stamps.length,
        running: ambient.running,
        fps: ambient.fps,
        webgl: scene.getWebGL().software ? "software WebGL: no frame time" : "GPU",
      });
    }, 500);
    return () => {
      clearInterval(timer);
      scene.setFrameObserver(null);
      info.autoReset = true;
    };
  }, [scene]);

  return (
    <div className="relative h-full min-h-dvh w-full bg-board" data-ready={ready || undefined}>
      <GameCanvas
        tiles={tiles}
        basePath={APP_ASSETS}
        skins={forest ? FOREST_SKINS : undefined}
        manifest={forest ? SKINS_MANIFEST : undefined}
        settings={settings}
        onReady={onReady}
        style={{ position: "absolute", inset: 0 }}
      />
      {readout && (
        <output className="absolute top-3 left-3 rounded-md bg-background/80 px-3 py-2 font-mono text-xs text-foreground numeric" aria-live="off">
          {readout.running ? `loop on, cap ${readout.fps} fps` : "loop off"} · {readout.water} motes, {readout.wonder} sparkles · {readout.particleDraws} particle draws of{" "}
          {readout.drawCalls} · {readout.framesPerSecond} frames/s · CPU p95 {readout.cpuP95.toFixed(2)} ms · {readout.webgl}
        </output>
      )}
    </div>
  );
}

const FOREST_SKINS = skinsFor("all");
