/**
 * ASSET-WEIGHT: the app's copy of the board's 19 base models, compressed and content-hashed, from app-web's originals; and
 * (P11b) the Forest theme's, the high-forest set.
 *
 *   node scripts/compress-models.ts [--check]
 *
 * Reads `../app-web/public/models/<plan>.glb` (left untouched) and writes `public/renderer-assets/models/<plan>.<hash>.glb`;
 * reads the high-forest variants `../app-web/public/models/extended/<plan>_HF_<n>.glb` (theme 1, Forest, on chain) and writes
 * `public/renderer-assets/models/forest/<plan>_HF_<n>.<hash>.glb`. Each run removes the copies of an earlier one. The
 * low-forest set (`_LF_`) is kept for a later theme and not written. `--check` writes nothing and fails when the committed
 * copies are not exactly what this run would write. Node 24 runs it as is (type stripping): the syntax stays erasable.
 *
 * Per model (positions lossless on the grid; normals and UVs within 0.001 degree / 8e-6):
 * - Vertices renumbered in the order the triangles first use them (the triangles and their order are kept, so the
 *   renderer's outlines, which pair triangles in index order, find the same edges).
 * - `KHR_mesh_quantization`, every attribute normalized: positions as 8-bit integers on the voxel grid (every coordinate a
 *   multiple of 0.1 within 127 steps, as the tiles are: one grid step per integer, exact), else as 16-bit (a power of two
 *   of integers per grid step on a larger grid, or the largest coordinate at 32767 off the grid); normals as 16-bit; UVs
 *   as unsigned 16-bit. The scale goes on the model's node. Normalized, the positions three reads stay within [-1, 1],
 *   where the renderer's outline builder (`edges.ts`) keys vertices by number: integers read raw (up to 40) sent it to
 *   its string keys, which made the busy board's first frame slower than with the originals.
 * - `EXT_meshopt_compression` (required), mode `quantize`: meshopt's vertex and index codecs, no lossy filter.
 * Each output is decoded again and checked against its source before it is written: same triangles, positions within
 * half a quantization step, normals within 0.01 degree, UVs within 1e-5.
 *
 * The name's hash is the first 10 hex digits of the file's SHA-256, so a changed model gets a new name and the host can
 * cache every model forever (`docs/client/v2-architecture.md`, 4.2). Versions: `@gltf-transform/core` and
 * `@gltf-transform/extensions` 4.5.1, `meshoptimizer` 1.1.1 (devDependencies of `@paved/app`, pinned).
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync, unlinkSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO, type Document, type Primitive } from "@gltf-transform/core";
import { EXTMeshoptCompression, KHRDracoMeshCompression, KHRMeshQuantization } from "@gltf-transform/extensions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = resolve(HERE, "../../app-web/public/models");
const OUT = resolve(HERE, "../public/renderer-assets/models");

/**
 * The sets written: the base models, and each theme's in its own folder (named as `vite/renderer-assets.ts`'s
 * `THEME_FOLDERS`). `match` takes a source name to the output's stem (the name before the hash), or null.
 */
const SETS: Array<{ label: string; source: string; out: string; match: (file: string) => string | null }> = [
  { label: "base", source: SOURCE, out: OUT, match: (file) => /^([a-z]{9})\.glb$/.exec(file)?.[1] ?? null },
  // Forest (theme 1): the high-forest variants, every plan has at least one.
  { label: "forest", source: join(SOURCE, "extended"), out: join(OUT, "forest"), match: (file) => /^([a-z]{9}_HF_\d+)\.glb$/.exec(file)?.[1] ?? null },
];
/** The voxel grid: every tile model is a 4-unit grid of 0.1-unit voxels (`outlines.ts`, `TILE_VOXELS`). */
const GRID = 0.1;

/**
 * The Draco decoder the high-forest sources need (they are `KHR_draco_mesh_compression`): app-web's self-hosted copy,
 * Google's glTF build as three ships it (`public/draco/README.md`), the one the renderer loads. Its JavaScript build (no
 * WebAssembly file to fetch) is a CommonJS factory: it runs here with a `module` of its own, so no package is added.
 */
async function dracoDecoder(): Promise<unknown> {
  const file = resolve(SOURCE, "../draco/draco_decoder.js");
  const module = { exports: {} as unknown };
  new Function("module", "exports", "require", "__filename", "__dirname", readFileSync(file, "utf8"))(module, module.exports, createRequire(file), file, dirname(file));
  return (module.exports as () => Promise<unknown>)();
}

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization, KHRDracoMeshCompression])
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder, "draco3d.decoder": await dracoDecoder() });

