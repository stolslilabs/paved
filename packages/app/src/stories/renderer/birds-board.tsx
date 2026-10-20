import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GameCanvas } from "@paved/renderer/react";
import {
  DAY_PHASE_AT,
  DEFAULT_BIRD_SETTINGS,
  PLAY_DEFAULT_POLAR_ANGLE,
  TILE_SIZE,
  loadBirds,
  resolveBirdSettings,
  skinRef,
  type BirdSettings,
  type BirdSource,
  type Birds,
  type GameScene,
  type QualityTier,
  type RendererSettingsInput,
  type TileRenderData,
  type TileSkins,
} from "@paved/renderer";
import { getPlanKey, Plan } from "@paved/game-core";
import { toRenderTiles } from "../../components/containers/board-viewport";
import { APP_ASSETS, APP_MANIFEST } from "../../mocks/assets";
import { BOARD_72 } from "../../mocks/board";
import { skinsFor } from "./skins-board";

/** The 19 plans' keys, in plan order. */
export const BIRD_PLANS = Array.from({ length: 19 }, (_, i) => getPlanKey(Plan.from(i + 1).value));

/** One tile isolated (its perches to check), or the recorded 72-tile board. */
export type BirdsLayout = "tile" | "board";
/** The game's opening camera (`focusBoard`), a phone's play distance at the game's tilt, or close on the one tile. */
export type BirdsView = "game" | "phone-play" | "close";
/** The day and night cycle running, or held at a day or at a night. */
export type BirdsTime = "cycle" | "day" | "night";

export interface BirdsBoardProps extends BirdSettings {
  layout: BirdsLayout;
  /** The tile of the "tile" layout. */
  plan: string;
  /** Every plan on its Forest variants. */
  forest: boolean;
  view: BirdsView;
  /** Camera distance; unset, the view's own. */
  distance?: number;
  time: BirdsTime;
  /** One day and night, seconds (120 in the game). */
  cycleSeconds: number;
  /** The perches drawn as small cubes. */
  perches: boolean;
  /** The ambient loop's rate cap. */
  fps: number;
  quality: QualityTier | "auto";
  /** The ambient effects on (the loop runs); off, nothing moves. */
  enabled: boolean;
  /** The cloud shadows of #573, the loop's other effect: off, the birds are judged alone. */
  clouds: boolean;
}

/** The knobs that are the birds' own settings. */
const BIRD_KEYS = Object.keys(DEFAULT_BIRD_SETTINGS) as Array<keyof BirdSettings>;

/**
 * The distance a player on a phone plays at: a tile about 1.5 times the opening size S, 160 of the opening's 240 (as #572's stories
 * took it).
 */
export const PHONE_PLAY_DISTANCE = 160;
const CLOSE_DISTANCE = 26;

const tileOf = (plan: number, n: number, worldX: number, worldZ: number): TileRenderData => ({
  game_id: 1, id: n, player_id: "0x0", plan, orientation: 1, x: worldX, y: worldZ, worldX, worldZ,
});
const BOARD_TILES = toRenderTiles(BOARD_72.tiles, 1);
const FOREST_SKINS = skinsFor("all");
const NO_SKINS: TileSkins = skinsFor("none");

/** The board's frame time and draws: the readout. */
interface Readout {
  flying: number;
  perches: number;
  flights: number;
  birdDraws: number;
  drawCalls: number;
  cpuP95: number;
  framesPerSecond: number;
  running: boolean;
  fps: number;
  phase: string;
  webgl: string;
}

const p95 = (values: number[]) => (values.length ? [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * 0.95))]! : 0);

/** A node of the board's scene graph (the app does not import three itself). */
type Node = ReturnType<GameScene["tiles"]["getGroup"]>["children"][number];

/** The geometry of an object's first mesh (an outline is its child, so never first): it tells which model type a tile draws. */
function geometryOf(root: Node): unknown {
  let found: unknown = null;
  root.traverse((child) => {
    const mesh = child as Node & { isMesh?: boolean; geometry?: unknown };
    if (!found && mesh.isMesh) found = mesh.geometry;
  });
  return found;
}

/**
 * The board's drawn tiles as the birds read them: each placed model with its type and model id. The board does not hand them out
 * (it does not call the birds), so the story finds them in the tile group by cell, and the model id by the type whose geometry the
 * tile shares (its skin's variant, or the base model while the variant loads).
 */
