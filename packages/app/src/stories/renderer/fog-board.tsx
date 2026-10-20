import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GameCanvas } from "@paved/renderer/react";
import {
  DAY_PHASE_AT,
  PLAY_DEFAULT_POLAR_ANGLE,
  TILE_SIZE,
  VILLAGE_MAX_CELLS,
  boardReveal,
  cellKey,
  fogMode,
  freeSlots,
  loadFogOfWar,
  resolveFogSettings,
  villageReveal,
  type FogCell,
  type FogOfWar,
  type FogSettings,
  type FogSettingsInput,
  type GameScene,
  type PlacementSlot,
  type QualityTier,
  type RendererSettingsInput,
  type TileRenderData,
} from "@paved/renderer";
import { Button } from "../../components/ui/button";
import { toChainSlot, toRenderTiles } from "../../components/containers/board-viewport";
import { APP_ASSETS, APP_MANIFEST } from "../../mocks/assets";
import { BOARD_72 } from "../../mocks/board";
import { PHONE_PLAY_DISTANCE } from "./birds-board";
import { skinsFor } from "./skins-board";

/** What the fog leaves clear: the board's tiles and free slots, or a PvP village's owned cells and the cells next to them. */
export type FogReveal = "board" | "village";
/**
 * The game's opening camera (`focusBoard`), or at the game's tilt: a phone's play distance, the farthest the camera goes (300), or
 * close (40, just past the clear area's right border, to judge the edge zoomed in).
 */
export type FogView = "game" | "phone-play" | "far" | "close";
/** The distance of each view but the game's opening (`CameraController`'s `maxDistance` for the farthest). */
const VIEW_DISTANCE: Record<Exclude<FogView, "game">, number> = { "phone-play": PHONE_PLAY_DISTANCE, far: 300, close: 40 };
/** The light: the look alone (the cycle off), or a summer's day or night held (the wheel fixed, as the game's board). */
export type FogTime = "look" | "day" | "night";

export interface FogBoardProps {
  /** The fog on (the study's own switch). */
  fog: boolean;
  falloff: number;
  voxelEdge: boolean;
  billow: number;
  noiseScale: number;
  drift: number;
  driftDirection: number;
  color: string;
  shade: string;
  opacity: number;
  mist: number;
  mistHeight: number;
  nightShare: number;
  liftSeconds: number;
  landscape: boolean;
  ground: string;
  groundAlt: string;
  decor: number;
  decorScale: number;
  reveal: FogReveal;
  /** board: the recorded 72-tile board's first tiles placed, in its own order (each next to one before). */
  placed: number;
  /** village: the owned cells (the recorded board's first, in its order), and how many of them hold a tile. */
  villageCells: number;
  villageBuilt: number;
  /** The free slots (board) or the owned empty and buyable cells (village) as the placement's plates. */
  plates: boolean;
  /** Place the next tile (or buy the next cell) every this many seconds; 0: by hand only (a tap on a slot, or the button). */
  autoplay: number;
  /** The "Place next" button and the tap on a slot. */
  interactive: boolean;
  view: FogView;
  time: FogTime;
  /** The 'Ambient effects' setting: off, the fog stands still and a cell lifts at once. */
  enabled: boolean;
  reducedMotion: boolean;
  fps: number;
  quality: QualityTier | "auto";
}

/** The recorded board, in its own order: every tile next to one placed before it. */
const RECORDED = toRenderTiles(BOARD_72.tiles, 1);
const NO_SKINS = skinsFor("none");

/** The controls as the fog's settings. */
export function fogInput(props: FogBoardProps): FogSettingsInput {
  return {
    enabled: props.fog,
    falloff: props.falloff,
    voxelEdge: props.voxelEdge,
    billow: props.billow,
    noiseScale: props.noiseScale,
    drift: props.drift,
    driftDirection: props.driftDirection,
    color: props.color,
    shade: props.shade,
    opacity: props.opacity,
    mist: props.mist,
    mistHeight: props.mistHeight,
    night: props.nightShare,
    liftSeconds: props.liftSeconds,
    landscape: { enabled: props.landscape, ground: props.ground, groundAlt: props.groundAlt, decor: props.decor, decorScale: props.decorScale },
  };
}

