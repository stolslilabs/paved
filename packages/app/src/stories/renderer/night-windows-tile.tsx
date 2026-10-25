import { useEffect, useMemo, useRef, useState } from "react";
import {
  AssetLoader,
  DEFAULT_LIGHT_VOLUME,
  DEFAULT_WINDOW_LIGHT,
  PALETTE_CLASSES,
  WALL_DIRECTIONS,
  buildLightVolume,
  cellIndex,
  findOpenings,
  paletteOfModel,
  plantEntries,
  voxelize,
  windowSwitch,
  type DropReason,
  type LightVolume,
  type OpeningFilter,
  type OpeningKind,
  type VoxelGrid,
  type VolumeMethod,
  type Window,
  type WindowDetection,
} from "@paved/renderer";
import { APP_ASSETS, APP_MANIFEST } from "../../mocks/assets";
import { MARK_COLORS, drawIso, drawSlice, paletteRgb } from "./night-windows-iso";
import { VOXELIZER_PLANS, loadedOf } from "./voxelizer-readout";

export { VOXELIZER_PLANS as NIGHT_WINDOW_PLANS };

export type TileSkin = "base" | "forest";

/** Which openings are kept (NIGHT-WINDOWS-2, #571): every structure's but the pockets in leaves (the renderer's), or all. */
export type StoryRule = "structures" | "none";

export interface NightWindowsTileProps {
  plan: string;
  /** The base model, or its Forest variant (through the skin: theme 1 of the manifest). */
  skin: TileSkin;
  /** Which Forest variant (1 to the number the plan has); clamped. */
  variant: number;
  /** Quarter turns of the view. */
  rotation: number;
  /** The step: the windows found; the windows glowing alone; the light volume; the volume with a slice beside it. */
  step: "found" | "glow" | "volume" | "slice";
  /** Mark the doors, the gaps (openings on the slab too low for a door), the candidates dropped by the rule. */
  marks: Array<OpeningKind | "unlit">;
  /** The rule that keeps the openings. */
  rule: StoryRule;
  /** Which openings are found: the second pass's (through the walls, into rooms), or the first's (recesses only, no room). */
  detection: WindowDetection;
  /** The light volume (the steps "volume" and "slice"). */
  method: VolumeMethod;
  reach: number;
  falloff: number;
  /** How far past the tile's border the light goes, in voxels (drawn on the ground round the tile). */
  margin: number;
  intensity: number;
  lightColor: string;
  doorsLight: boolean;
  /** The night's level the windows' switch-on is read at (0 day, 1 full night), and the spread of the switch-on levels. */
  nightLevel: number;
  stagger: number;
  /** The tile's cell on the board: the switch-on hash takes it, so another cell lights other windows first. */
  cellX: number;
  cellY: number;
  /** The layer of the slice. */
  layer: number;
  /** Day colours under the marks (the step "found"), or the night's. */
  night: boolean;
}

interface Baked {
  grid: VoxelGrid;
  kept: Window[];
  dropped: Array<Window & { reason: DropReason }>;
  plants: number[];
  detectMs: number;
  voxelMs: number;
  colors: Array<[number, number, number]>;
  id: string;
}

/** The model id a plan and a skin draw: the base key, or the manifest's Forest variant (theme 1). */
export function modelId(plan: string, skin: TileSkin, variant: number): string {
  const variants = APP_MANIFEST.themes?.["1"]?.[plan];
  if (skin === "forest" && variants?.length) return variants[Math.min(Math.max(1, variant), variants.length) - 1]!;
  return plan;
}

/** The number of Forest variants a plan has. */
export const forestVariantCount = (plan: string): number => APP_MANIFEST.themes?.["1"]?.[plan]?.length ?? 0;

/**
 * The loader of a story. The models in `wanted` (Forest variants) are asked for before `preloadAll`, which is what makes the
 * loader choose them: a `want` after `preloadModels` alone would queue them and never load them. With none wanted, the 19 base models.
 */