function sourcesOf(scene: GameScene, tiles: TileRenderData[], skins: TileSkins): BirdSource[] {
  const tileGroup = scene.tiles.getGroup().children[0];
  if (!tileGroup) return [];
  const byCell = new Map(tiles.map((t) => [`${t.worldX},${t.worldZ}`, t]));
  const sources: BirdSource[] = [];
  for (const container of tileGroup.children) {
    const model = container.children[0];
    if (!model || container.userData.placeholder) continue;
    const tile = byCell.get(`${Math.round(container.position.x / TILE_SIZE)},${Math.round(container.position.z / TILE_SIZE)}`);
    if (!tile) continue;
    const key = getPlanKey(Plan.from(tile.plan).value);
    const geometry = geometryOf(model);
    const ids = [scene.assets.skinModel(key, skinRef(skins, tile.plan, tile.x, tile.y, tile.game_id)), key];
    for (const id of ids) {
      if (!id || !scene.assets.has(id)) continue;
      const type = scene.assets.getModel(id);
      if (geometryOf(type) === geometry) {
        sources.push({ key: id, type, tile: model });
        break;
      }
    }
  }
  return sources;
}

/**
 * The birds (BIRDS, #574) on one tile or on the recorded 72-tile board, at the game's camera, under the day and night cycle. The
 * board does not call the birds: the story loads their chunk (`loadBirds`), adds them to the board's group and registers them on
 * the scene's one ambient loop (`scene.ambient`), which steps them at its capped rate and stops while the tab is hidden or the
 * effects are off (the Low tier among them). Every knob of `BirdSettings` is a control; the readout gives the birds in flight, the
 * perches found, the draws (the birds' and the frame's) and the frame's CPU time, p95. The scene is exposed to the measuring
 * scripts as `window.__birdsScene`, the birds as `window.__birds`.
 */
