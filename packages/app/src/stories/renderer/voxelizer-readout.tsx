import { useEffect, useRef, useState } from "react";
import { AssetLoader, PALETTE_SIZE, voxelize, type VoxelGrid, type VoxelSource } from "@paved/renderer";
import { getPlanKey, Plan } from "@paved/game-core";
import { APP_ASSETS, APP_MANIFEST } from "../../mocks/assets";

/** The 19 plans' keys, in plan order. */
export const VOXELIZER_PLANS = Array.from({ length: 19 }, (_, i) => getPlanKey(Plan.from(i + 1).value));

export interface VoxelizerReadoutProps {
  /** The plan whose model is voxelized. */
  plan: string;
  /** The layer drawn as a slice (0 is the ground's first layer); clamped to the model's height. */
  layer: number;
}

/** What the readout needs of a loaded model: the mesh's geometry and matrix, and its palette image. */
export interface Loaded {
  source: VoxelSource;
  palette: CanvasImageSource | null;
}

interface MeshLike {
  isMesh?: boolean;
  geometry: VoxelSource["geometry"];
  matrixWorld: NonNullable<VoxelSource["toModel"]>;
  material?: { map?: { image?: CanvasImageSource } | null };
}

/** The mesh of a loaded model, as the renderer keeps it per model type (`TileRenderer.tileType`), its world matrix set. */
export function loadedOf(loader: AssetLoader, key: string): Loaded {
  const model = loader.getModel(key);
  model.updateMatrixWorld(true);
  let mesh: MeshLike | null = null;
  model.traverse((child) => {
    if ((child as unknown as MeshLike).isMesh) mesh = child as unknown as MeshLike;
  });
  const found = mesh as MeshLike | null;
  if (!found) throw new Error(`no mesh in ${key}`);
  return { source: { geometry: found.geometry, toModel: found.matrixWorld }, palette: found.material?.map?.image ?? null };
}

/** The 256 colours of a model's palette image, as `rgb(...)` strings (a grey ramp where the image did not come). */
export function paletteColors(image: CanvasImageSource | null): string[] {
  const grey = Array.from({ length: PALETTE_SIZE }, (_, i) => `rgb(${i},${i},${i})`);
  if (!image) return grey;
  const canvas = document.createElement("canvas");
  canvas.width = PALETTE_SIZE;
  canvas.height = 1;
  const context = canvas.getContext("2d");
  if (!context) return grey;
  context.drawImage(image, 0, 0, PALETTE_SIZE, 1);
  const { data } = context.getImageData(0, 0, PALETTE_SIZE, 1);
  return Array.from({ length: PALETTE_SIZE }, (_, i) => `rgb(${data[i * 4]},${data[i * 4 + 1]},${data[i * 4 + 2]})`);
}

const CELL_PX = 10;

/** One layer of a grid, a square per voxel in its palette colour; the ones with no free face once landed are drawn dimmer. */
function drawSlice(canvas: HTMLCanvasElement, grid: VoxelGrid, layer: number, colors: string[]): void {
  canvas.width = grid.sizeX * CELL_PX;
  canvas.height = grid.sizeY * CELL_PX;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.fillStyle = "#101010";
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (let v = 0; v < grid.count; v++) {
    if (grid.cells[v * 3 + 2] !== layer) continue;
    context.globalAlpha = grid.visible[v] ? 1 : 0.45;
    context.fillStyle = colors[grid.entry[v]!]!;
    context.fillRect(grid.cells[v * 3]! * CELL_PX, grid.cells[v * 3 + 1]! * CELL_PX, CELL_PX - 1, CELL_PX - 1);
  }
  context.globalAlpha = 1;
}

/** Loads the 19 models once (the app's compressed copies); `null` until they are in. */
export function useModels(): AssetLoader | null {
  const [loader, setLoader] = useState<AssetLoader | null>(null);
  useEffect(() => {
    const assets = new AssetLoader(APP_ASSETS, APP_MANIFEST);
    let alive = true;
    void assets.preloadModels().then(() => alive && setLoader(assets));
    return () => {
      alive = false;
      assets.dispose();
    };
  }, []);
  return loader;
}

/** One plan: the voxelizer's counts, its build time and a slice of one layer. */
export function VoxelizerReadout({ plan, layer }: VoxelizerReadoutProps) {
  const loader = useModels();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [shown, setShown] = useState<{ grid: VoxelGrid | null; colors: string[] } | null>(null);

  useEffect(() => {
    if (!loader) return;
    const { source, palette } = loadedOf(loader, plan);
    setShown({ grid: voxelize(source, { name: plan }), colors: paletteColors(palette) });
  }, [loader, plan]);

  const grid = shown?.grid ?? null;
  const at = grid ? Math.min(Math.max(0, layer), grid.layers - 1) : 0;
  useEffect(() => {
    if (canvas.current && grid && shown) drawSlice(canvas.current, grid, at, shown.colors);
  }, [grid, shown, at]);

  return (
    <div className="flex min-h-dvh flex-wrap items-start gap-6 bg-background p-6 text-foreground" data-ready={shown ? "" : undefined}>
      <output className="min-w-0 max-w-full break-words font-mono text-xs leading-6" aria-live="off">
        {!loader && "loading the models"}
        {shown && !grid && `${plan}: no voxels (logged)`}
        {grid && (
          <>
            <div>{plan}: {grid.sizeX} x {grid.sizeY} x {grid.layers} voxels, step {grid.step.toFixed(4)}</div>
            <div>solid {grid.count}, visible once landed {grid.visibleCount}</div>
            <div>ground slab {grid.slabCount} (layers 0 to {grid.groundTop}), above it {grid.count - grid.slabCount}</div>
            <div>build time {grid.buildMs.toFixed(1)} ms</div>
            <div>layer {at} of {grid.layers - 1} (the dimmer squares have no free face)</div>
          </>
        )}
      </output>
      <canvas ref={canvas} className="h-auto max-w-full border border-border" aria-label={`Layer ${at} of ${plan}`} />
    </div>
  );
}

/** Every plan, one row each: the counts and the build time of the first run and of the next ones (the browser's, not Node's). */
export function VoxelizerTable() {
  const loader = useModels();
  const [rows, setRows] = useState<Array<{ plan: string; grid: VoxelGrid | null; best: number }> | null>(null);
  useEffect(() => {
    if (!loader) return;
    setRows(
      VOXELIZER_PLANS.map((plan) => {
        const { source } = loadedOf(loader, plan);
        const grid = voxelize(source, { name: plan });
        let best = grid?.buildMs ?? 0;
        for (let i = 0; i < 9; i++) best = Math.min(best, voxelize(source, { name: plan })?.buildMs ?? best);
        return { plan, grid, best };
      }),
    );
  }, [loader]);
  return (
    <div className="min-h-dvh bg-background p-6 text-foreground" data-ready={rows ? "" : undefined}>
      <ul className="flex flex-col gap-2 font-mono text-xs">
        {rows?.map(({ plan, grid, best }) => (
          <li key={plan} className="flex flex-wrap gap-x-4 break-words">
            <span className="w-24">{plan}</span>
            <span>solid {grid?.count}</span>
            <span>visible {grid?.visibleCount}</span>
            <span>slab {grid?.slabCount}</span>
            <span>above {grid ? grid.count - grid.slabCount : ""}</span>
            <span>layers {grid?.layers}</span>
            <span>first {grid?.buildMs.toFixed(1)} ms</span>
            <span>best of 10 {best.toFixed(1)} ms</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