export function useLoader(wanted: readonly string[] = []): AssetLoader | null {
  const [loader, setLoader] = useState<AssetLoader | null>(null);
  const key = wanted.join(",");
  useEffect(() => {
    const assets = new AssetLoader(APP_ASSETS, APP_MANIFEST);
    let alive = true;
    setLoader(null);
    if (key) assets.want(key.split(","));
    void (key ? assets.preloadAll() : assets.preloadModels()).then(() => alive && setLoader(assets));
    return () => {
      alive = false;
      assets.dispose();
    };
  }, [key]);
  return loader;
}

/** The ids of a plan's Forest variants, or of every plan's. */
export const forestIds = (plans: readonly string[]): string[] => plans.flatMap((plan) => Array.from({ length: forestVariantCount(plan) }, (_, i) => modelId(plan, "forest", i + 1)));

/** The filter a rule gives (`findOpenings`): the renderer's, from the model's palette's vegetation, or none. */
function filterOf(rule: StoryRule, plants: number[], detection: WindowDetection): OpeningFilter {
  const recessesOnly = detection === "recesses";
  return rule === "structures" ? { vegetation: plants, recessesOnly } : { recessesOnly };
}

/** Loads one model by id (a Forest variant loads on demand) and detects its windows under `rule`; `null` while it comes. */
function useBaked(loader: AssetLoader | null, id: string, rule: StoryRule, detection: WindowDetection): Baked | null {
  const [baked, setBaked] = useState<Baked | null>(null);
  useEffect(() => {
    if (!loader) return;
    let alive = true;
    const bake = () => {
      const { source, palette } = loadedOf(loader, id);
      const began = performance.now();
      const grid = voxelize(source, { name: id });
      const voxelMs = performance.now() - began;
      if (!grid) return;
      const paletteName = paletteOfModel(id);
      const classes = paletteName ? PALETTE_CLASSES[paletteName] : undefined;
      const plants = plantEntries(classes?.vegetation ?? []);
      const started = performance.now();
      const found = findOpenings(grid, filterOf(rule, plants, detection));
      const detectMs = performance.now() - started;
      if (alive) setBaked({ grid, kept: found.windows, dropped: found.dropped, plants, detectMs, voxelMs, colors: paletteRgb(palette), id });
    };
    if (loader.has(id)) bake();
    else {
      loader.onLoaded(() => {
        if (loader.has(id)) {
          loader.onLoaded(null);
          bake();
        }
      });
      loader.want([id]);
    }
    return () => {
      alive = false;
    };
  }, [loader, id, rule, detection]);
  return baked?.id === id ? baked : null;
}

const MARK_LABELS: Record<OpeningKind | "unlit", string> = {
  window: "window (sill above the slab)",
  door: "door (on the slab, 2+ cells high)",
  gap: "gap (on the slab, 1 cell high: a tree, a stone)",
  unlit: "dropped by the rule (its reason in the readout)",
};

const FACING = ["N", "E", "S", "W"] as const;

/** How many items each key has. */
function countBy<T>(items: readonly T[], key: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) counts[key(item)] = (counts[key(item)] ?? 0) + 1;
  return counts;
}

/** The windows found per kind, size and facing, as lines of text. */
function summary(windows: readonly Window[]): string[] {
  const sizes: Record<string, number> = {};
  for (const w of windows) if (w.kind === "window") sizes[`${w.width}x${w.height}`] = (sizes[`${w.width}x${w.height}`] ?? 0) + 1;
  const facings = [0, 0, 0, 0];
  for (const w of windows) if (w.kind === "window") facings[w.facing]!++;
  const through = windows.filter((w) => w.kind === "window" && w.through).length;
  return [
    `sizes (windows) ${Object.entries(sizes).map(([k, v]) => `${k}: ${v}`).join(", ") || "none"}`,
    `facing N ${facings[0]}, E ${facings[1]}, S ${facings[2]}, W ${facings[3]}; through a wall ${through}, recesses ${windows.filter((w) => w.kind === "window").length - through}`,
  ];
}

export interface StructureRow {
  /** Its number on the view. */
  label: number;
  /** Its box: the first column and the size (columns along x, along y, layers). */
  x: number;
  y: number;
  size: string;
  /** The top's middle, where the number is drawn. */
  top: readonly [number, number, number];
  /** Per wall (N, E, S, W): the windows kept, and those dropped. */
  kept: [number, number, number, number];
  dropped: [number, number, number, number];
  reasons: string;
  /** The doors kept (#583: lit as the windows are). */
  doors: number;
  /** The kept windows and doors lit (a source of the volume, switch-on at least a half) at full night and at the story's level. */
  litNight: number;
  litNow: number;
  windows: number;
}