const hashOf = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex").slice(0, 10);

/** The one primitive of a tile model (one node, one mesh, one indexed triangle list), or an error naming what differs. */
function onlyPrimitive(doc: Document, name: string): Primitive {
  const nodes = doc.getRoot().listNodes();
  const meshes = doc.getRoot().listMeshes();
  if (nodes.length !== 1 || meshes.length !== 1 || nodes[0]!.getMesh() !== meshes[0]) throw new Error(`${name}: not one node with one mesh`);
  const prims = meshes[0]!.listPrimitives();
  if (prims.length !== 1 || prims[0]!.getMode() !== 4 || !prims[0]!.getIndices()) throw new Error(`${name}: not one indexed triangle list`);
  const scale = nodes[0]!.getScale();
  if (scale[0] !== scale[1] || scale[1] !== scale[2]) throw new Error(`${name}: the node's scale is not uniform`);
  return prims[0]!;
}

/**
 * The model units of one stored integer step: on the voxel grid, the grid step over the largest power of two that keeps
 * the largest coordinate within 32767 (so a grid point is stored exactly); else the largest coordinate over 32767.
 */
function positionQuantum(positions: ArrayLike<number>): { quantum: number; grid: boolean; top: 127 | 32767 } {
  let max = 0;
  let onGrid = true;
  for (let i = 0; i < positions.length; i++) {
    const v = positions[i]!;
    max = Math.max(max, Math.abs(v));
    if (Math.abs(v / GRID - Math.round(v / GRID)) > 1e-3) onGrid = false;
  }
  const steps = Math.round(max / GRID);
  // A power of two: its multiples leave the low bits zero, which meshopt's codec stores in almost nothing.
  // A grid of at most 127 steps fits 8 bits, one step per integer (1/127 apart as three reads them, far above the outline
  // builder's 1e-4 weld). A larger one takes 16 bits, at a power of two of integers per step, so that grid points stay
  // apart there too and the low bits stay zero (which meshopt's codec stores in almost nothing).
  if (onGrid && steps > 0 && steps <= 127) return { quantum: GRID, grid: true, top: 127 };
  if (onGrid && steps > 0 && steps <= 32767) return { quantum: GRID / 2 ** Math.floor(Math.log2(32767 / steps)), grid: true, top: 32767 };
  return { quantum: (max || 1) / 32767, grid: false, top: 32767 };
}

/**
 * The grid a Draco source was quantized on, or null: Draco stores each position as an integer `q` of `bits` bits, read back
 * as `min[axis] + q * step`, with `step` the largest axis extent over `2^bits - 1`. Found by trying 8 to 15 bits (16 would not fit a normalized signed
 * 16-bit, which reads -32768 as -32767); every
 * coordinate must sit on the grid (within 1% of a step, float32's rounding of the decoded value), so storing `q` keeps the
 * source's positions exactly. The high-forest models are such sources, off the 0.1 grid and away from the origin.
 */
function dracoGrid(positions: ArrayLike<number>): { min: [number, number, number]; step: number; centre: number } | null {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i++) {
    min[i % 3] = Math.min(min[i % 3]!, positions[i]!);
    max[i % 3] = Math.max(max[i % 3]!, positions[i]!);
  }
  const range = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  if (!(range > 0)) return null;
  for (let bits = 8; bits <= 15; bits++) {
    const step = range / (2 ** bits - 1);
    let on = true;
    for (let i = 0; i < positions.length && on; i++) {
      const q = (positions[i]! - min[i % 3]!) / step;
      if (Math.abs(q - Math.round(q)) > 0.05) on = false;
    }
    // Stored less half the range (0 to 2^bits - 1 becomes -2^(bits - 1) to 2^(bits - 1) - 1), within a signed 16-bit's ±32767.
    if (on) return { min, step, centre: 2 ** (bits - 1) };
  }
  return null;
}

/**
 * For a Draco source, the voxel grid its art was made on: every coordinate within `tolerance` (Draco's half step) of a
 * multiple of 0.1, in absolute model units, and each axis spanning at most 254 grid steps. Returns each axis's centre (in
 * grid steps), which the stored 8-bit integers are taken from; null when the source is not such a grid. The voxel points
 * are the art's own positions, which Draco's quantization had moved by less than half its step.
 */
