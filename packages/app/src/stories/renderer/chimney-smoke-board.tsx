import { useCallback, useEffect, useMemo, useState } from "react";
import { GameCanvas } from "@paved/renderer/react";
import {
  resolveSmokeSettings,
  type GameScene,
  type QualityTier,
  type RendererSettingsInput,
  type Season,
  type SmokeLook,
  type SmokeLookName,
  type SmokeSettings,
  type TileRenderData,
} from "@paved/renderer";
import { getPlanKey, Plan } from "@paved/game-core";
import { toRenderTiles } from "../../components/containers/board-viewport";
import { APP_ASSETS, APP_MANIFEST } from "../../mocks/assets";
import { BOARD_72 } from "../../mocks/board";
import { PHONE_PLAY_DISTANCE } from "./birds-board";
import { skinsFor } from "./skins-board";
import { weatherDayNight } from "./weather-board";

/** The 19 plans' keys, in plan order. */
export const SMOKE_PLANS = Array.from({ length: 19 }, (_, i) => getPlanKey(Plan.from(i + 1).value));

/** One tile, or the recorded 72-tile board. */
export type SmokeLayout = "tile" | "board";
/** The game's opening camera, a phone's play distance at the game's tilt, or close on the one tile. */
export type SmokeView = "game" | "phone-play" | "close";

export interface ChimneySmokeBoardProps {
  layout: SmokeLayout;
  /** The tile of the "tile" layout. */
  plan: string;
  /** Every plan on its Forest variants (their smoking chimneys), or the base models. */
  forest: boolean;
  /** The wheel's fixed season, held at its day (or its night). */
  season: Season;
  /** Two seconds after the board is up, the wheel turns to this season (the smoke fades in or out); null, it stays. */
  fadeTo: Season | null;
  /** Four seconds after that, the wheel turns again, to this season; null, it stays. */
  fadeThen?: Season | null;
  /** The tile layout: the tile starts pending (the tile in hand: its white voxels), and is placed and dropped two seconds after the board is up. */
  place?: boolean;
  time: "day" | "night";
  view: SmokeView;
  /**
   * The look (#770, open point 2). Its knobs below are overrides: unset, the look's own value (`SMOKE_LOOKS`), so a change of look
   * changes them all; set (a control moved), that value over either look.
   */
  look: SmokeLookName;
  opacity?: number;
  puffs?: number;
  lifeSeconds?: number;
  rise?: number;
  sizeStart?: number;
  sizeEnd?: number;
  swirl?: number;
  billow?: number;
  stretch?: number;
  drift?: number;
  color?: string;
  shade?: string;
  /** Winter's thickness (1 the look as it is). */
  winterAmount: number;
  /** Spring's smoke on (owner: on for a start; it may lose it later). */
  spring: boolean;
  fadeSeconds: number;
  /** The cloud shadows' wind: the plume bends along it. */
  windDirection: number;
  windSpeed: number;
  /** The 'Ambient effects' setting, reduced motion and the tier: no smoke under any of them, the white voxels shown instead. */
  enabled: boolean;
  reducedMotion: boolean;
  quality: QualityTier | "auto";
}

const LOOK_KEYS = ["opacity", "puffs", "lifeSeconds", "rise", "sizeStart", "sizeEnd", "swirl", "billow", "stretch", "drift", "color", "shade"] as const satisfies ReadonlyArray<keyof SmokeLook>;

const tileOf = (plan: number, pending = false): TileRenderData => ({ game_id: 1, id: 1, player_id: "0x0", plan, orientation: 1, x: 0, y: 0, worldX: 0, worldZ: 0, pending });
const BOARD_TILES = toRenderTiles(BOARD_72.tiles, 1);
const FOREST_SKINS = skinsFor("all");
const NO_SKINS = skinsFor("none");

const p95 = (values: number[]) => (values.length ? [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * 0.95))]! : 0);

