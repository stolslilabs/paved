import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GameCanvas } from "@paved/renderer/react";
import {
  DEFAULT_VOXEL_DROP_SETTINGS,
  DROP_EASES,
  DROP_LANDINGS,
  TILE_SIZE,
  type DropInfo,
  type DropResult,
  type GameScene,
  type RendererSettingsInput,
  type TileRenderData,
  type VoxelDropSettings,
} from "@paved/renderer";
import { getPlanKey, Plan } from "@paved/game-core";
import { APP_ASSETS, APP_MANIFEST } from "../../mocks/assets";
import { skinsFor } from "./skins-board";
import { BOUNDS, PLACED, SLOTS, WITH_PLACED, tiles as BOARD_TILES } from "./placement-board";
import { viewPose, type View } from "./outlines-tour";

/** The 19 plans' keys, in plan order. */
export const DROP_PLANS = Array.from({ length: 19 }, (_, i) => getPlanKey(Plan.from(i + 1).value));

/** The drop's knobs as flat story args (the settings' own names), and `reducedMotion` for the placement's. */
export type DropArgs = Partial<VoxelDropSettings> & { reducedMotion?: boolean };

const range = (min: number, max: number, step: number) => ({ control: { type: "range", min, max, step } });

/** Controls for every knob of the animation (`VoxelDropSettings`), grouped, with the default in the description. */
export function dropArgTypes(): Record<string, object> {
  const d = DEFAULT_VOXEL_DROP_SETTINGS;
  const entries: Array<[keyof VoxelDropSettings | "reducedMotion", object, string]> = [
    ["baseMs", range(0, 2000, 10), "Duration: the fixed part, ms"],
    ["msPerVoxel", range(0, 2, 0.01), "Duration: added per voxel above the ground slab, ms (the duration is clamped to min..max)"],
    ["minMs", range(100, 3000, 50), "Duration: the lowest, ms"],
    ["maxMs", range(100, 5000, 50), "Duration: the highest, ms"],
    ["slabShare", range(0, 1, 0.01), "The share of the launch window the ground slab's voxels use (the decor gets the rest)"],
    ["fallMs", range(50, 1200, 10), "One voxel's fall, ms"],
    ["fallVoxels", range(1, 120, 1), "The height the voxels fall from, in voxels"],
    ["ease", { control: "inline-radio", options: DROP_EASES }, "How a voxel accelerates over its fall"],
    ["landing", { control: "inline-radio", options: DROP_LANDINGS }, "What a voxel does as it lands"],
    ["jitter", range(0, 1, 0.01), "Radial jitter: how far a launch moves along its layer's window at random"],
    ["overlap", range(0, 1, 0.01), "Overlap between layers: how far a layer's launches run into the next layer's"],
    ["shadows", { control: "boolean" }, "Shadows during the fall (redraws the board's shadow map every frame of the drop)"],
    ["outline", { control: "boolean" }, "The per-cube outline, faded out as the cube lands (shown off on software WebGL by the renderer's own outlines only)"],
    ["speed", range(0.05, 1, 0.01), "Slow motion: the clock's speed, 0.1x to 1x, to inspect the order"],
    ["reducedMotion", { control: "boolean" }, "Reduced motion: the drop is skipped (placement.motion.reducedMotion; unset: the device's)"],
  ];
  const types: Record<string, object> = {};
  for (const [name, control, description] of entries) {
    const base = name === "reducedMotion" ? "unset" : String(d[name]);
    types[name] = { ...control, description: `${description} (default ${base})`, table: { category: "voxel drop" } };
  }
  return types;
}

/** The renderer settings of the args that are set. */
export function dropSettings(args: DropArgs, force: "auto" | "on" | "off"): RendererSettingsInput {
  const { reducedMotion, ...knobs } = args;
  const voxelDrop = Object.fromEntries(Object.entries(knobs).filter(([, v]) => v !== undefined));
  return {
    outlines: { force },
    voxelDrop,
    placement: reducedMotion === undefined ? {} : { motion: { reducedMotion } },
  };
}

/** The numbers of a started drop, or why it was skipped. */
export type Readout = { plan: string; result: DropResult } | null;