function voxelGrid(positions: ArrayLike<number>, tolerance: number): [number, number, number] | null {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i++) {
    const k = Math.round(positions[i]! / GRID);
    if (Math.abs(positions[i]! - k * GRID) > tolerance) return null;
    lo[i % 3] = Math.min(lo[i % 3]!, k);
    hi[i % 3] = Math.max(hi[i % 3]!, k);
  }
  if (hi.some((h, a) => h - lo[a]! > 254)) return null;
  return lo.map((l, a) => Math.round((l + hi[a]!) / 2)) as [number, number, number];
}

/** `v` turned by the unit quaternion `q` (`[x, y, z, w]`, glTF's order); its inverse with `inverse`. */
function rotate(q: ArrayLike<number>, v: ArrayLike<number>, inverse = false): [number, number, number] {
  const [x, y, z] = inverse ? [-q[0]!, -q[1]!, -q[2]!] : [q[0]!, q[1]!, q[2]!];
  const w = q[3]!;
  // v + 2w (u x v) + 2 u x (u x v), u the vector part
  const c = [y * v[2]! - z * v[1]!, z * v[0]! - x * v[2]!, x * v[1]! - y * v[0]!];
  const d = [y * c[2]! - z * c[1]!, z * c[0]! - x * c[2]!, x * c[1]! - y * c[0]!];
  return [v[0]! + 2 * (w * c[0]! + d[0]!), v[1]! + 2 * (w * c[1]! + d[1]!), v[2]! + 2 * (w * c[2]! + d[2]!)];
}

/** How the positions were stored: the model units of one integer, the 0.1 grid or not, the offset taken out, the tolerance checked. */
interface Stored {
  quantum: number;
  grid: boolean;
  top: 127 | 32767;
  /** Taken out of every position and put on the node (a Draco source away from the origin). */
  offset?: [number, number, number];
  /** A Draco source snapped to its voxel grid: the largest move allowed, Draco's half step. */
  snapped?: number;
}

function compressPrimitive(doc: Document, prim: Primitive): Stored {
  const indices = prim.getIndices()!;
  const order = indices.getArray()!;
  const count = prim.getAttribute("POSITION")!.getCount();
  // remap[old] = new: vertices numbered by first use; unused ones are dropped.
  const remap = new Int32Array(count).fill(-1);
  let used = 0;
  for (let i = 0; i < order.length; i++) if (remap[order[i]!] === -1) remap[order[i]!] = used++;
  const newIndices = used <= 65535 ? new Uint16Array(order.length) : new Uint32Array(order.length);
  for (let i = 0; i < order.length; i++) newIndices[i] = remap[order[i]!]!;
  indices.setArray(newIndices);

  const permute = <T extends Int8Array | Int16Array | Uint16Array>(src: ArrayLike<number>, size: number, out: T, map: (v: number) => number): T => {
    for (let v = 0; v < count; v++) {
      const n = remap[v]!;
      if (n < 0) continue;
      for (let k = 0; k < size; k++) out[n * size + k] = map(src[v * size + k]!);
    }
    return out;
  };

  const position = prim.getAttribute("POSITION")!;
  const source = position.getArray()!;
  let step: Stored = positionQuantum(source);
  // A Draco source (the high-forest set) is on its own quantization grid, near but off the voxel grid and away from the
  // origin: snapped back to the voxels when within Draco's half step (8 bits, exact for the art), else kept on Draco's grid
  // (16 bits, exact for the source). The base models are on the voxel grid around the origin and never come here.
  const draco = step.grid ? null : dracoGrid(source);
  const voxels = draco ? voxelGrid(source, draco.step / 2 + 1e-5) : null;
  if (draco && voxels) {
    const stored = new Int8Array(used * 3);
    for (let v = 0; v < count; v++) {
      const n = remap[v]!;
      if (n < 0) continue;
      for (let k = 0; k < 3; k++) stored[n * 3 + k] = Math.round(source[v * 3 + k]! / GRID) - voxels[k]!;
    }
    position.setArray(stored).setNormalized(true);
    step = { quantum: GRID, grid: true, top: 127, offset: voxels.map((c) => c * GRID) as [number, number, number], snapped: draco.step / 2 + 1e-5 };
  } else if (draco) {
    // On the source's own Draco grid: its integers, recentred; the offset goes on the node with the scale.
    const offset = draco.min.map((m) => m + draco.centre * draco.step) as [number, number, number];
    const stored = new Int16Array(used * 3);
    for (let v = 0; v < count; v++) {
      const n = remap[v]!;
      if (n < 0) continue;
      for (let k = 0; k < 3; k++) stored[n * 3 + k] = Math.round((source[v * 3 + k]! - draco.min[k]!) / draco.step) - draco.centre;
    }
    position.setArray(stored).setNormalized(true);
    step = { quantum: draco.step, grid: false, top: 32767, offset };
  } else {
    const stored = step.top === 127 ? new Int8Array(used * 3) : new Int16Array(used * 3);
    position.setArray(permute(source, 3, stored, (v) => Math.round(v / step.quantum))).setNormalized(true);
  }

  const normal = prim.getAttribute("NORMAL");
  if (normal) {
    const n = normal.getArray()!;
    // A Draco source's normals all along an axis (voxel faces) are exact in 8 bits; the base set keeps its 16.
    const axial = draco !== null && Array.from(n).every((v) => v === 0 || Math.abs(v) === 1);
    const out = axial ? new Int8Array(used * 3) : new Int16Array(used * 3);
    normal.setArray(permute(n, 3, out, (v) => Math.round(Math.max(-1, Math.min(1, v)) * (axial ? 127 : 32767)))).setNormalized(true);
  }

  for (const semantic of prim.listSemantics()) {
    if (semantic === "POSITION" || semantic === "NORMAL") continue;
    const attribute = prim.getAttribute(semantic)!;
    if (!semantic.startsWith("TEXCOORD_")) throw new Error(`attribute ${semantic} is not handled`);
    const uv = attribute.getArray()!;
    for (let i = 0; i < uv.length; i++) if (uv[i]! < 0 || uv[i]! > 1) throw new Error(`${semantic} leaves [0, 1]`);
    attribute.setArray(permute(uv, 2, new Uint16Array(used * 2), (v) => Math.round(v * 65535))).setNormalized(true);
  }
  return step;
}