/** The controls as the smoke's settings (on: the scene draws it, as a board does with `BOARD_SMOKE`). */
export function smokeInput(props: ChimneySmokeBoardProps): SmokeSettings {
  return resolveSmokeSettings({
    look: props.look,
    // Only the knobs that were set: the others are the look's own.
    custom: Object.fromEntries(LOOK_KEYS.filter((k) => props[k] !== undefined).map((k) => [k, props[k]])) as Partial<SmokeLook>,
    fadeSeconds: props.fadeSeconds,
    seasons: { winter: { amount: props.winterAmount }, spring: { enabled: props.spring } },
  });
}

interface Readout {
  season: string;
  mode: string;
  chimneys: number;
  puffs: number;
  presence: number;
  hiddenTriangles: number;
  voxelsHidden: boolean;
  smokeDraws: number;
  drawCalls: number;
  cpuP95: number;
  framesPerSecond: number;
  loop: string;
  webgl: string;
}

/**
 * The chimney smoke (CHIMNEY-SMOKE-1 and -2, #770) on one tile or on the recorded 72-tile board, the season held by the wheel, as
 * a board draws it: the scene's own smoke (`RendererSettings.smoke` on, as the app's boards set it), which loads its chunk, finds
 * each drawn model type's chimneys, smoking and bare, places their mouths on the ambient loop, and swaps the placed tiles to their
 * types' smoke-free twins. The white smoke voxels are hidden while the smoke can be drawn (in summer too: neither smoke nor white
 * voxels), and shown under the Low tier, reduced motion or 'Ambient effects' off (owner, 2026-10-25); the pending tile keeps them.
 * Every knob of the look is a control; the readout gives the chimneys, the puffs, the smoke's draws and the frame's, and the
 * frame's CPU time, p95. The scene is exposed to the measuring scripts as `window.__smokeScene`.
 */
