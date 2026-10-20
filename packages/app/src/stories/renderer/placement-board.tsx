import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GameCanvas } from "@paved/renderer/react";
import { DAY_PHASE_AT, DEFAULT_PLACEMENT_SETTINGS, PLATE_GAP_VOXELS, type DayPhase, TILE_SIZE, type GameScene, type HoverState, type LookPreset, type PlacementSettingsInput, type QualityTier, type PlacementSlot, type RendererSettingsInput } from "@paved/renderer";
import { toRenderTiles, useDropThenConfirm, useTileHold } from "../../components/containers/board-viewport";
import type { Hold } from "../../lib/use-hold";
import { LazyTileBubble } from "../../components/containers/lazy-tile-bubble";
import { APP_ASSETS } from "../../mocks/assets";
import { BOARD_72 } from "../../mocks/board";
import { viewPose, type Bounds, type View } from "./outlines-tour";

/**
 * The placement states the story shows (SLOTS, P-68; PLATES, P-74; PLACEMENT-TINTS): `tour` plays hover, placed and confirm
 * in turn; `sequence` is the game's (PLACE-POLISH, #568): hover, placed with its bubble, the hold on Validate or on the
 * placed tile itself (TILE-HOLD, #630), the voxel drop, then the green.
 */
export const PLACEMENT_STATES = ["idle", "in-hand", "hover", "placed", "confirm", "tour", "sequence"] as const;
export type PlacementStoryState = (typeof PLACEMENT_STATES)[number];

export interface PlacementBoardProps {
  /**
   * idle: no plate; in-hand: the plates; hover: the tile untinted at half opacity; placed: yellow, opaque; confirm: green,
   * fading; tour: all three in turn; sequence: the game's, with the bubble's hold, the drop and the green.
   */
  state: PlacementStoryState;
  /** The board's tiles under the plates; off, the plates alone. */
  board?: boolean;
  /** Reduced motion: an instant change of state, a short fade (`prefers-reduced-motion` when unset). */
  reducedMotion?: boolean;
  /** The confirm plays again every this many ms (0: once). */
  replayMs?: number;
  /** sequence: Validate's hold, ms (800 in the game). */
  holdMs?: number;
  /** The voxel drop's clock (1 in the game; below 1 slows it, for a slowed capture played back faster). */
  dropSpeed?: number;
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
  /** The day and night cycle held at a phase of a summer's day (#588: the plates read by day, dusk and night); off, the look alone. */
  dayPhase?: DayPhase | "off";
  /** The view looks at the placed tile's cell instead of the board's middle. */
  onPlaced?: boolean;
  /** Fill the parent (a cell of `PendingLooks`) instead of the whole screen. */
  fill?: boolean;
  /** The placement settings, flat (`placementArgTypes`). */
  [arg: string]: unknown;
}

export const tiles = toRenderTiles(BOARD_72.tiles, 1);

function boundsOf(): Bounds {
  const xs = tiles.map((t) => t.worldX * TILE_SIZE);
  const zs = tiles.map((t) => t.worldZ * TILE_SIZE);
  const [minX, maxX, minZ, maxZ] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  const [cx, cz] = [(minX + maxX) / 2, (minZ + maxZ) / 2];
  const near = xs.map((x, i) => ({ x, z: zs[i], d: (x - cx) ** 2 + (zs[i] - cz) ** 2 })).sort((a, b) => a.d - b.d)[0];
  return { minX, maxX, minZ, maxZ, anchor: [near.x, near.z] };
}
export const BOUNDS = boundsOf();

/**
 * The empty cells next to a tile, each a plate of the tile in hand: two thirds playable (some rotation fits), a third
 * invalid (none does). A story's stand-in for the engine's legality.
 */
