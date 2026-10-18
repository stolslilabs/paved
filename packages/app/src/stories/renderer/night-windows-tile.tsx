import { useEffect, useMemo, useRef, useState } from "react";
import {
  AssetLoader,
  DEFAULT_LIGHT_VOLUME,
  PALETTE_CLASSES,
  buildLightVolume,
  detectWindows,
  labelTileColumns,
  paletteOfModel,
  planLayout,
  voxelize,
  type LightVolume,
  type OpeningKind,
  type VoxelGrid,
  type VolumeMethod,
  type Window,
} from "@paved/renderer";
import { APP_ASSETS, APP_MANIFEST } from "../../mocks/assets";
import { MARK_COLORS, drawIso, drawSlice, paletteRgb } from "./night-windows-iso";
import { VOXELIZER_PLANS, loadedOf } from "./voxelizer-readout";

export { VOXELIZER_PLANS as NIGHT_WINDOW_PLANS };

export type TileSkin = "base" | "forest";

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
  /** Mark the doors, the gaps (openings on the slab too low for a door), the candidates on unlit columns. */
  marks: Array<OpeningKind | "unlit">;
  /** The light volume (the steps "volume" and "slice"). */
  method: VolumeMethod;
  reach: number;
  falloff: number;
  intensity: number;
  lightColor: string;
  doorsLight: boolean;
  /** The layer of the slice. */
  layer: number;
  /** Day colours under the marks (the step "found"), or the night's. */
  night: boolean;
}

interface Baked {
  grid: VoxelGrid;
  kept: Window[];
  unlit: Window[];
  detectMs: number;
  voxelMs: number;
  rejected: Record<string, number>;
  colors: Array<[number, number, number]>;
  id: string;
}

/** The model id a plan and a skin draw: the base key, or the manifest's Forest variant (theme 1). */
function modelId(plan: string, skin: TileSkin, variant: number): string {
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
function useLoader(wanted: readonly string[] = []): AssetLoader | null {
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
const forestIds = (plans: readonly string[]): string[] => plans.flatMap((plan) => Array.from({ length: forestVariantCount(plan) }, (_, i) => modelId(plan, "forest", i + 1)));

/** Loads one model by id (a Forest variant loads on demand) and detects its windows; `null` while it comes. */
function useBaked(loader: AssetLoader | null, id: string, plan: string): Baked | null {
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
      const lights = paletteName ? labelTileColumns(source.geometry, planLayout(plan), source.toModel, PALETTE_CLASSES[paletteName]).lights : undefined;
      const started = performance.now();
      const all = detectWindows(grid);
      const kept = lights ? detectWindows(grid, lights) : all;
      const detectMs = (performance.now() - started) / 2;
      const key = (w: Window) => `${w.facing}:${w.x}:${w.y}:${w.layer}`;
      const keptKeys = new Set(kept.map(key));
      const unlit = all.filter((w) => !keptKeys.has(key(w)));
      const rejected: Record<string, number> = {};
      for (const w of kept) rejected[w.kind] = (rejected[w.kind] ?? 0) + 1;
      if (alive) setBaked({ grid, kept, unlit, detectMs, voxelMs, rejected, colors: paletteRgb(palette), id });
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
  }, [loader, id, plan]);
  return baked?.id === id ? baked : null;
}

const MARK_LABELS: Record<OpeningKind | "unlit", string> = {
  window: "window (sill above the slab)",
  door: "door (on the slab, 2+ cells high)",
  gap: "gap (on the slab, 1 cell high: a tree, a stone)",
  unlit: "candidate on an unlit column (dropped)",
};

/** The windows found per kind, size and facing, as lines of text. */
function summary(windows: readonly Window[]): string[] {
  const sizes: Record<string, number> = {};
  for (const w of windows) if (w.kind === "window") sizes[`${w.width}x${w.height}`] = (sizes[`${w.width}x${w.height}`] ?? 0) + 1;
  const facings = [0, 0, 0, 0];
  for (const w of windows) facings[w.facing]!++;
  return [`sizes (windows) ${Object.entries(sizes).map(([k, v]) => `${k}: ${v}`).join(", ") || "none"}`, `facing N ${facings[0]}, E ${facings[1]}, S ${facings[2]}, W ${facings[3]}`];
}

