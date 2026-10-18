/**
 * ASSET-SNAP (P-78): the column-parity check of the tile models, on the 0.1 voxel grid.
 *
 *   node scripts/voxel-parity.ts
 *
 * A tile model is a closed solid on a grid of 0.1-unit voxels, 40 by 40 columns, its ground at z = 0 and its top at negative z
 * (the node's rotation turns -z into up). The check casts one ray down each column, at the column's centre moved by a fixed
 * fraction of a voxel so that no ray runs along a triangle's edge, and counts the surface crossings. A closed solid is crossed
 * an even number of times: an odd count is an inconsistent entry, a column the voxelizer cannot tell inside from outside.
 * A stray vertex (a ramp across the tile) shows as a diagonal run of odd columns; a snap of such a vertex to the nearest grid
 * point does not clear them, the vertex has to go where the mesh around it says (`sfrfrfffr`, fixed in P-78).
 * The sweep reads the 19 base models and the 144 Forest ones, from `asset-sources/` and from the shipped copies in
 * `public/renderer-assets/models/` (decoded: meshopt, quantization, Draco), and exits 1 when any column is inconsistent.
 */
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO, type Primitive } from "@gltf-transform/core";
import { EXTMeshoptCompression, KHRDracoMeshCompression, KHRMeshQuantization } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, "..");
const GRID = 0.1;
/** The ray's offset from a column's centre: a fraction of a voxel, off every diagonal of the grid. */
const SHIFT: [number, number] = [1.3e-3, 2.1e-3];

export interface Parity {
  columns: number;
  /** The columns crossed an odd number of times, as `[i, j]` cell indices from the model's minimum corner. */
  odd: Array<[number, number]>;
  /** The columns the surface does not cross at all. */
  empty: number;
  triangles: number;
}

/** The column parity of one indexed triangle list (`positions` x, y, z per vertex, ground plane x-y, rays along z). */
export function columnParity(positions: ArrayLike<number>, indices: ArrayLike<number>): Parity {
  const lo = [Infinity, Infinity];
  const hi = [-Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 2; k++) {
      lo[k] = Math.min(lo[k]!, positions[i + k]!);
      hi[k] = Math.max(hi[k]!, positions[i + k]!);
    }
  }
  // The grid's origin: the minimum corner, on the grid up to the sources' float noise (Draco's 1.3e-4 included).
  const origin = lo.map((v) => Math.round(v / GRID) * GRID) as [number, number];
  const cells = hi.map((v, k) => Math.max(1, Math.round((v - origin[k]!) / GRID))) as [number, number];
  const crossings = new Uint16Array(cells[0] * cells[1]);
  const [nx, ny] = cells;
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [indices[t]! * 3, indices[t + 1]! * 3, indices[t + 2]! * 3];
    const [ax, ay, bx, by, cx, cy] = [positions[a]!, positions[a + 1]!, positions[b]!, positions[b + 1]!, positions[c]!, positions[c + 1]!];
    const det = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
    if (Math.abs(det) < 1e-12) continue; // seen edge-on from above: no ray crosses it
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - origin[0]) / GRID) - 1);
    const i1 = Math.min(nx - 1, Math.ceil((Math.max(ax, bx, cx) - origin[0]) / GRID) + 1);
    const j0 = Math.max(0, Math.floor((Math.min(ay, by, cy) - origin[1]) / GRID) - 1);
    const j1 = Math.min(ny - 1, Math.ceil((Math.max(ay, by, cy) - origin[1]) / GRID) + 1);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const x = origin[0] + (i + 0.5) * GRID + SHIFT[0];
        const y = origin[1] + (j + 0.5) * GRID + SHIFT[1];
        const u = ((x - ax) * (cy - ay) - (cx - ax) * (y - ay)) / det;
        const v = ((bx - ax) * (y - ay) - (x - ax) * (by - ay)) / det;
        if (u >= 0 && v >= 0 && u + v <= 1) crossings[i * ny + j]!++;
      }
    }
  }
  const odd: Array<[number, number]> = [];
  let empty = 0;
  crossings.forEach((n, k) => {
    if (n % 2) odd.push([Math.floor(k / ny), k % ny]);
    if (n === 0) empty++;
  });
  return { columns: crossings.length, odd, empty, triangles: indices.length / 3 };
}