/**
 * The structures of a tile and their windows, per wall (#571, the owner's hint: a rectangular structure has a window on each
 * wall, and each should light), and their doors (#583). A structure is a connected body of solid cells over the slab that are
 * not leaves or trunks (`plants`); a window or a door belongs to the structure of the wall round it. Lit: a source of the volume
 * whose owner's switch-on (`windowSwitch`, the shader's) is on at full night and at `level`, on the tile's cell.
 */
export function structuresOf(grid: VoxelGrid, kept: readonly Window[], dropped: ReadonlyArray<Window & { reason: DropReason }>, volume: LightVolume, plants: readonly number[], level: number, stagger: number, cell: readonly [number, number]): StructureRow[] {
  const { sizeX, sizeY, layers, groundTop } = grid;
  const plant = new Set(plants);
  const body = new Int32Array(sizeX * sizeY * layers).fill(-2);
  for (let v = 0; v < grid.count; v++) {
    const [x, y, l] = [grid.cells[v * 3]!, grid.cells[v * 3 + 1]!, grid.cells[v * 3 + 2]!];
    if (l > groundTop && !plant.has(grid.entry[v]!)) body[cellIndex(grid, x, y, l)] = -1;
  }
  const boxes: Array<[number, number, number, number, number, number]> = [];
  for (let start = 0; start < body.length; start++) {
    if (body[start] !== -1) continue;
    const id = boxes.length;
    const box: [number, number, number, number, number, number] = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    const stack = [start];
    body[start] = id;
    while (stack.length) {
      const i = stack.pop()!;
      const [x, y, l] = [i % sizeX, Math.floor(i / sizeX) % sizeY, Math.floor(i / (sizeX * sizeY))];
      box[0] = Math.min(box[0], x);
      box[1] = Math.min(box[1], y);
      box[2] = Math.min(box[2], l);
      box[3] = Math.max(box[3], x);
      box[4] = Math.max(box[4], y);
      box[5] = Math.max(box[5], l);
      for (const [dx, dy, dl] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const) {
        const [nx, ny, nl] = [x + dx, y + dy, l + dl];
        if (nx < 0 || ny < 0 || nl < 0 || nx >= sizeX || ny >= sizeY || nl >= layers) continue;
        const n = cellIndex(grid, nx, ny, nl);
        if (body[n] !== -1) continue;
        body[n] = id;
        stack.push(n);
      }
    }
    boxes.push(box);
  }
  // The structure of a window: that of the first cell of the ring round it (a side, the sill, the lintel).
  const of = (w: Window) => {
    const [dx] = WALL_DIRECTIONS[w.facing]!;
    const [ax, ay] = dx === 0 ? [1, 0] : [0, 1];
    for (const [x, y, l] of [[w.x - ax, w.y - ay, w.layer], [w.x, w.y, w.layer - 1], [w.x, w.y, w.layer + w.height], [w.x + ax * w.width, w.y + ay * w.width, w.layer]] as const) {
      if (x < 0 || y < 0 || l < 0 || x >= sizeX || y >= sizeY || l >= layers) continue;
      const id = body[cellIndex(grid, x, y, l)]!;
      if (id >= 0) return id;
    }
    return -1;
  };
  const rows = new Map<number, Omit<StructureRow, "label">>();
  const row = (id: number) => {
    let r = rows.get(id);
    if (!r) {
      const box = boxes[id]!;
      r = {
        x: box[0],
        y: box[1],
        size: `${box[3] - box[0] + 1} x ${box[4] - box[1] + 1} x ${box[5] - box[2] + 1}`,
        top: [Math.round((box[0] + box[3]) / 2), Math.round((box[1] + box[4]) / 2), box[5]],
        kept: [0, 0, 0, 0],
        dropped: [0, 0, 0, 0],
        reasons: "",
        doors: 0,
        litNight: 0,
        litNow: 0,
        windows: 0,
      };
      rows.set(id, r);
    }
    return r;
  };
  for (const w of kept) {
    if (w.kind === "gap") continue;
    const id = of(w);
    if (id < 0) continue;
    const r = row(id);
    if (w.kind === "door") r.doors++;
    else {
      r.kept[w.facing]!++;
      r.windows++;
    }
    const source = volume.sources.indexOf(w);
    if (source < 0) continue;
    const owner = volume.owners[source]!;
    if (windowSwitch(owner, cell[0], cell[1], 1, stagger) >= 0.5) r.litNight++;
    if (windowSwitch(owner, cell[0], cell[1], level, stagger) >= 0.5) r.litNow++;
  }
  const reasons = new Map<number, Record<string, number>>();
  for (const w of dropped) {
    if (w.kind !== "window") continue;
    const id = of(w);
    if (id < 0) continue;
    row(id).dropped[w.facing]!++;
    const counts = reasons.get(id) ?? {};
    counts[w.reason] = (counts[w.reason] ?? 0) + 1;
    reasons.set(id, counts);
  }
  for (const [id, counts] of reasons) row(id).reasons = Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ");
  return [...rows.values()]
    .sort((a, b) => b.windows + b.doors + b.dropped.reduce((p, q) => p + q) - (a.windows + a.doors + a.dropped.reduce((p, q) => p + q)) || a.y - b.y || a.x - b.x)
    .map((r, i) => ({ ...r, label: i + 1 }));
}