/** `overlay` floats over the canvas; `below` is a strip under it, so no tile is covered (text stays 12 px). */
function DropReadout({ rows, placement = "overlay" }: { rows: Array<{ plan: string; result: DropResult }>; placement?: "overlay" | "below" }) {
  const where = placement === "below" ? "max-h-48 shrink-0 overflow-auto border-t border-border bg-background px-3 py-2" : "pointer-events-none absolute top-3 left-3 max-h-[calc(100%-1.5rem)] max-w-[calc(100%-1.5rem)] overflow-auto rounded-md bg-background/80 px-3 py-2";
  return (
    <output className={`${where} font-mono text-foreground numeric ${rows.length > 3 ? "text-xs leading-4" : "text-xs leading-5"}`} aria-live="off">
      {rows.length === 0 && "waiting for the first drop"}
      {rows.map(({ plan, result }) => (
        <div key={plan} className="whitespace-nowrap">
          {result.status === "started" ? <Info plan={plan} info={result.info} /> : `${plan}: skipped (${result.reason})`}
        </div>
      ))}
    </output>
  );
}

function Info({ plan, info }: { plan: string; info: DropInfo }) {
  return (
    <>
      {plan}: {info.voxels} voxels ({info.slabVoxels} slab) · {info.instances} instances · {(info.triangles / 1000).toFixed(0)}k triangles · drop {info.durationMs.toFixed(0)} ms
      {info.playMs !== info.durationMs && ` (plays ${info.playMs.toFixed(0)} ms)`} · voxelizer {info.buildMs.toFixed(1)} ms
    </>
  );
}

/** A counter that goes up now and then: the replay button and the auto-replay interval (0: never). */
function useReplay(replayMs: number, active: boolean): [number, () => void] {
  const [run, setRun] = useState(0);
  const replay = useCallback(() => setRun((n) => n + 1), []);
  useEffect(() => {
    if (!active) return;
    replay();
    if (!(replayMs > 0)) return;
    const id = setInterval(replay, replayMs);
    return () => clearInterval(id);
  }, [active, replayMs, replay]);
  return [run, replay];
}

/** Waits for the tile's model (a plan just selected, a skin variant on its way), then drops it. */
async function dropWhenIn(scene: GameScene, tile: { id: number; game_id: number }, alive: () => boolean): Promise<DropResult | null> {
  for (let attempt = 0; attempt < 80 && alive(); attempt++) {
    const result = await scene.dropTile(tile);
    if (result.status === "started" || (result.reason !== "no-model" && result.reason !== "no-tile")) return result;
    await new Promise((done) => setTimeout(done, 150));
  }
  return null;
}

const Replay = ({ onClick }: { onClick: () => void }) => (
  <button type="button" onClick={onClick} className="absolute right-3 bottom-3 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
    Replay
  </button>
);

/** Aims the scene's camera at `target` from `distance`, tilted `polar` radians from straight down. */
function aim(scene: GameScene, target: [number, number, number], distance: number, polar: number): void {
  scene.controls.controls.target.set(...target);
  scene.camera.position.set(target[0], target[1] + distance * Math.cos(polar), target[2] + distance * Math.sin(polar));
  scene.camera.lookAt(...target);
  scene.requestRender();
}

const tileOf = (plan: number, n: number, worldX: number, worldZ: number): TileRenderData => ({
  game_id: 1, id: n, player_id: "0x0", plan, orientation: 1, x: 0, y: 0, worldX, worldZ,
});

export interface OneTileProps extends DropArgs {
  /** The plan whose tile drops (the Forest variants through `forest`). */
  plan: string;
  forest: "none" | "all";
  /** Replays every this many ms (0: only the button). */
  replayMs: number;
  force: "auto" | "on" | "off";
  distance: number;
}