/** A tile for a cell the recorded board leaves empty: a plan of the recorded board, picked by the cell, in its first orientation. */
function tileFor(cell: FogCell, id: number): TileRenderData {
  const recorded = RECORDED.find((t) => t.worldX === cell.x && t.worldZ === cell.y);
  if (recorded) return { ...recorded, id };
  const plan = RECORDED[(((cell.x * 7 + cell.y * 13) % RECORDED.length) + RECORDED.length) % RECORDED.length]!.plan;
  return { ...RECORDED[0]!, ...toChainSlot(cell.x, cell.y), id, plan, orientation: 1, worldX: cell.x, worldZ: cell.y };
}

/** The board state the story holds: the tiles placed, and in a village the cells owned. */
interface Board {
  tiles: TileRenderData[];
  owned: FogCell[];
  /** The last cell placed or bought: the fog lifts from its side. */
  last: FogCell | null;
}

function initialBoard(props: Pick<FogBoardProps, "reveal" | "placed" | "villageCells" | "villageBuilt">): Board {
  if (props.reveal === "board") return { tiles: RECORDED.slice(0, Math.max(1, props.placed)), owned: [], last: null };
  const cells = Math.min(VILLAGE_MAX_CELLS, Math.max(1, props.villageCells));
  const owned = RECORDED.slice(0, cells).map((t) => ({ x: t.worldX, y: t.worldZ }));
  return { tiles: RECORDED.slice(0, Math.min(cells, Math.max(0, props.villageBuilt))), owned, last: null };
}

/** The cells the fog leaves clear for the board state. */
function revealOf(reveal: FogReveal, board: Board): FogCell[] {
  return reveal === "board" ? boardReveal(board.tiles.map((t) => ({ x: t.worldX, y: t.worldZ }))) : villageReveal(board.owned);
}

/** The plates: the free slots (board); the owned empty cells, playable, and the buyable ones, fainter (village). */
function platesOf(reveal: FogReveal, board: Board): PlacementSlot[] {
  if (reveal === "board") return freeSlots(board.tiles.map((t) => ({ x: t.worldX, y: t.worldZ })));
  const built = new Set(board.tiles.map((t) => cellKey(t.worldX, t.worldZ)));
  const owned = board.owned.filter((c) => !built.has(cellKey(c.x, c.y)));
  return [...owned, ...freeSlots(board.owned).map((c) => ({ ...c, legal: false }))];
}

/**
 * The next move: on the board, the recorded board's next tile (or, on a tap, a tile on the slot tapped); in a village, a tile
 * on the first owned empty cell, else the next cell bought (the recorded board's next, or the one tapped). Null: nothing to do.
 */
function nextBoard(reveal: FogReveal, board: Board, tapped: FogCell | null): Board | null {
  const id = 1000 + board.tiles.length;
  const taken = new Set(board.tiles.map((t) => cellKey(t.worldX, t.worldZ)));
  if (reveal === "board") {
    const slots = freeSlots(board.tiles.map((t) => ({ x: t.worldX, y: t.worldZ })));
    const cell = tapped ? slots.find((s) => s.x === tapped.x && s.y === tapped.y) : RECORDED.map((t) => ({ x: t.worldX, y: t.worldZ })).find((c) => !taken.has(cellKey(c.x, c.y)) && slots.some((s) => s.x === c.x && s.y === c.y));
    if (!cell) return null;
    return { ...board, tiles: [...board.tiles, tileFor(cell, id)], last: cell };
  }
  const ownedKeys = new Set(board.owned.map((c) => cellKey(c.x, c.y)));
  const empty = board.owned.filter((c) => !taken.has(cellKey(c.x, c.y)));
  const buyable = freeSlots(board.owned);
  if (tapped) {
    if (empty.some((c) => c.x === tapped.x && c.y === tapped.y)) return { ...board, tiles: [...board.tiles, tileFor(tapped, id)], last: tapped };
    if (board.owned.length < VILLAGE_MAX_CELLS && buyable.some((c) => c.x === tapped.x && c.y === tapped.y)) return { ...board, owned: [...board.owned, tapped], last: tapped };
    return null;
  }
  if (empty.length) return { ...board, tiles: [...board.tiles, tileFor(empty[0]!, id)], last: empty[0]! };
  if (board.owned.length >= VILLAGE_MAX_CELLS) return null;
  const next = RECORDED.map((t) => ({ x: t.worldX, y: t.worldZ })).find((c) => !ownedKeys.has(cellKey(c.x, c.y)) && buyable.some((b) => b.x === c.x && b.y === c.y)) ?? buyable[0];
  return next ? { ...board, owned: [...board.owned, next], last: next } : null;
}

