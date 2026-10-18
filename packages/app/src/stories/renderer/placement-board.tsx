import { useCallback, useEffect, useMemo, useState } from "react";
import { GameCanvas } from "@paved/renderer/react";
import { DEFAULT_PLACEMENT_SETTINGS, PLATE_GAP_VOXELS, TILE_SIZE, type GameScene, type HoverState, type LookPreset, type PlacementSettingsInput, type QualityTier, type PlacementSlot, type RendererSettingsInput } from "@paved/renderer";
import { toRenderTiles } from "../../components/containers/board-viewport";
import { APP_ASSETS } from "../../mocks/assets";
import { BOARD_72 } from "../../mocks/board";
import { viewPose, type Bounds, type View } from "./outlines-tour";

/** The placement states the story shows (SLOTS, P-68; PLATES, P-74). */
export const PLACEMENT_STATES = ["idle", "in-hand", "placed", "placed-red", "confirm"] as const;
export type PlacementStoryState = (typeof PLACEMENT_STATES)[number];

export interface PlacementBoardProps {
  /** idle: no plate; in-hand: the plates; placed: the tile on a plate (a white rim, or red: its rotation does not fit); confirm: green, fading. */
  state: PlacementStoryState;
  /** The board's tiles under the plates; off, the plates alone. */
  board?: boolean;
  /** Reduced motion: an instant change of state, a short fade (`prefers-reduced-motion` when unset). */
  reducedMotion?: boolean;
  /** The confirm plays again every this many ms (0: once). */
  replayMs?: number;
  view: View;
  distance?: number;
  /** Draw every frame even when nothing moves, as the frame-time measures need. */
  redraw?: boolean;
  readout?: boolean;
  force?: "auto" | "on" | "off";
  maxPixelRatio?: number | "auto";
  /** The graphics quality ("auto": the device's) and the look's preset, as the game's settings give them. */
  quality?: QualityTier | "auto";
  lookPreset?: LookPreset;
  /** The placement settings, flat (`placementArgTypes`). */
  [arg: string]: unknown;
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

/**
 * The empty cells next to a tile, each a plate of the tile in hand: about a third valid (the current rotation fits), a
 * third possible (another does), a third invalid (none does). A story's stand-in for the engine's legality.
 */
export const SLOTS: PlacementSlot[] = (() => {
  const taken = new Set(tiles.map((t) => `${t.worldX},${t.worldZ}`));
  const slots = new Map<string, PlacementSlot>();
  for (const t of tiles) {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const [x, y] = [t.worldX + dx, t.worldZ + dz];
      const k = (((x * 7 + y * 3) % 3) + 3) % 3;
      if (!taken.has(`${x},${y}`)) slots.set(`${x},${y}`, k === 0 ? { x, y, fits: false, legal: false } : { x, y, fits: k === 2 });
    }
  }
  return [...slots.values()];
})();

/** The slot nearest the board's centre that fits: where the tile is placed, with a plan already on the board (its model is in). */
export const PLACED: HoverState = (() => {
  const cx = (BOUNDS.minX + BOUNDS.maxX) / 2 / TILE_SIZE;
  const cz = (BOUNDS.minZ + BOUNDS.maxZ) / 2 / TILE_SIZE;
  const slot = SLOTS.filter((s) => s.fits && s.legal !== false).sort((a, b) => (a.x - cx) ** 2 + (a.y - cz) ** 2 - ((b.x - cx) ** 2 + (b.y - cz) ** 2))[0]!;
  return { x: slot.x, y: slot.y, valid: true, idle: true, placed: true, planIndex: BOARD_72.tiles[1].plan, orientation: BOARD_72.tiles[1].orientation };
})();

/** The board with the placed tile on its slot: the confirm's board. */
const WITH_PLACED = [
  ...tiles,
  { ...tiles[1]!, id: 10_000, x: tiles[1]!.x + PLACED.x - tiles[1]!.worldX, y: tiles[1]!.y - (PLACED.y - tiles[1]!.worldZ), worldX: PLACED.x, worldZ: PLACED.y },
];

type Group = keyof PlacementSettingsInput;
/** A flat arg's group and field: `gridOpacity` is `grid.opacity`. */
const FIELDS: Record<string, [Group, string]> = {};
for (const group of Object.keys(DEFAULT_PLACEMENT_SETTINGS) as Group[]) {
  for (const field of Object.keys(DEFAULT_PLACEMENT_SETTINGS[group])) {
    if (field === "rings" || field === "reducedMotion") continue;
    FIELDS[`${group}${field[0]!.toUpperCase()}${field.slice(1)}`] = [group, field];
  }
}

/** The placement settings of the flat args that are set; the grid's rings from `gridRing1` to `gridRing3`. */
export function placementInput(args: Record<string, unknown>): PlacementSettingsInput {
  const input: Record<string, Record<string, unknown>> = {};
  for (const [arg, [group, field]] of Object.entries(FIELDS)) {
    if (args[arg] === undefined) continue;
    (input[group] ??= {})[field] = args[arg];
  }
  const rings = DEFAULT_PLACEMENT_SETTINGS.grid.rings;
  const ring = (k: number) => (typeof args[`gridRing${k}`] === "number" ? (args[`gridRing${k}`] as number) : rings[k - 1]!);
  if ([1, 2, 3].some((k) => args[`gridRing${k}`] !== undefined)) (input.grid ??= {}).rings = [ring(1), ring(2), ring(3)];
  return input as PlacementSettingsInput;
}