/** One tile: the isometric view with the marks and the light, the counts, the times and the volume's size. */
export function NightWindowsTile(props: NightWindowsTileProps) {
  const { plan, skin, variant, rotation, step, marks, method, reach, falloff, intensity, lightColor, doorsLight, layer, night } = props;
  const wanted = useMemo(() => (skin === "forest" ? forestIds([plan]) : []), [plan, skin]);
  const loader = useLoader(wanted);
  const id = modelId(plan, skin, variant);
  const baked = useBaked(loader, id, plan);
  const iso = useRef<HTMLCanvasElement>(null);
  const slice = useRef<HTMLCanvasElement>(null);

  const volume = useMemo<LightVolume | null>(() => {
    if (!baked || (step !== "volume" && step !== "slice")) return null;
    return buildLightVolume(baked.grid, baked.kept, { method, reach, falloff, doors: doorsLight });
  }, [baked, step, method, reach, falloff, doorsLight]);

  useEffect(() => {
    if (!iso.current || !baked) return;
    drawIso(iso.current, baked.grid, {
      rotation,
      colors: baked.colors,
      scale: 9,
      night: night || step !== "found",
      windows: baked.kept,
      marks: new Set(marks),
      unlit: baked.unlit,
      light: step === "glow" ? "windows" : step === "found" ? "none" : "volume",
      volume,
      lightColor,
      intensity: step === "glow" ? 1 : intensity,
    });
  }, [baked, volume, rotation, step, marks, lightColor, intensity, night]);

  const at = baked ? Math.min(Math.max(0, layer), baked.grid.layers - 1) : 0;
  useEffect(() => {
    if (slice.current && baked && volume && step === "slice") drawSlice(slice.current, baked.grid, volume, at);
  }, [baked, volume, step, at]);

  const counts = baked ? { window: 0, door: 0, gap: 0, ...Object.fromEntries(Object.entries(baked.rejected)) } : null;
  return (
    <div className="flex min-h-dvh flex-wrap items-start gap-6 bg-background p-6 text-foreground" data-ready={baked ? "" : undefined}>
      <canvas ref={iso} className="h-auto max-w-full border border-border" aria-label={`${id} with its windows`} />
      {step === "slice" && <canvas ref={slice} className="h-auto max-w-full border border-border" aria-label={`Light of layer ${at}`} />}
      <output className="min-w-0 max-w-full break-words font-mono text-xs leading-6" aria-live="off">
        {!baked && "loading the model"}
        {baked && counts && (
          <>
            <div>{id.slice(id.lastIndexOf("/") + 1)}: {baked.grid.sizeX} x {baked.grid.sizeY} x {baked.grid.layers} voxels</div>
            <div>windows {counts.window}, doors {counts.door}, gaps {counts.gap}; unlit candidates dropped {baked.unlit.length}</div>
            {summary(baked.kept).map((line) => <div key={line}>{line}</div>)}
            <div>voxelizer {baked.voxelMs.toFixed(1)} ms, detection {baked.detectMs.toFixed(1)} ms</div>
            {volume && (
              <>
                <div>light volume {volume.sizeX} x {volume.sizeY} x {volume.layers} cells, RG8 {volume.bytes} B ({(volume.bytes / 1024).toFixed(1)} KB)</div>
                <div>{volume.sources.length} sources, {method}, build {volume.buildMs.toFixed(2)} ms</div>
              </>
            )}
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
  doors: number;
  gaps: number;
  unlit: number;
  voxelMs: number;
  detectMs: number;
  volumeMs: number;
  volumeBytes: number;
  sizes: string;
}

/** Every plan, one row each: what the detection found and the cost of the bake in this browser (the readout, #513's item 4). */
export function NightWindowsTable({ skin }: { skin: TileSkin }) {
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
          const lights = name ? labelTileColumns(source.geometry, planLayout(plan), source.toModel, PALETTE_CLASSES[name]).lights : undefined;
          const detectBegan = performance.now();
          const all = detectWindows(grid);
          const kept = detectWindows(grid, lights);
          const detectMs = (performance.now() - detectBegan) / 2;
          const volume = buildLightVolume(grid, kept, DEFAULT_LIGHT_VOLUME);
          const sizes: Record<string, number> = {};
          for (const w of kept) if (w.kind === "window") sizes[`${w.width}x${w.height}`] = (sizes[`${w.width}x${w.height}`] ?? 0) + 1;
          out.push({
            plan: id.slice(id.lastIndexOf("/") + 1).replace(/\.[0-9a-f]{10}\.glb$/, ""),
            windows: kept.filter((w) => w.kind === "window").length,
            doors: kept.filter((w) => w.kind === "door").length,
            gaps: kept.filter((w) => w.kind === "gap").length,
            unlit: all.length - kept.length,
            voxelMs,
            detectMs,
            volumeMs: volume.buildMs,
            volumeBytes: volume.bytes,
            sizes: Object.entries(sizes).map(([k, v]) => `${k}:${v}`).join(" "),
          });
        }
      }
      if (alive) setRows(out);
    })();
    return () => {
      alive = false;
    };
  }, [loader, skin]);
  const total = rows?.reduce((sum, r) => ({ windows: sum.windows + r.windows, doors: sum.doors + r.doors, gaps: sum.gaps + r.gaps, unlit: sum.unlit + r.unlit }), { windows: 0, doors: 0, gaps: 0, unlit: 0 });
  return (
    <div className="min-h-dvh bg-background p-6 text-foreground" data-ready={rows ? "" : undefined}>
      {total && <div className="mb-3 font-mono text-xs">{rows!.length} models: windows {total.windows}, doors {total.doors}, gaps {total.gaps}, unlit candidates dropped {total.unlit}</div>}
      <ul className="flex flex-col gap-1 font-mono text-xs">
        {rows?.map((r) => (
          <li key={r.plan} className="flex flex-wrap gap-x-4 break-words">
            <span className="w-40">{r.plan}</span>
            <span>windows {r.windows}</span>
            <span>doors {r.doors}</span>
            <span>gaps {r.gaps}</span>
            <span>dropped {r.unlit}</span>
            <span>voxelize {r.voxelMs.toFixed(1)} ms</span>
            <span>detect {r.detectMs.toFixed(1)} ms</span>
            <span>volume {r.volumeMs.toFixed(1)} ms, {(r.volumeBytes / 1024).toFixed(0)} KB</span>
            <span>{r.sizes}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
