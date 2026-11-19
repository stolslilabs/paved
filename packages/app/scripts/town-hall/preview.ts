import { writeFileSync } from "node:fs";
import { writePng } from "./png.ts";
import type { Grid } from "./voxels.ts";
/** An oblique view from the south (or a plain top view): each voxel's top and south face, painter's order. */
export function preview(grid: Grid, pal: Uint8Array, file: string, opts: { top?: boolean; scale?: number; from?: "s" | "n" | "e" | "w" } = {}): void {
  const g = opts.from === "n" ? grid.turned(2) : opts.from === "e" ? grid.turned(1) : opts.from === "w" ? grid.turned(3) : grid;
  const s = opts.scale ?? 6, H = g.top();
  const w = g.sizeX * s, h = (opts.top ? g.sizeZ : g.sizeZ + H) * s;
  const img = new Uint8Array(w * h * 3).fill(24);
  const rect = (px: number, py: number, pw: number, ph: number, e: number, k: number) => { for (let y = Math.max(0, py); y < Math.min(h, py + ph); y++) for (let x = px; x < px + pw; x++) for (let c = 0; c < 3; c++) img[(y * w + x) * 3 + c] = Math.min(255, pal[e * 3 + c]! * k); };
  for (let z = 0; z < g.sizeZ; z++) for (let y = 0; y < g.height; y++) for (let x = 0; x < g.sizeX; x++) {
    const e = g.get(x, y, z); if (e < 0) continue;
    if (opts.top) { if (g.get(x, y + 1, z) < 0) rect(x * s, z * s, s, s, e, 0.75 + y * 0.012); continue; }
    const py = (z + H - y - 1) * s;
    if (g.get(x, y + 1, z) < 0) rect(x * s, py, s, s, e, 1.25);
    if (g.get(x, y, z + 1) < 0) rect(x * s, py + s, s, s, e, 0.8);
  }
  writeFileSync(file, writePng(w, h, img));
}