export function BirdsBoard(props: BirdsBoardProps) {
  const { layout, plan, forest, view, distance, time, cycleSeconds, perches, fps, quality, enabled, clouds } = props;
  const [scene, setScene] = useState<GameScene | null>(null);
  const [birds, setBirds] = useState<Birds | null>(null);
  const [ready, setReady] = useState(false);
  const [readout, setReadout] = useState<Readout | null>(null);
  const tiles = useMemo(() => (layout === "tile" ? [tileOf(Math.max(0, BIRD_PLANS.indexOf(plan)) + 1, 1, 0, 0)] : BOARD_TILES), [layout, plan]);
  const skins = forest ? FOREST_SKINS : NO_SKINS;
  const birdSettings = useMemo(
    () => resolveBirdSettings(Object.fromEntries(BIRD_KEYS.map((k) => [k, props[k]]))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(BIRD_KEYS.map((k) => props[k]))],
  );
  const settings = useMemo<RendererSettingsInput>(
    () => ({
      quality,
      dayNight:
        time === "cycle"
          ? { enabled: true, cycleMs: cycleSeconds * 1000, reducedMotion: false, freezeAt: null }
          : { enabled: true, reducedMotion: false, freezeAt: DAY_PHASE_AT[time] },
      ambient: { enabled, fps, reducedMotion: false, clouds: { enabled: clouds } },
    }),
    [quality, time, cycleSeconds, enabled, fps, clouds],
  );
  const settingsRef = useRef(birdSettings);
  settingsRef.current = birdSettings;

  const onReady = useCallback((s: GameScene) => {
    setScene(s);
    (window as unknown as { __birdsScene?: GameScene }).__birdsScene = s;
  }, []);

  // The birds: their chunk, in the board's group, on the scene's ambient loop.
  useEffect(() => {
    if (!scene) return;
    let alive = true;
    let made: Birds | null = null;
    let unregister = () => {};
    void loadBirds().then(({ Birds }) => {
      if (!alive) return;
      made = new Birds(scene.ambient.time, settingsRef.current);
      made.onChange = () => scene.requestRender();
      made.onShadow = () => scene.requestShadowUpdate();
      scene.tiles.getGroup().add(made.object);
      unregister = scene.ambient.register(made);
      (window as unknown as { __birds?: Birds }).__birds = made;
      setBirds(made);
    });
    return () => {
      alive = false;
      unregister();
      made?.dispose();
      setBirds(null);
    };
  }, [scene]);

  useEffect(() => {
    birds?.setSettings(birdSettings);
    scene?.requestRender();
  }, [birds, birdSettings, scene]);

  useEffect(() => {
    birds?.showPerches(perches);
    scene?.requestRender();
  }, [birds, perches, scene]);

  // The tiles drawn (their models come in after the first frame): the perches follow, checked twice a second.
  useEffect(() => {
    if (!scene || !birds) return;
    let last = "";
    const sync = () => {
      const sources = sourcesOf(scene, tiles, skins);
      const signature = sources.map((s) => `${s.key}@${s.tile.uuid}`).join("|");
      if (signature === last) return;
      last = signature;
      birds.setTiles(sources, scene.tiles.getGroup());
      scene.requestRender();
    };
    sync();
    const id = window.setInterval(sync, 500);
    return () => clearInterval(id);
  }, [scene, birds, tiles, skins]);

  // The night: the birds roost (no flight starts).
  useEffect(() => {
    if (!scene || !birds) return;
    const id = window.setInterval(() => birds.setNight(scene.getDayNight()?.phase === "night"), 250);
    return () => clearInterval(id);
  }, [scene, birds]);

  // The camera: the game's opening (`focusBoard`), a phone's play distance at the game's tilt, or close on the tile.
  useEffect(() => {
    if (!scene) return;
    scene.focusBoard();
    const target = scene.controls.controls.target;
    if (layout === "tile") target.set(0, 1, 0);
    const at = distance ?? (view === "game" ? scene.camera.position.distanceTo(target) : view === "phone-play" ? PHONE_PLAY_DISTANCE : CLOSE_DISTANCE);
    scene.camera.position.set(target.x, target.y + at * Math.cos(PLAY_DEFAULT_POLAR_ANGLE), target.z + at * Math.sin(PLAY_DEFAULT_POLAR_ANGLE));
    scene.camera.lookAt(target);
    scene.requestRender();
    let id = requestAnimationFrame(() => (id = requestAnimationFrame(() => setReady(true))));
    return () => cancelAnimationFrame(id);
  }, [scene, view, distance, layout, tiles]);

  // The readout: the frame observer times each frame drawn and counts its draws (three's counters kept over the passes).
  useEffect(() => {
    if (!scene || !birds) return;
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
      const stats = birds.stats();
      const point = scene.getDayNight();
      setReadout({
        flying: stats.flying,
        perches: stats.perches,
        flights: stats.flights,
        birdDraws: stats.drawCalls,
        drawCalls: calls,
        cpuP95: p95(times),
        framesPerSecond: stamps.length,
        running: ambient.running,
        fps: ambient.fps,
        phase: point ? (point.phase === "night" ? "night: roosting" : point.phase) : "",
        webgl: scene.getWebGL().software ? "software WebGL: no frame time" : "GPU",
      });
    }, 500);
    return () => {
      clearInterval(timer);
      scene.setFrameObserver(null);
      info.autoReset = true;
    };
  }, [scene, birds]);

  return (
    <div className="relative h-full min-h-dvh w-full bg-board" data-ready={(ready && !!readout && readout.perches > 0) || undefined}>
      <GameCanvas
        tiles={tiles}
        skins={skins}
        basePath={APP_ASSETS}
        manifest={APP_MANIFEST}
        settings={settings}
        onReady={onReady}
        style={{ position: "absolute", inset: 0 }}
      />
      {readout && (
        <output className="pointer-events-none absolute top-3 left-3 max-w-[calc(100%-1.5rem)] rounded-md bg-background/80 px-3 py-2 font-mono text-xs text-foreground numeric" aria-live="off">
          <div>
            {readout.flying} in flight · {readout.flights} flights · {readout.perches} perches
          </div>
          <div>
            {readout.birdDraws} bird draws of {readout.drawCalls} · {readout.framesPerSecond} frames/s · CPU p95 {readout.cpuP95.toFixed(2)} ms
          </div>
          <div>
            {readout.running ? `loop on, cap ${readout.fps} fps` : "loop off"} · {readout.phase} · {readout.webgl}
          </div>
        </output>
      )}
      <button
        type="button"
        onClick={() => {
          if (!scene || !birds) return;
          // From the tree nearest the camera's target, so the flight is in view.
          const target = scene.tiles.getGroup().worldToLocal(scene.controls.controls.target.clone());
          birds.launch(undefined, target);
          scene.requestRender();
        }}
        className="absolute right-3 bottom-3 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        Fly now
      </button>
    </div>
  );
}