const p95 = (values: number[]) => (values.length ? [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * 0.95))]! : 0);

interface Readout {
  mode: string;
  board: string;
  cells: number;
  lifting: boolean;
  fogDraws: number;
  drawCalls: number;
  props: number;
  field: string;
  buildMs: number;
  cpuP95: number;
  framesPerSecond: number;
  loop: string;
  webgl: string;
}

/**
 * The fog of war (FOG-STUDY) on the recorded 72-tile board at the game's camera. The board does not call the fog: the story loads
 * its chunk (`loadFogOfWar`), puts it in the board's group (it turns with the compass) and registers it on the scene's one ambient
 * loop (`scene.ambient`), which steps its drift and its lifts at its capped rate. What it leaves clear follows the board state the
 * story holds (`boardReveal`, or `villageReveal` for a PvP village); a tap on a slot (or "Place next", or the autoplay) places a
 * tile there, or buys the cell, and the fog lifts from its side. Its mode follows the settings, the tier and reduced motion
 * (`fogMode`); its light the cycle (`setCycle`). The readout gives the fog's draws and the frame's, the frames a second and the
 * frame's CPU time, p95. The scene is exposed to the measuring scripts as `window.__fogScene`, the fog as `window.__fog`, the next
 * move as `window.__fogPlace()`.
 */