/** One tile, alone: any of the 19 plans (and its Forest variant), replayed by the button or every `replayMs`. */
export function VoxelDropOneTile({ plan, forest, replayMs, force, distance, ...args }: OneTileProps) {
  const [scene, setScene] = useState<GameScene | null>(null);
  const [rows, setRows] = useState<Array<{ plan: string; result: DropResult }>>([]);
  const index = Math.max(0, DROP_PLANS.indexOf(plan)) + 1;
  const board = useMemo(() => [tileOf(index, 1, 0, 0)], [index]);
  const skins = useMemo(() => skinsFor(forest), [forest]);
  const settings = useMemo(() => dropSettings(args, force), [JSON.stringify(args), force]); // eslint-disable-line react-hooks/exhaustive-deps
  const [run, replay] = useReplay(replayMs, !!scene);

  useEffect(() => {
    if (scene) aim(scene, [0, 1, 0], distance, 0.42);
  }, [scene, distance]);

  useEffect(() => {
    if (!scene || run === 0) return;
    let alive = true;
    void dropWhenIn(scene, { id: 1, game_id: 1 }, () => alive).then((result) => alive && result && setRows([{ plan: `${plan}${forest === "all" ? " (Forest)" : ""}`, result }]));
    return () => {
      alive = false;
    };
  }, [scene, run, index, forest, plan]);

  return (
    <div className="relative h-full min-h-dvh w-full bg-board" data-ready={rows.length > 0 || undefined}>
      <GameCanvas tiles={board} skins={skins} basePath={APP_ASSETS} manifest={APP_MANIFEST} settings={settings} onReady={setScene} style={{ position: "absolute", inset: 0 }} />
      <DropReadout rows={rows} />
      <Replay onClick={replay} />
    </div>
  );
}

export interface AllTilesProps extends DropArgs {
  /** 0: every tile drops at once; else each starts this many ms after the one before (plan order). */
  stagger: number;
  forest: "none" | "all";
  replayMs: number;
  force: "auto" | "on" | "off";
  distance: number;
}

const COLUMNS = 5;
const ALL = DROP_PLANS.map((_, i) => tileOf(i + 1, i + 1, (i % COLUMNS) - 2, Math.floor(i / COLUMNS) - 2));

/** The 19 plans on one board, dropped together or one after the other, to compare durations and orders. */
export function VoxelDropAllTiles({ stagger, forest, replayMs, force, distance, ...args }: AllTilesProps) {
  const [scene, setScene] = useState<GameScene | null>(null);
  const [rows, setRows] = useState<Array<{ plan: string; result: DropResult }>>([]);
  const skins = useMemo(() => skinsFor(forest), [forest]);
  const settings = useMemo(() => dropSettings(args, force), [JSON.stringify(args), force]); // eslint-disable-line react-hooks/exhaustive-deps
  const [ready, setReady] = useState(false);
  const [run, replay] = useReplay(replayMs, ready);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    if (scene) aim(scene, [0, 0, -TILE_SIZE * 0.5], distance, 0.3);
  }, [scene, distance]);

  // Every model is in before the first run: the loader brings the rest after the first frame.
  useEffect(() => {
    if (!scene) return;
    let alive = true;
    void (async () => {
      for (let tries = 0; tries < 200 && alive; tries++) {
        const ok = await Promise.all(ALL.map((t) => scene.prepareDrop(t)));
        if (ok.every(Boolean)) return alive && setReady(true);
        await new Promise((done) => setTimeout(done, 200));
      }
    })();
    return () => {
      alive = false;
    };
  }, [scene, forest]);

  useEffect(() => {
    if (!scene || run === 0) return;
    let alive = true;
    const results: Array<{ plan: string; result: DropResult }> = [];
    timers.current.forEach(clearTimeout);
    ALL.forEach((tile, i) => {
      timers.current.push(
        window.setTimeout(async () => {
          const result = await scene.dropTile(tile);
          results[i] = { plan: DROP_PLANS[i]!, result };
          if (alive) setRows(results.filter(Boolean));
        }, i * stagger),
      );
    });
    return () => {
      alive = false;
      timers.current.forEach(clearTimeout);
    };
  }, [scene, run, stagger]);

  return (
    <div className="flex h-full min-h-dvh w-full flex-col bg-board" data-ready={rows.length === ALL.length || undefined}>
      <div className="relative min-h-0 flex-1">
        <GameCanvas tiles={ALL} skins={skins} basePath={APP_ASSETS} manifest={APP_MANIFEST} settings={settings} onReady={setScene} style={{ position: "absolute", inset: 0 }} />
        <Replay onClick={replay} />
      </div>
      <DropReadout rows={rows} placement="below" />
    </div>
  );
}