/**
 * The decoded copy against its source: an error when a triangle or a value moved more than the stated tolerance. meshopt's
 * index codec may rotate a triangle (abc as bca, the same winding and edges), so each triangle is matched in its best
 * rotation.
 */
function verify(name: string, source: Document, copy: Document, tolerance: number): string {
  const a = onlyPrimitive(source, name);
  const b = onlyPrimitive(copy, name);
  const ai = a.getIndices()!.getArray()!;
  const bi = b.getIndices()!.getArray()!;
  if (ai.length !== bi.length) throw new Error(`${name}: ${ai.length} indices became ${bi.length}`);
  // Positions compared in the source's frame: the copy's scale, and its translation's change turned back (same rotation).
  const [sn, cn] = [source.getRoot().listNodes()[0]!, copy.getRoot().listNodes()[0]!];
  const [ss, cs] = [sn.getScale()[0], cn.getScale()[0]];
  const [st, ct] = [sn.getTranslation(), cn.getTranslation()];
  const shift = rotate(sn.getRotation(), [ct[0] - st[0], ct[1] - st[1], ct[2] - st[2]], true);
  const read = (p: Primitive, s: string) => {
    const acc = p.getAttribute(s)!;
    const el = new Array<number>(acc.getElementSize());
    return (i: number) => acc.getElement(i, el);
  };
  const [ap, bp] = [read(a, "POSITION"), read(b, "POSITION")];
  const normals = a.getAttribute("NORMAL") ? [read(a, "NORMAL"), read(b, "NORMAL")] : null;
  const uvs = a.listSemantics().filter((s) => s.startsWith("TEXCOORD_")).map((s) => [read(a, s), read(b, s)] as const);
  /** The errors of copy vertex `y` against source vertex `x`: position, normal (degrees), UV. */
  const errors = (x: number, y: number): [number, number, number] => {
    const p = ap(x);
    const q = bp(y);
    let pos = 0;
    for (let k = 0; k < 3; k++) pos = Math.max(pos, Math.abs(p[k]! - (q[k]! * cs + shift[k]!) / ss));
    let nor = 0;
    if (normals) {
      const n = normals[0]!(x);
      const m = normals[1]!(y);
      const dot = (n[0]! * m[0]! + n[1]! * m[1]! + n[2]! * m[2]!) / (Math.hypot(n[0]!, n[1]!, n[2]!) * Math.hypot(m[0]!, m[1]!, m[2]!));
      nor = (Math.acos(Math.min(1, dot)) * 180) / Math.PI;
    }
    let uv = 0;
    for (const [au, bu] of uvs) {
      const u = au(x);
      const w = bu(y);
      for (let k = 0; k < 2; k++) uv = Math.max(uv, Math.abs(u[k]! - w[k]!));
    }
    return [pos, nor, uv];
  };
  const worst: [number, number, number] = [0, 0, 0];
  for (let t = 0; t < ai.length; t += 3) {
    let best: [number, number, number] | null = null;
    for (let r = 0; r < 3; r++) {
      const e: [number, number, number] = [0, 0, 0];
      for (let k = 0; k < 3; k++) {
        const v = errors(ai[t + k]!, bi[t + ((k + r) % 3)]!);
        for (let j = 0; j < 3; j++) e[j] = Math.max(e[j]!, v[j]!);
      }
      if (!best || e[0] < best[0]) best = e;
    }
    for (let j = 0; j < 3; j++) worst[j] = Math.max(worst[j]!, best![j]!);
  }
  const [pos, nor, uv] = worst;
  // Half a quantum (or Draco's half step, for a source snapped to its voxels), and float32's rounding of a dequantized value.
  if (pos > tolerance) throw new Error(`${name}: a position moved ${pos}`);
  if (nor > 0.01) throw new Error(`${name}: a normal turned ${nor} degrees`);
  if (uv > 1e-5) throw new Error(`${name}: a UV moved ${uv}`);
  return `position ${pos.toExponential(1)}, normal ${nor.toFixed(4)} deg, uv ${uv.toExponential(1)}`;
}