export const SLOTS: PlacementSlot[] = (() => {
  const taken = new Set(tiles.map((t) => `${t.worldX},${t.worldZ}`));
  const slots = new Map<string, PlacementSlot>();
  for (const t of tiles) {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const [x, y] = [t.worldX + dx, t.worldZ + dz];
      const k = (((x * 7 + y * 3) % 3) + 3) % 3;
      if (!taken.has(`${x},${y}`)) slots.set(`${x},${y}`, k === 0 ? { x, y, legal: false } : { x, y });
    }
  }
  return [...slots.values()];
})();

/** The slot nearest the board's centre that fits: where the tile is placed, with a plan already on the board (its model is in). */
export const PLACED: HoverState = (() => {
  const cx = (BOUNDS.minX + BOUNDS.maxX) / 2 / TILE_SIZE;
  const cz = (BOUNDS.minZ + BOUNDS.maxZ) / 2 / TILE_SIZE;
  const slot = SLOTS.filter((s) => s.legal !== false).sort((a, b) => (a.x - cx) ** 2 + (a.y - cz) ** 2 - ((b.x - cx) ** 2 + (b.y - cz) ** 2))[0]!;
  return { x: slot.x, y: slot.y, valid: true, idle: true, placed: true, planIndex: BOARD_72.tiles[1].plan, orientation: BOARD_72.tiles[1].orientation };
})();

/** Bounds shrunk to the placed tile's cell: every view looks at it (`onPlaced`). */
const PLACED_BOUNDS: Bounds = (() => {
  const [x, z] = [PLACED.x * TILE_SIZE, PLACED.y * TILE_SIZE];
  return { minX: x, maxX: x, minZ: z, maxZ: z, anchor: [x, z] };
})();