/** How the confirm's green flash and the drop go together in the "in context" story. */
export const FLASH_MODES = ["drop only", "flash only", "drop and flash", "drop, then flash"] as const;
export type FlashMode = (typeof FLASH_MODES)[number];

export interface InContextProps extends DropArgs {
  /** The drop replaces the flash (the default), or the old flash alone, or both together or chained. */
  flash: FlashMode;
  view: View;
  distance?: number;
  replayMs: number;
  force: "auto" | "on" | "off";
}

/** The recorded 72-tile board with a tile placed on a slot, dropped (and flashed) as it would be at the game's camera. */
export function VoxelDropInContext({ flash, view, distance, replayMs, force, ...args }: InContextProps) {
  const [scene, setScene] = useState<GameScene | null>(null);
  const [rows, setRows] = useState<Array<{ plan: string; result: DropResult }>>([]);
  const [placed, setPlaced] = useState(false);
  const [confirmKey, setConfirmKey] = useState(0);
  const settings = useMemo(() => dropSettings(args, force), [JSON.stringify(args), force]); // eslint-disable-line react-hooks/exhaustive-deps
  const [ready, setReady] = useState(false);
  const [run, replay] = useReplay(replayMs, ready);
  const [dropRun, setDropRun] = useState(0);
  const placedTile = WITH_PLACED[WITH_PLACED.length - 1]!;

  useEffect(() => {
    if (!scene) return;
    const pose = viewPose(view, BOUNDS, distance);
    // Centred on the placed tile (the pose's own target is the board's centre).
    const [dx, dz] = [PLACED.x * TILE_SIZE - pose.target[0], PLACED.y * TILE_SIZE - pose.target[2]];
    scene.controls.controls.target.set(pose.target[0] + dx, pose.target[1], pose.target[2] + dz);
    scene.camera.position.set(pose.position[0] + dx, pose.position[1], pose.position[2] + dz);
    scene.camera.lookAt(pose.target[0] + dx, pose.target[1], pose.target[2] + dz);
    scene.requestRender();
    // The chunk and the grid of the placed tile's model (the plan is on the board already), so the first drop begins in its call.
    void scene.prepareDrop(BOARD_TILES[1]!).then(() => setReady(true));
  }, [scene, view, distance]);

  // A run: the tile is placed (the first time), then flashes, drops, or both.
  useEffect(() => {
    if (!ready || run === 0) return;
    setPlaced(true);
    setDropRun(run);
    if (flash === "flash only" || flash === "drop and flash") setConfirmKey((k) => k + 1);
  }, [ready, run, flash]);

  // After the board has been given the placed tile (the canvas's effect runs first).
  useEffect(() => {
    if (!scene || !placed || dropRun === 0 || flash === "flash only") return;
    let alive = true;
    void dropWhenIn(scene, placedTile, () => alive).then(async (result) => {
      if (!alive || !result) return;
      setRows([{ plan: "placed tile", result }]);
      if (flash === "drop, then flash" && result.status === "started") {
        await result.finished;
        if (alive) setConfirmKey((k) => k + 1);
      }
    });
    return () => {
      alive = false;
    };
  }, [scene, placed, dropRun, flash, placedTile]);

  const confirmed = useMemo(() => (confirmKey > 0 ? { ...PLACED, key: confirmKey } : null), [confirmKey]);
  return (
    <div className="relative h-full min-h-dvh w-full bg-board" data-ready={rows.length > 0 || undefined}>
      <GameCanvas
        tiles={placed ? WITH_PLACED : BOARD_TILES}
        availableSlots={placed ? [] : SLOTS}
        confirmed={confirmed}
        basePath={APP_ASSETS}
        manifest={APP_MANIFEST}
        settings={settings}
        onReady={setScene}
        style={{ position: "absolute", inset: 0 }}
      />
      <DropReadout rows={rows} />
      <Replay onClick={replay} />
    </div>
  );
}