async function compress(name: string, bytes: Uint8Array): Promise<{ out: Uint8Array; note: string }> {
  const doc = await io.readBinary(bytes);
  // A Draco source is decoded on read; its extension goes, so the copy is written with meshopt only.
  doc.getRoot().listExtensionsUsed().find((e) => e.extensionName === KHRDracoMeshCompression.EXTENSION_NAME)?.dispose();
  const node = doc.getRoot().listNodes()[0]!;
  const step = compressPrimitive(doc, onlyPrimitive(doc, name));
  // Normalized: three reads an integer q as q / 127 (8 bits) or q / 32767 (16 bits), so the node scales by that many quanta.
  const scale = node.getScale()[0];
  const s = scale * step.quantum * step.top;
  node.setScale([s, s, s]);
  if (step.offset) {
    // world = T + R (S (offset + quantum * stored)): the offset, scaled and turned, joins the translation.
    const t = node.getTranslation();
    const o = rotate(node.getRotation(), step.offset.map((v) => v * scale));
    node.setTranslation([t[0] + o[0], t[1] + o[1], t[2] + o[2]]);
  }
  doc.createExtension(KHRMeshQuantization).setRequired(true);
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  const out = await io.writeBinary(doc);
  const note = verify(name, await io.readBinary(bytes), await io.readBinary(out), step.snapped ?? step.quantum / 2 + 1e-6);
  return { out, note: `${step.snapped ? "voxel grid 0.1, 8 bits, from Draco" : step.grid ? `grid 0.1, ${step.top === 127 ? 8 : 16} bits` : step.offset ? `Draco grid ${step.quantum.toExponential(3)}` : `step ${step.quantum.toExponential(3)}`}; ${note}` };
}

const check = process.argv.includes("--check");
let stale = false;
for (const set of SETS) {
  const sources = readdirSync(set.source).filter((f) => set.match(f) !== null).sort();
  const written = new Set<string>();
  let before = 0;
  let after = 0;
  mkdirSync(set.out, { recursive: true });
  for (const file of sources) {
    const key = set.match(file)!;
    const src = readFileSync(join(set.source, file));
    const { out, note } = await compress(key, src);
    const target = `${key}.${hashOf(out)}.glb`;
    written.add(target);
    before += src.length;
    after += out.length;
    console.log(`${key}: ${src.length} -> ${out.length} B (${target}; ${note})`);
    if (check) {
      let current: Uint8Array | null = null;
      try {
        current = readFileSync(join(set.out, target));
      } catch {}
      if (!current || Buffer.compare(current, out) !== 0) stale = true;
    } else {
      writeFileSync(join(set.out, target), out);
    }
  }
  // A theme's folder is another set's: only files are this set's.
  for (const file of readdirSync(set.out, { withFileTypes: true })) {
    if (!file.isFile() || written.has(file.name)) continue;
    if (check) stale = true;
    else unlinkSync(join(set.out, file.name));
  }
  console.log(`${set.label}: ${sources.length} models: ${before} -> ${after} B`);
}
if (check && stale) {
  console.error("public/renderer-assets/models is not what this script writes: run node scripts/compress-models.ts");
  process.exit(1);
}