/** The Draco decoder the high-forest sources need (the self-hosted copy, as `compress-models.ts` loads it). */
async function dracoDecoder(): Promise<unknown> {
  const file = resolve(APP, "asset-sources/draco/draco_decoder.js");
  const module = { exports: {} as unknown };
  new Function("module", "exports", "require", "__filename", "__dirname", readFileSync(file, "utf8"))(module, module.exports, createRequire(file), file, dirname(file));
  return (module.exports as () => Promise<unknown>)();
}

export async function reader() {
  await MeshoptDecoder.ready;
  return new NodeIO()
    .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization, KHRDracoMeshCompression])
    .registerDependencies({ "meshopt.decoder": MeshoptDecoder, "draco3d.decoder": await dracoDecoder() });
}

/** Every model file of the app: `[label, absolute path]`, the sources first, then the shipped copies. */
export function modelFiles(): Array<[string, string]> {
  const files: Array<[string, string]> = [];
  const add = (label: string, dir: string) => {
    for (const name of readdirSync(dir).filter((n) => n.endsWith(".glb")).sort()) files.push([`${label}/${name}`, join(dir, name)]);
  };
  add("asset-sources/models", join(APP, "asset-sources/models"));
  add("asset-sources/models/extended", join(APP, "asset-sources/models/extended"));
  add("public/renderer-assets/models", join(APP, "public/renderer-assets/models"));
  add("public/renderer-assets/models/forest", join(APP, "public/renderer-assets/models/forest"));
  return files;
}

/** The parity of one `.glb`, positions in the model's own frame (a shipped copy's node scale and offset applied). */
export async function modelParity(io: NodeIO, path: string): Promise<Parity> {
  const doc = await io.readBinary(readFileSync(path));
  const node = doc.getRoot().listNodes()[0]!;
  const prim: Primitive = doc.getRoot().listMeshes()[0]!.listPrimitives()[0]!;
  const position = prim.getAttribute("POSITION")!;
  const [s, t, q] = [node.getScale()[0], node.getTranslation(), node.getRotation()];
  // world = T + R (S p): back in the model's frame, p = S^-1 (R^-1 (world - T)); the sweep needs only the x-y plane's grid and z's
  // sign, so p' = p S + R^-1 T is read and the shared rotation left on. The sources have scale 1 and no translation.
  const inv = (v: number[]): [number, number, number] => {
    const [x, y, z, w] = [-q[0], -q[1], -q[2], q[3]];
    const c = [y * v[2]! - z * v[1]!, z * v[0]! - x * v[2]!, x * v[1]! - y * v[0]!];
    const d = [y * c[2]! - z * c[1]!, z * c[0]! - x * c[2]!, x * c[1]! - y * c[0]!];
    return [v[0]! + 2 * (w * c[0]! + d[0]!), v[1]! + 2 * (w * c[1]! + d[1]!), v[2]! + 2 * (w * c[2]! + d[2]!)];
  };
  const shift = inv(t);
  const out = new Float64Array(position.getCount() * 3);
  const el = [0, 0, 0];
  for (let i = 0; i < position.getCount(); i++) {
    position.getElement(i, el);
    for (let k = 0; k < 3; k++) out[i * 3 + k] = el[k]! * s + (shift[k] ?? 0);
  }
  return columnParity(out, prim.getIndices()!.getArray()!);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const io = await reader();
  let bad = 0;
  const files = modelFiles();
  for (const [label, path] of files) {
    const { odd, empty, triangles } = await modelParity(io, path);
    if (odd.length > 0) bad++;
    console.log(`${odd.length === 0 ? "ok  " : "ODD "} ${label}: ${triangles} triangles, ${odd.length} odd columns, ${empty} empty${odd.length ? `, first at ${JSON.stringify(odd.slice(0, 3))}` : ""}`);
  }
  console.log(`${files.length} models, ${bad} with inconsistent columns`);
  process.exit(bad ? 1 : 0);
}