export function ChimneySmokeBoard(props: ChimneySmokeBoardProps) {
  const { layout, plan, forest, view, fadeTo, fadeThen = null, place = false, enabled, reducedMotion, quality, windDirection, windSpeed } = props;
  const [scene, setScene] = useState<GameScene | null>(null);
  const [ready, setReady] = useState(false);
  const [readout, setReadout] = useState<Readout | null>(null);
  /** The wheel's turns taken since the board is up (`fadeTo`, then `fadeThen`); the tile placed (`place`). */
  const [turned, setTurned] = useState(0);
  const [dropped, setDropped] = useState(false);
  /** Bumped when the chimneys drawn change (the models come in): the camera is set again after the board's own fit. */
  const [placed, setPlaced] = useState(0);
  const pending = layout === "tile" && place && !dropped;
  const tiles = useMemo(() => (layout === "tile" ? [tileOf(Math.max(0, SMOKE_PLANS.indexOf(plan)) + 1, pending)] : BOARD_TILES), [layout, plan, pending]);
  const skins = forest ? FOREST_SKINS : NO_SKINS;
  const close = view === "close" || layout === "tile";
  const season = (turned >= 2 && fadeThen) || (turned >= 1 && fadeTo) || props.season;
  const dayNightKey = JSON.stringify(weatherDayNight({ wheel: "fixed", season, time: props.time, speed: 1, reducedMotion }));
  const smokeKey = JSON.stringify(smokeInput(props));
  const settings = useMemo<RendererSettingsInput>(
    () => ({
      quality,
      dayNight: JSON.parse(dayNightKey) as RendererSettingsInput["dayNight"],
      ambient: { enabled, reducedMotion, clouds: { enabled: true, windDirection, windSpeed } },
      // The scene's own smoke, on as a board's (`BOARD_SMOKE`), with the study's look and seasons.
      smoke: JSON.parse(smokeKey) as SmokeSettings,
      // Close: the board's own frame (CAMERA-FIT) around one cell, with no ring of free cells round it.
      cameraFit: close ? { floorCells: 1, ring: 0 } : undefined,
    }),
    [quality, dayNightKey, enabled, reducedMotion, windDirection, windSpeed, smokeKey, close],
  );

  const onReady = useCallback((s: GameScene) => {
    setScene(s);
    (window as unknown as { __smokeScene?: GameScene }).__smokeScene = s;
  }, []);

  // The wheel's turns: to `fadeTo` two seconds after the board is up, then to `fadeThen` four seconds later.
  useEffect(() => {
    setTurned(0);
    if (!ready || !fadeTo) return;
    const first = window.setTimeout(() => setTurned(1), 2000);
    const second = fadeThen ? window.setTimeout(() => setTurned(2), 6000) : 0;
    return () => {
      clearTimeout(first);
      clearTimeout(second);
    };
  }, [ready, fadeTo, fadeThen]);

  // The placement: the pending tile placed two seconds after the board is up, and dropped (its smoke's voxels do not fall).
  useEffect(() => {
    setDropped(false);
    if (!ready || !place) return;
    const id = window.setTimeout(() => setDropped(true), 2000);
    return () => clearTimeout(id);
  }, [ready, place]);
  useEffect(() => {
    if (scene && dropped) void scene.dropTile({ id: 1, game_id: 1 });
  }, [scene, dropped]);

  // The chimneys drawn change as the models come in: the camera is set again.
  const chimneys = readout?.chimneys ?? 0;
  useEffect(() => setPlaced((n) => n + 1), [chimneys]);

  // The camera: the game's opening (`focusBoard`), a phone's play distance at the game's tilt, or close on the tile.
  useEffect(() => {
    if (!scene) return;
    scene.focusBoard();
    if (view === "phone-play" && layout === "board") {
      const target = scene.controls.controls.target;
      scene.controls.frame({ x: target.x, z: target.z }, PHONE_PLAY_DISTANCE);
    }
    scene.requestRender();
    let id = requestAnimationFrame(() => (id = requestAnimationFrame(() => setReady(true))));
    return () => cancelAnimationFrame(id);
  }, [scene, view, layout, tiles, placed]);

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
      },
    });
    const timer = window.setInterval(() => {
      while (stamps.length && stamps[0]! < performance.now() - 1000) stamps.shift();
      const ambient = scene.getAmbient();
      const stats = scene.getSmoke();
      const point = scene.getDayNight();
      if (!stats) return;
      setReadout({
        season: point ? `${point.season} ${point.phase}` : "no cycle",
        mode: stats.mode,
        chimneys: stats.chimneys,
        puffs: stats.puffs,
        presence: stats.presence,
        hiddenTriangles: stats.hiddenTriangles,
        voxelsHidden: stats.voxelsHidden,
        smokeDraws: stats.drawCalls,
        drawCalls: calls,
        cpuP95: p95(times),
        framesPerSecond: stamps.length,
        loop: ambient.running ? `loop on, cap ${ambient.fps} fps` : "loop off",
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
    <div className="relative h-full min-h-dvh w-full bg-board" data-ready={(ready && !!readout && readout.chimneys > 0) || undefined}>
      <GameCanvas tiles={tiles} skins={skins} basePath={APP_ASSETS} manifest={APP_MANIFEST} settings={settings} onReady={onReady} style={{ position: "absolute", inset: 0 }} />
      {readout && (
        <output className="pointer-events-none absolute top-3 left-3 max-w-[calc(100%-1.5rem)] rounded-md bg-background/80 px-3 py-2 font-mono text-xs text-foreground numeric" aria-live="off">
          <div>
            {readout.season} · smoke {readout.mode}, {Math.round(readout.presence * 100)} % · {readout.chimneys} chimneys · {readout.puffs} puffs
          </div>
          <div>
            white voxels on the placed tiles {readout.voxelsHidden ? `hidden (${readout.hiddenTriangles} triangles a type)` : "shown"} · {readout.smokeDraws} smoke draws of {readout.drawCalls}
          </div>
          <div>
            {readout.framesPerSecond} frames/s · CPU p95 {readout.cpuP95.toFixed(2)} ms · {readout.loop} · {readout.webgl}
          </div>
        </output>
      )}
    </div>
  );
}