/** The board with the placed tile on its slot: the confirm's board. */
export const WITH_PLACED = [
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

/** Storybook controls for every placement setting, in groups; the plates' sizes in voxels. */
export function placementArgTypes(): Record<string, object> {
  const types: Record<string, object> = {};
  const range = (min: number, max: number, step: number) => ({ control: { type: "range", min, max, step } });
  // By `group.field`, then by field.
  const spec: Record<string, object> = {
    opacity: range(0, 1, 0.01),
    widthDevicePx: range(0.5, 3, 0.25),
    farFadeStart: range(0.85, 3, 0.05),
    "plates.gap": range(PLATE_GAP_VOXELS.min, PLATE_GAP_VOXELS.max, 0.5),
    "plates.radius": range(0, 20, 0.5),
    invalidOpacity: range(0, 1, 0.01),
    colorMs: range(0, 1000, 10),
    hoverMs: range(0, 1000, 10),
    pendingMs: range(0, 1000, 10),
    confirmMs: range(100, 2000, 10),
    reducedConfirmMs: range(0, 600, 10),
  };
  const units: Record<string, string> = { plates: " voxels" };
  for (const [arg, [group, field]] of Object.entries(FIELDS)) {
    const value = (DEFAULT_PLACEMENT_SETTINGS[group] as Record<string, unknown>)[field];
    const control = typeof value === "boolean" ? { control: "boolean" } : group === "colors" || /^color$|Color$/.test(field) ? { control: "color" } : (spec[`${group}.${field}`] ?? spec[field] ?? (group === "tints" ? range(0, 1, 0.01) : { control: "number" }));
    const unit = typeof value === "number" && units[group] && !/opacity|intensity/i.test(field) ? units[group] : "";
    types[arg] = { ...control, description: `${group}.${field} (default ${String(value)}${unit})`, table: { category: group } };
  }
  for (const k of [1, 2, 3]) {
    types[`gridRing${k}`] = { ...range(0, 1, 0.01), description: `grid.rings[${k - 1}]: the share at ring ${k} (default ${DEFAULT_PLACEMENT_SETTINGS.grid.rings[k - 1]})`, table: { category: "grid" } };
  }
  return types;
}

/**
 * The recorded 72-tile board with the placement visuals in one state (PLACEMENT-TINTS): the plates of a tile in hand
 * (playable, invalid), the tile hovering (untinted, half opacity), placed (yellow, opaque), and the confirm (green, fading
 * out); `board` off shows the plates alone. `sequence` plays the game's placement (#568). `data-ready` is set once the board
 * is drawn at the held view; `data-step` names the sequence's step.
 */
export function PlacementBoard({ state, onPlaced = false, fill = false, board = true, reducedMotion, replayMs = 1600, holdMs = 800, dropSpeed, view, distance, redraw = false, readout = true, force = "auto", maxPixelRatio = "auto", quality = "auto", lookPreset = "mockup", dayPhase = "off", ...args }: PlacementBoardProps) {
  const [scene, setScene] = useState<GameScene | null>(null);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState("");
  const [confirmKey, setConfirmKey] = useState(0);
  // The tour: hover, placed, then the confirm, every `replayMs`.
  const [phase, setPhase] = useState(0);
  const input = placementInput(args);
  const key = JSON.stringify([input, reducedMotion, force, maxPixelRatio, quality, lookPreset, dropSpeed, dayPhase]);
  const settings = useMemo<RendererSettingsInput>(
    () => ({ outlines: { force }, maxPixelRatio, quality, lookPreset, ...(dropSpeed ? { voxelDrop: { speed: dropSpeed } } : {}), ...(dayPhase === "off" ? {} : { dayNight: { enabled: true, season: "summer" as const, freezeAt: DAY_PHASE_AT[dayPhase] } }), placement: { ...input, motion: { ...input.motion, ...(reducedMotion === undefined ? {} : { reducedMotion }) } } }),
    [key], // eslint-disable-line react-hooks/exhaustive-deps
  );
  // The measuring scripts (the GPU flicker check) drive the camera by the scene itself: exact pans and distances; the
  // captures press the placed tile at its cell (#630).
  const onReady = useCallback((s: GameScene) => {
    setScene(s);
    Object.assign(window, { __placementScene: s, __placementCell: { x: PLACED.x, y: PLACED.y } });
  }, []);

  useEffect(() => {
    if (!scene) return;
    const pose = viewPose(view, onPlaced ? PLACED_BOUNDS : BOUNDS, distance);
    scene.controls.controls.target.set(...pose.target);
    scene.camera.position.set(...pose.position);
    scene.camera.lookAt(...pose.target);
    scene.requestRender();
    let id = requestAnimationFrame(() => (id = requestAnimationFrame(() => setReady(true))));
    return () => cancelAnimationFrame(id);
  }, [scene, view, distance, onPlaced]);

  // The confirm again and again, so its fade can be watched (and tuned).
  useEffect(() => {
    if (state !== "tour" || !ready) return;
    const id = setInterval(() => setPhase((p) => (p + 1) % 3), Math.max(600, replayMs));
    return () => clearInterval(id);
  }, [state, ready, replayMs]);
  useEffect(() => {
    if (state === "tour" && phase === 2) setConfirmKey((k) => k + 1);
  }, [state, phase]);

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

  // The sequence (#568): hover, then placed with its bubble; the hold on Validate lands the tile (the drop, then the green,
  // as the board plays them: `useDropThenConfirm`), and after `replayMs` the next tile hovers again.
  const [step, setStep] = useState<"hover" | "placed" | "landed">("hover");
  const [accepted, setAccepted] = useState<(HoverState & { key: number }) | null>(null);
  useEffect(() => {
    if (state !== "sequence" || !ready) return;
    const id = step === "hover" ? setTimeout(() => setStep("placed"), 1200) : step === "landed" ? setTimeout(() => setStep("hover"), Math.max(2500, replayMs)) : 0;
    return () => clearTimeout(id);
  }, [state, ready, step, replayMs]);
  useEffect(() => {
    if (state === "sequence" && step === "placed" && scene) void scene.prepareDropAt(PLACED);
  }, [state, step, scene]);
  const sequenceTiles = state === "sequence" && step === "landed" ? WITH_PLACED : tiles;
  const green = useDropThenConfirm(scene, sequenceTiles, accepted, (input.motion?.confirmMs as number | undefined) ?? undefined);
  const validate = useCallback(() => {
    setStep("landed");
    setAccepted((a) => ({ ...PLACED, placed: false, key: (a?.key ?? 0) + 1 }));
  }, []);
  // As on the board (TILE-HOLD, #630): a press on the placed tile itself holds Validate, its ring filling the same.
  const tileHold = useRef<Hold | null>(null);
  const onTilePress = useTileHold(state === "sequence" && step === "placed" ? PLACED : null, () => tileHold.current);

  const confirming = state === "confirm" || (state === "tour" && phase === 2);
  const slots = state === "idle" || confirming || (state === "sequence" && step === "landed") ? NO_SLOTS : SLOTS;
  const hover = useMemo<HoverState | null>(() => {
    if (!ready) return null;
    if (state === "sequence") return step === "hover" ? { ...PLACED, placed: false } : step === "placed" ? PLACED : null;
    if (state === "hover" || (state === "tour" && phase === 0)) return { ...PLACED, placed: false };
    if (state === "placed" || (state === "tour" && phase === 1)) return PLACED;
    return null;
  }, [state, ready, phase, step]);
  const confirmed = useMemo(() => (state === "sequence" ? green : confirming && ready && confirmKey > 0 ? { ...PLACED, key: confirmKey } : null), [state, green, confirming, ready, confirmKey]);
  // Confirmed, the tile is on the board (as the game draws it after a move); the tint fades over it.
  const shown = !board ? NO_TILES : confirming ? WITH_PLACED : state === "sequence" ? sequenceTiles : tiles;

  return (
    <div className={`relative h-full w-full overflow-hidden bg-board ${fill ? "" : "min-h-dvh"}`} data-ready={ready || undefined} data-step={state === "sequence" ? step : undefined}>
      <GameCanvas
        tiles={shown}
        availableSlots={slots}
        hover={hover}
        confirmed={confirmed}
        basePath={APP_ASSETS}
        settings={settings}
        onReady={onReady}
        onTilePress={onTilePress}
        style={{ position: "absolute", inset: 0 }}
      />
      {state === "sequence" && step === "placed" && scene && (
        <Suspense fallback={null}>
          <LazyTileBubble scene={scene} cell={{ x: PLACED.x, y: PLACED.y }} rotations={2} onRotate={() => {}} onClose={() => setStep("hover")} onConfirm={validate} holdMs={holdMs} holdRef={tileHold} />
        </Suspense>
      )}
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

/** The two looks of the tile in hand (#657): `hover`, the preview at half opacity, and `placed`, the pending tile with Faint. */
export const TILE_LOOKS = {
  hover: { label: "Hover · 50 %, its outlines", state: "hover" },
  placed: { label: "Pending · Faint, its outlines", state: "placed" },
} as const satisfies Record<string, { label: string; state: PlacementStoryState }>;
export type TileLook = keyof typeof TILE_LOOKS;

/**
 * The tile in hand's two looks side by side (#657): one board each, the same view; stacked on a phone, in a row from 640 px
 * (classes the app already has: a story's classes reach the app's CSS). `data-ready` once every board is drawn.
 */
export function PendingLooks({ view = "default", ...props }: Partial<PlacementBoardProps>) {
  return (
    <div className="flex h-dvh w-full flex-col gap-1 bg-background sm:flex-row">
      {(Object.keys(TILE_LOOKS) as TileLook[]).map((key) => (
        <section key={key} className="relative min-h-0 flex-1" data-look={key}>
          <PlacementBoard {...props} view={view} state={TILE_LOOKS[key].state} readout={false} fill />
          <h2 className="pointer-events-none absolute top-2 left-2 rounded-md bg-background/80 px-2 py-1 text-xs font-medium text-foreground">{TILE_LOOKS[key].label}</h2>
        </section>
      ))}
    </div>
  );
}
