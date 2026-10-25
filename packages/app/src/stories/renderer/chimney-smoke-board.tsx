import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GameCanvas } from "@paved/renderer/react";
import {
  loadChimneySmoke,
  resolveSmokeSettings,
  smokeMode,
  type ChimneySmoke,
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
import { PHONE_PLAY_DISTANCE, sourcesOf } from "./birds-board";
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
  time: "day" | "night";
  view: SmokeView;
  /** The look (#770, open point 2), and its knobs over it. */
  look: SmokeLookName;
  opacity: number;
  puffs: number;
  lifeSeconds: number;
  rise: number;
  sizeStart: number;
  sizeEnd: number;
  swirl: number;
  billow: number;
  stretch: number;
  drift: number;
  color: string;
  shade: string;
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

const tileOf = (plan: number): TileRenderData => ({ game_id: 1, id: 1, player_id: "0x0", plan, orientation: 1, x: 0, y: 0, worldX: 0, worldZ: 0 });
const BOARD_TILES = toRenderTiles(BOARD_72.tiles, 1);
const FOREST_SKINS = skinsFor("all");
const NO_SKINS = skinsFor("none");

const p95 = (values: number[]) => (values.length ? [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * 0.95))]! : 0);

/** The controls as the smoke's settings. */
export function smokeInput(props: ChimneySmokeBoardProps): SmokeSettings {
  return resolveSmokeSettings({
    look: props.look,
    custom: Object.fromEntries(LOOK_KEYS.map((k) => [k, props[k]])) as Partial<SmokeLook>,
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
  smokeDraws: number;
  drawCalls: number;
  cpuP95: number;
  framesPerSecond: number;
  loop: string;
  webgl: string;
}

/**
 * The chimney smoke (CHIMNEY-SMOKE-1, #770 PR 1) on one tile or on the recorded 72-tile board, the season held by the wheel. The
 * board does not call the smoke yet: the story loads its chunk (`loadChimneySmoke`), adds it to the board's group and registers
 * it on the scene's one ambient loop (`scene.ambient`), finds each drawn model type's chimneys, smoking and bare (`prepare`), and
 * places their mouths (`setTiles`). The white smoke voxels are hidden while the smoke can be drawn (in summer too: neither smoke
 * nor white voxels), and shown under the Low tier, reduced motion or 'Ambient effects' off (owner, 2026-10-25). Every knob of the
 * look is a control; the readout gives the chimneys, the puffs, the smoke's draws and the frame's, and the frame's CPU time, p95.
 * The scene is exposed to the measuring scripts as `window.__smokeScene`, the smoke as `window.__smoke`.
 */
export function ChimneySmokeBoard(props: ChimneySmokeBoardProps) {
  const { layout, plan, forest, view, fadeTo, enabled, reducedMotion, quality, windDirection, windSpeed } = props;
  const [scene, setScene] = useState<GameScene | null>(null);
  const [smoke, setSmoke] = useState<ChimneySmoke | null>(null);
  const [ready, setReady] = useState(false);
  const [readout, setReadout] = useState<Readout | null>(null);
  const [turned, setTurned] = useState(false);
  /** Bumped when the drawn tiles change (the models come in): the camera is set again after the board's own fit. */
  const [placed, setPlaced] = useState(0);
  const tiles = useMemo(() => (layout === "tile" ? [tileOf(Math.max(0, SMOKE_PLANS.indexOf(plan)) + 1)] : BOARD_TILES), [layout, plan]);
  const skins = forest ? FOREST_SKINS : NO_SKINS;
  const close = view === "close" || layout === "tile";
  const season = turned && fadeTo ? fadeTo : props.season;
  const dayNightKey = JSON.stringify(weatherDayNight({ wheel: "fixed", season, time: props.time, speed: 1, reducedMotion }));
  const settings = useMemo<RendererSettingsInput>(
    () => ({
      quality,
      dayNight: JSON.parse(dayNightKey) as RendererSettingsInput["dayNight"],
      ambient: { enabled, reducedMotion, clouds: { enabled: true, windDirection, windSpeed } },
      // Close: the board's own frame (CAMERA-FIT) around one cell, with no ring of free cells round it.
      cameraFit: close ? { floorCells: 1, ring: 0 } : undefined,
    }),
    [quality, dayNightKey, enabled, reducedMotion, windDirection, windSpeed, close],
  );
  const smokeKey = JSON.stringify(smokeInput(props));
  const smokeSettings = useMemo(() => JSON.parse(smokeKey) as SmokeSettings, [smokeKey]);
  const settingsRef = useRef(smokeSettings);
  settingsRef.current = smokeSettings;

  const onReady = useCallback((s: GameScene) => {
    setScene(s);
    (window as unknown as { __smokeScene?: GameScene }).__smokeScene = s;
  }, []);

  useEffect(() => {
    setTurned(false);
    if (!ready || !fadeTo) return;
    const id = window.setTimeout(() => setTurned(true), 2000);
    return () => clearTimeout(id);
  }, [ready, fadeTo]);

  // The smoke: its chunk, in the board's group, on the scene's ambient loop.
  useEffect(() => {
    if (!scene) return;
    let alive = true;
    let made: ChimneySmoke | null = null;
    let unregister = () => {};
    void loadChimneySmoke().then(({ ChimneySmoke }) => {
      if (!alive) return;
      made = new ChimneySmoke(scene.ambient.time, settingsRef.current);
      scene.tiles.getGroup().add(made.object);
      unregister = scene.ambient.register(made);
      (window as unknown as { __smoke?: ChimneySmoke }).__smoke = made;
      setSmoke(made);
    });
    return () => {
      alive = false;
      unregister();
      made?.dispose();
      setSmoke(null);
    };
  }, [scene]);

  // The settings, the mode (the tier, the 'Ambient effects', reduced motion) and the wind.
  useEffect(() => {
    if (!scene || !smoke) return;
    smoke.setSettings(smokeSettings);
    smoke.setMode(smokeMode({ enabled: smokeSettings.enabled, ambient: enabled, tier: scene.getQuality(), reducedMotion }));
    smoke.setWind(windDirection, windSpeed);
    if (smoke.needsTiles) {
      smoke.needsTiles = false;
      smoke.setTiles(sourcesOf(scene, tiles, skins), scene.tiles.getGroup());
    }
    scene.requestRender();
  }, [scene, smoke, smokeSettings, enabled, reducedMotion, quality, windDirection, windSpeed, tiles, skins]);

  // The tiles drawn (their models come in after the first frame): each type's chimneys found once, the mouths placed; and the
  // cycle's point (the season, the daylight), twice a second.
  useEffect(() => {
    if (!scene || !smoke) return;
    let last = "";
    const sync = () => {
      smoke.setCycle(scene.getDayNight());
      const sources = sourcesOf(scene, tiles, skins);
      const signature = sources.map((s) => `${s.key}@${s.tile.uuid}`).join("|");
      if (signature === last) return;
      last = signature;
      for (const source of sources) smoke.prepare(source.key, source.type);
      smoke.setTiles(sources, scene.tiles.getGroup());
      setPlaced((n) => n + 1);
      scene.requestRender();
    };
    sync();
    const id = window.setInterval(sync, 500);
    return () => clearInterval(id);
  }, [scene, smoke, tiles, skins]);

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
    if (!scene || !smoke) return;
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
      const stats = smoke.stats();
      const point = scene.getDayNight();
      setReadout({
        season: point ? `${point.season} ${point.phase}` : "no cycle",
        mode: stats.mode,
        chimneys: stats.chimneys,
        puffs: stats.puffs,
        presence: stats.presence,
        hiddenTriangles: stats.hiddenTriangles,
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
  }, [scene, smoke]);

  return (
    <div className="relative h-full min-h-dvh w-full bg-board" data-ready={(ready && !!readout && readout.chimneys > 0) || undefined}>
      <GameCanvas tiles={tiles} skins={skins} basePath={APP_ASSETS} manifest={APP_MANIFEST} settings={settings} onReady={onReady} style={{ position: "absolute", inset: 0 }} />
      {readout && (
        <output className="pointer-events-none absolute top-3 left-3 max-w-[calc(100%-1.5rem)] rounded-md bg-background/80 px-3 py-2 font-mono text-xs text-foreground numeric" aria-live="off">
          <div>
            {readout.season} · smoke {readout.mode}, {Math.round(readout.presence * 100)} % · {readout.chimneys} chimneys · {readout.puffs} puffs
          </div>
          <div>
            white voxels {readout.hiddenTriangles ? `hidden (${readout.hiddenTriangles} triangles)` : "shown"} · {readout.smokeDraws} smoke draws of {readout.drawCalls}
          </div>
          <div>
            {readout.framesPerSecond} frames/s · CPU p95 {readout.cpuP95.toFixed(2)} ms · {readout.loop} · {readout.webgl}
          </div>
        </output>
      )}
    </div>
  );
}