/** Storybook controls for every placement setting, in groups; the plates' and the aura's sizes in voxels. */
export function placementArgTypes(): Record<string, object> {
  const types: Record<string, object> = {};
  const range = (min: number, max: number, step: number) => ({ control: { type: "range", min, max, step } });
  // By `group.field`, then by field.
  const spec: Record<string, object> = {
    opacity: range(0, 1, 0.01),
    widthDevicePx: range(0.5, 3, 0.25),
    farFadeStart: range(0.85, 3, 0.05),
    "plates.gap": range(PLATE_GAP_VOXELS.min, PLATE_GAP_VOXELS.max, 0.5),
    "plates.height": range(0.5, 8, 0.25),
    "plates.radius": range(0, 20, 0.5),
    "plates.bevel": range(0, 4, 0.25),
    invalidOpacity: range(0, 1, 0.01),
    "aura.height": range(0, 6, 0.25),
    falloff: range(0.5, 8, 0.25),
    intensity: range(0, 1, 0.01),
    placedFalloff: range(0.5, 10, 0.25),
    placedIntensity: range(0, 1, 0.01),
    colorMs: range(0, 1000, 10),
    confirmMs: range(100, 2000, 10),
    reducedConfirmMs: range(0, 600, 10),
  };
  const units: Record<string, string> = { plates: " voxels", aura: " voxels" };
  for (const [arg, [group, field]] of Object.entries(FIELDS)) {
    const value = (DEFAULT_PLACEMENT_SETTINGS[group] as Record<string, unknown>)[field];
    const control = typeof value === "boolean" ? { control: "boolean" } : group === "colors" || field === "color" ? { control: "color" } : (spec[`${group}.${field}`] ?? spec[field] ?? { control: "number" });
    const unit = typeof value === "number" && units[group] && !/opacity|intensity/i.test(field) ? units[group] : "";
    types[arg] = { ...control, description: `${group}.${field} (default ${String(value)}${unit})`, table: { category: group } };
  }
  for (const k of [1, 2, 3]) {
    types[`gridRing${k}`] = { ...range(0, 1, 0.01), description: `grid.rings[${k - 1}]: the share at ring ${k} (default ${DEFAULT_PLACEMENT_SETTINGS.grid.rings[k - 1]})`, table: { category: "grid" } };
  }
  return types;
}

/**
 * The recorded 72-tile board with the placement visuals in one state (PLATES, P-74): the plates of a tile in hand (valid
 * under their aura, possible, invalid), the tile placed on one (a white rim, or red when its rotation does not fit), and
 * the confirm (green, fading out); `board` off shows the plates alone. `data-ready` is set once the board is drawn at the
 * held view.
 */
export function PlacementBoard({ state, board = true, reducedMotion, replayMs = 1600, view, distance, redraw = false, readout = true, force = "auto", maxPixelRatio = "auto", quality = "auto", lookPreset = "mockup", ...args }: PlacementBoardProps) {
  const [scene, setScene] = useState<GameScene | null>(null);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState("");
  const [confirmKey, setConfirmKey] = useState(0);
  const input = placementInput(args);
  const key = JSON.stringify([input, reducedMotion, force, maxPixelRatio, quality, lookPreset]);
  const settings = useMemo<RendererSettingsInput>(
    () => ({ outlines: { force }, maxPixelRatio, quality, lookPreset, placement: { ...input, motion: { ...input.motion, ...(reducedMotion === undefined ? {} : { reducedMotion }) } } }),
    [key], // eslint-disable-line react-hooks/exhaustive-deps
  );
  // The measuring scripts (the GPU flicker check) drive the camera by the scene itself: exact pans and distances.
  const onReady = useCallback((s: GameScene) => {
    setScene(s);
    (window as unknown as { __placementScene?: GameScene }).__placementScene = s;
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

  // The confirm again and again, so its fade can be watched (and tuned).
  useEffect(() => {
    if (state !== "confirm" || !ready) return;
    setConfirmKey((k) => k + 1);
    if (!(replayMs > 0)) return;
    const id = setInterval(() => setConfirmKey((k) => k + 1), replayMs);
    return () => clearInterval(id);
  }, [state, ready, replayMs]);

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
      const z = scene.getZoom();
      setZoom(`distance ${z.distance.toFixed(0)} · tile ${z.tilePx.toFixed(0)} px (S ${z.openingTilePx.toFixed(0)})`);
      id = window.setTimeout(step, 250);
    };
    step();
    return () => clearTimeout(id);
  }, [scene, readout]);

  const slots = state === "in-hand" || state === "placed" || state === "placed-red" ? SLOTS : NO_SLOTS;
  const hover = useMemo<HoverState | null>(
    () => (!ready ? null : state === "placed" ? PLACED : state === "placed-red" ? { ...PLACED, valid: false } : null),
    [state, ready],
  );
  const confirmed = useMemo(() => (state === "confirm" && ready && confirmKey > 0 ? { ...PLACED, key: confirmKey } : null), [state, ready, confirmKey]);
  // Confirmed, the tile is on the board (as the game draws it after a move); the effects fade over it.
  const shown = !board ? NO_TILES : state === "confirm" ? WITH_PLACED : tiles;

  return (
    <div className="relative h-full min-h-dvh w-full bg-board" data-ready={ready || undefined}>
      <GameCanvas
        tiles={shown}
        availableSlots={slots}
        hover={hover}
        confirmed={confirmed}
        basePath={APP_ASSETS}
        settings={settings}
        onReady={onReady}
        style={{ position: "absolute", inset: 0 }}
      />
      {readout && zoom && (
        <output className="absolute top-3 left-3 rounded-md bg-background/80 px-3 py-2 font-mono text-xs text-foreground numeric" aria-live="off">
          {state} · {zoom}
        </output>
      )}
    </div>
  );
}

const NO_SLOTS: PlacementSlot[] = [];
const NO_TILES: typeof tiles = [];