export function FogBoard(props: FogBoardProps) {
  const { reveal, placed, villageCells, villageBuilt, plates, autoplay, interactive, view, time, enabled, reducedMotion, fps, quality } = props;
  const [scene, setScene] = useState<GameScene | null>(null);
  const [fog, setFog] = useState<FogOfWar | null>(null);
  const [ready, setReady] = useState(false);
  const [readout, setReadout] = useState<Readout | null>(null);
  const [board, setBoard] = useState<Board>(() => initialBoard(props));
  const settingsKey = JSON.stringify(fogInput(props));
  const fogSettings = useMemo<FogSettings>(() => resolveFogSettings(JSON.parse(settingsKey) as FogSettingsInput), [settingsKey]);
  const settingsRef = useRef(fogSettings);
  settingsRef.current = fogSettings;

  // A new start (the controls' board) starts over.
  useEffect(() => setBoard(initialBoard({ reveal, placed, villageCells, villageBuilt })), [reveal, placed, villageCells, villageBuilt]);

  const settings = useMemo<RendererSettingsInput>(
    () => ({
      quality,
      dayNight: time === "look" ? { enabled: false } : { enabled: true, season: "summer", freezeAt: DAY_PHASE_AT[time], reducedMotion },
      ambient: { enabled, fps, reducedMotion, clouds: { enabled: false } },
    }),
    [quality, time, enabled, fps, reducedMotion],
  );

  const onReady = useCallback((s: GameScene) => {
    setScene(s);
    (window as unknown as { __fogScene?: GameScene }).__fogScene = s;
  }, []);

  // The fog: its chunk, in the board's group, on the scene's ambient loop.
  useEffect(() => {
    if (!scene) return;
    let alive = true;
    let made: FogOfWar | null = null;
    let unregister = () => {};
    void loadFogOfWar().then(({ FogOfWar }) => {
      if (!alive) return;
      made = new FogOfWar(scene.ambient.time, settingsRef.current);
      made.onChange = () => scene.requestRender();
      scene.tiles.getGroup().add(made.object);
      unregister = scene.ambient.register(made);
      (window as unknown as { __fog?: FogOfWar }).__fog = made;
      setFog(made);
    });
    return () => {
      alive = false;
      unregister();
      made?.dispose();
      scene.requestRender();
      setFog(null);
    };
  }, [scene]);

  useEffect(() => {
    fog?.setSettings(fogSettings);
  }, [fog, fogSettings]);

  // The mode: still on the Low tier, with the effects off or under reduced motion (the scene's tier, resolved from "auto").
  useEffect(() => {
    if (!scene || !fog) return;
    const device = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    fog.setMode(fogMode(fogSettings, { enabled, reducedMotion }, scene.getQuality(), device));
  }, [scene, fog, fogSettings, enabled, reducedMotion, quality]);

  // What the fog leaves clear, lifted from the side of the last cell placed or bought.
  const revealed = useMemo(() => revealOf(reveal, board), [reveal, board]);
  useEffect(() => {
    fog?.setRevealed(revealed, board.last ? [board.last] : []);
  }, [fog, revealed, board.last]);

  // The daylight: the cycle's point, read four times a second.
  useEffect(() => {
    if (!scene || !fog) return;
    const sync = () => fog.setCycle(scene.getDayNight());
    sync();
    const id = window.setInterval(sync, 250);
    return () => clearInterval(id);
  }, [scene, fog]);

  const move = useCallback((tapped: FogCell | null) => setBoard((b) => nextBoard(reveal, b, tapped) ?? b), [reveal]);
  useEffect(() => {
    (window as unknown as { __fogPlace?: () => void }).__fogPlace = () => move(null);
  }, [move]);
  useEffect(() => {
    if (!autoplay) return;
    const id = window.setInterval(() => move(null), autoplay * 1000);
    return () => clearInterval(id);
  }, [autoplay, move]);
  const onTileClick = useCallback((x: number, y: number) => move({ x, y }), [move]);

  // The camera: the game's opening (`focusBoard`), or a phone's play distance or the farthest, at the game's tilt.
  useEffect(() => {
    if (!scene) return;
    scene.focusBoard();
    if (view !== "game") {
      const distance = VIEW_DISTANCE[view];
      const target = scene.controls.controls.target;
      // Close, the view looks at the edge: half a cell past the clear area's border right of the board's middle.
      if (view === "close") target.x += 2 * TILE_SIZE;
      scene.camera.position.set(target.x, target.y + distance * Math.cos(PLAY_DEFAULT_POLAR_ANGLE), target.z + distance * Math.sin(PLAY_DEFAULT_POLAR_ANGLE));
      scene.camera.lookAt(target);
    }
    scene.requestRender();
    let id = requestAnimationFrame(() => (id = requestAnimationFrame(() => setReady(true))));
    return () => cancelAnimationFrame(id);
    // The camera frames the board the story starts with, not each move: a placement does not move it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, view, reveal, placed, villageCells]);

  // The readout: the frame observer times each frame drawn and counts its draws (three's counters kept over the passes).
  const boardLabel = reveal === "board" ? `${board.tiles.length} tiles` : `village: ${board.owned.length} of ${VILLAGE_MAX_CELLS} cells owned, ${board.tiles.length} built`;
  const labelRef = useRef(boardLabel);
  labelRef.current = boardLabel;
  useEffect(() => {
    if (!scene || !fog) return;
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
      const stats = fog.stats();
      setReadout({
        mode: stats.mode,
        board: labelRef.current,
        cells: stats.cells,
        lifting: stats.lifting,
        fogDraws: stats.drawCalls,
        drawCalls: calls,
        props: stats.props,
        field: stats.field,
        buildMs: stats.buildMs,
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
  }, [scene, fog]);

  const slots = useMemo(() => (plates ? platesOf(reveal, board) : []), [plates, reveal, board]);

  return (
    <div className="relative h-full min-h-dvh w-full bg-board" data-ready={(ready && !!readout) || undefined}>
      <GameCanvas
        tiles={board.tiles}
        availableSlots={slots}
        skins={NO_SKINS}
        basePath={APP_ASSETS}
        manifest={APP_MANIFEST}
        settings={settings}
        onReady={onReady}
        onTileClick={interactive ? onTileClick : undefined}
        style={{ position: "absolute", inset: 0 }}
      />
      {readout && (
        <output className="pointer-events-none absolute top-3 left-3 max-w-[calc(100%-1.5rem)] rounded-md bg-background/80 px-3 py-2 font-mono text-xs text-foreground numeric" aria-live="off">
          <div>
            fog {readout.mode} · {readout.board} · {readout.cells} cells clear{readout.lifting ? " · lifting" : ""}
          </div>
          <div>
            {readout.fogDraws} fog draws of {readout.drawCalls} · {readout.props} props · field {readout.field} ({readout.buildMs.toFixed(2)} ms)
          </div>
          <div>
            {readout.framesPerSecond} frames/s · CPU p95 {readout.cpuP95.toFixed(2)} ms · {readout.loop} · {readout.webgl}
          </div>
        </output>
      )}
      {interactive && (
        <div className="absolute right-3 bottom-3">
          <Button size="sm" variant="secondary" onClick={() => move(null)}>
            {reveal === "board" ? "Place next" : "Build or buy next"}
          </Button>
        </div>
      )}
    </div>
  );
}