/** The structures shown in the readout and numbered on the view. */
const STRUCTURE_ROWS = 14;

/** One tile: the isometric view with the marks and the light, the counts, the times, the volume's size and the structures. */
export function NightWindowsTile(props: NightWindowsTileProps) {
  const { plan, skin, variant, rotation, step, marks, rule, detection, method, reach, falloff, margin, intensity, lightColor, doorsLight, nightLevel, stagger, cellX, cellY, layer, night } = props;
  const wanted = useMemo(() => (skin === "forest" ? forestIds([plan]) : []), [plan, skin]);
  const loader = useLoader(wanted);
  const id = modelId(plan, skin, variant);
  const baked = useBaked(loader, id, rule, detection);
  const iso = useRef<HTMLCanvasElement>(null);
  const slice = useRef<HTMLCanvasElement>(null);

  // Built at every step: the readout's owners need it; the view draws it only at "volume" and "slice".
  const volume = useMemo<LightVolume | null>(() => (baked ? buildLightVolume(baked.grid, baked.kept, { method, reach, falloff, margin, doors: doorsLight }) : null), [baked, method, reach, falloff, margin, doorsLight]);
  const structures = useMemo(() => (baked && volume ? structuresOf(baked.grid, baked.kept, baked.dropped, volume, baked.plants, nightLevel, stagger, [cellX, cellY]) : []), [baked, volume, nightLevel, stagger, cellX, cellY]);

  useEffect(() => {
    if (!iso.current || !baked) return;
    drawIso(iso.current, baked.grid, {
      rotation,
      colors: baked.colors,
      scale: 9,
      night: night || step !== "found",
      windows: baked.kept,
      marks: new Set(marks),
      unlit: baked.dropped,
      light: step === "glow" ? "windows" : step === "found" ? "none" : "volume",
      volume,
      lightColor,
      intensity: step === "glow" ? 1 : intensity,
      switchOf: (owner) => windowSwitch(owner, cellX, cellY, nightLevel, stagger),
      labels: structures.slice(0, STRUCTURE_ROWS).map((s) => ({ x: s.top[0], y: s.top[1], layer: s.top[2], text: `#${s.label}` })),
    });
  }, [baked, volume, structures, rotation, step, marks, lightColor, intensity, night, nightLevel, stagger, cellX, cellY]);

  const at = baked ? Math.min(Math.max(0, layer), baked.grid.layers - 1) : 0;
  useEffect(() => {
    if (slice.current && baked && volume && step === "slice") drawSlice(slice.current, baked.grid, volume, at);
  }, [baked, volume, step, at]);

  const counts = baked ? { window: 0, door: 0, gap: 0, ...countBy(baked.kept, (w) => w.kind) } : null;
  const reasons = baked ? Object.entries(countBy(baked.dropped, (w) => w.reason)).map(([k, v]) => `${v} ${k}`).join(", ") || "none" : "";
  return (
    <div className="flex min-h-dvh flex-wrap items-start gap-6 bg-background p-6 text-foreground" data-ready={baked ? "" : undefined}>
      <canvas ref={iso} className="h-auto max-w-full border border-border" aria-label={`${id} with its windows`} />
      {step === "slice" && <canvas ref={slice} className="h-auto max-w-full border border-border" aria-label={`Light of layer ${at}`} />}
      <output className="min-w-0 max-w-full break-words font-mono text-xs leading-6" aria-live="off">
        {!baked && "loading the model"}
        {baked && counts && volume && (
          <>
            <div>{id.slice(id.lastIndexOf("/") + 1)}: {baked.grid.sizeX} x {baked.grid.sizeY} x {baked.grid.layers} voxels; rule: {rule}; detection: {detection}</div>
            <div>windows {counts.window}, doors {counts.door}, gaps {counts.gap}; dropped: {reasons}</div>
            {summary(baked.kept).map((line) => <div key={line}>{line}</div>)}
            <div>voxelizer {baked.voxelMs.toFixed(1)} ms, detection {baked.detectMs.toFixed(1)} ms</div>
            <div>light volume {volume.sizeX} x {volume.sizeY} x {volume.layers} cells, RG8 {(volume.bytes / 1024).toFixed(1)} KB; spill {volume.spill.size} x {volume.spill.size} ({(volume.spill.data.byteLength / 1024).toFixed(1)} KB, margin {volume.spill.margin})</div>
            <div>{volume.sources.length} sources, {new Set(volume.owners).size} owners (a room's windows share one), {method}, build {volume.buildMs.toFixed(2)} ms</div>
            <div>switch-on at level {nightLevel.toFixed(2)} (stagger {stagger}) on cell {cellX}, {cellY}</div>
            {/* One line a structure, wrapping on a phone (a table would not fit 320 px). */}
            <div className="mt-2">Structures (numbered on the view): windows kept per wall N E S W (/dropped), doors, windows and doors lit at full night and at the level</div>
            <ul className="flex flex-col gap-1">
              {structures.slice(0, STRUCTURE_ROWS).map((s) => (
                <li key={s.label} className="break-words">
                  #{s.label} {s.size} at {s.x},{s.y} · {FACING.map((f, i) => `${f} ${s.kept[i]}${s.dropped[i] ? `/${s.dropped[i]}` : ""}`).join(" ")} · doors {s.doors} · lit {s.litNight}/{s.windows + s.doors} night, {s.litNow}/{s.windows + s.doors} now
                  {s.reasons && ` · dropped ${s.reasons}`}
                </li>
              ))}
            </ul>
            {structures.length > STRUCTURE_ROWS && <div>and {structures.length - STRUCTURE_ROWS} more</div>}
            <ul className="mt-2 flex flex-col gap-1">
              {(Object.keys(MARK_COLORS) as Array<keyof typeof MARK_COLORS>).map((kind) => (
                <li key={kind} className="flex items-center gap-2" style={{ opacity: marks.includes(kind) ? 1 : 0.4 }}>
                  <span className="inline-block size-3 border-2" style={{ borderColor: MARK_COLORS[kind] }} />
                  {MARK_LABELS[kind]}
                </li>
              ))}
            </ul>
            {step === "slice" && <div>layer {at} of {baked.grid.layers - 1}</div>}
          </>
        )}
      </output>
    </div>
  );
}

export interface WindowsTableRow {
  plan: string;
  windows: number;
  through: number;
  doors: number;
  gaps: number;
  dropped: string;
  owners: number;
  voxelMs: number;
  detectMs: number;
  volumeMs: number;
  volumeBytes: number;
  spillBytes: number;
  sizes: string;
}

/** Every plan, one row each: what the detection found and the cost of the bake in this browser (the readout, #513's item 4). */
export function NightWindowsTable({ skin, rule = "structures", detection = "through" }: { skin: TileSkin; rule?: StoryRule; detection?: WindowDetection }) {
  const wanted = useMemo(() => (skin === "forest" ? forestIds(VOXELIZER_PLANS) : []), [skin]);
  const loader = useLoader(wanted);
  const [rows, setRows] = useState<WindowsTableRow[] | null>(null);
  useEffect(() => {
    if (!loader) return;
    let alive = true;
    void (async () => {
      const out: WindowsTableRow[] = [];
      for (const plan of VOXELIZER_PLANS) {
        const ids = skin === "forest" ? Array.from({ length: forestVariantCount(plan) }, (_, i) => modelId(plan, "forest", i + 1)) : [plan];
        for (const id of ids) {
          if (!loader.has(id)) {
            await new Promise<void>((resolve) => {
              loader.onLoaded(() => loader.has(id) && resolve());
              loader.want([id]);
            });
            loader.onLoaded(null);
          }
          const { source } = loadedOf(loader, id);
          const began = performance.now();
          const grid = voxelize(source, { name: id });
          const voxelMs = performance.now() - began;
          if (!grid) continue;
          const name = paletteOfModel(id);
          const classes = name ? PALETTE_CLASSES[name] : undefined;
          const detectBegan = performance.now();
          const found = findOpenings(grid, filterOf(rule, plantEntries(classes?.vegetation ?? []), detection));
          const detectMs = performance.now() - detectBegan;
          const kept = found.windows;
          const volume = buildLightVolume(grid, kept, { ...DEFAULT_LIGHT_VOLUME, reach: DEFAULT_WINDOW_LIGHT.reach, falloff: DEFAULT_WINDOW_LIGHT.falloff, margin: DEFAULT_WINDOW_LIGHT.margin });
          const sizes: Record<string, number> = {};
          for (const w of kept) if (w.kind === "window") sizes[`${w.width}x${w.height}`] = (sizes[`${w.width}x${w.height}`] ?? 0) + 1;
          const dropped = Object.entries(countBy(found.dropped, (w) => w.reason)).map(([k, v]) => `${v} ${k}`);
          out.push({
            plan: id.slice(id.lastIndexOf("/") + 1).replace(/\.[0-9a-f]{10}\.glb$/, ""),
            windows: kept.filter((w) => w.kind === "window").length,
            through: kept.filter((w) => w.kind === "window" && w.through).length,
            doors: kept.filter((w) => w.kind === "door").length,
            gaps: kept.filter((w) => w.kind === "gap").length,
            dropped: dropped.join(", ") || "0",
            owners: new Set(volume.owners).size,
            voxelMs,
            detectMs,
            volumeMs: volume.buildMs,
            volumeBytes: volume.bytes,
            spillBytes: volume.spill.data.byteLength,
            sizes: Object.entries(sizes).map(([k, v]) => `${k}:${v}`).join(" "),
          });
        }
      }
      if (alive) setRows(out);
    })();
    return () => {
      alive = false;
    };
  }, [loader, skin, rule, detection]);
  const total = rows?.reduce((sum, r) => ({ windows: sum.windows + r.windows, through: sum.through + r.through, doors: sum.doors + r.doors, gaps: sum.gaps + r.gaps }), { windows: 0, through: 0, doors: 0, gaps: 0 });
  return (
    <div className="min-h-dvh bg-background p-6 text-foreground" data-ready={rows ? "" : undefined}>
      {total && (
        <div className="mb-3 font-mono text-xs">
          {rows!.length} models, rule {rule}, detection {detection}: windows {total.windows} ({total.through} through a wall), doors {total.doors}, gaps {total.gaps}
        </div>
      )}
      <ul className="flex flex-col gap-1 font-mono text-xs">
        {rows?.map((r) => (
          <li key={r.plan} className="flex flex-wrap gap-x-4 break-words">
            <span className="w-40">{r.plan}</span>
            <span>windows {r.windows} ({r.through} through)</span>
            <span>doors {r.doors}</span>
            <span>gaps {r.gaps}</span>
            <span>dropped {r.dropped}</span>
            <span>owners {r.owners}</span>
            <span>voxelize {r.voxelMs.toFixed(1)} ms</span>
            <span>detect {r.detectMs.toFixed(1)} ms</span>
            <span>volume {r.volumeMs.toFixed(1)} ms, {(r.volumeBytes / 1024).toFixed(0)} KB + spill {(r.spillBytes / 1024).toFixed(1)} KB</span>
            <span>{r.sizes}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
