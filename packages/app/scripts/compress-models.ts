/**
 * ASSET-WEIGHT: the app's copy of the board's 19 base models, compressed and content-hashed, from app-web's originals.
 *
 *   node scripts/compress-models.ts [--check]
 *
 * Reads `../app-web/public/models/<plan>.glb` (left untouched) and writes `public/renderer-assets/models/<plan>.<hash>.glb`,
 * removing the copies of an earlier run. `--check` writes nothing and fails when the committed copies are not exactly what
 * this run would write. Node 24 runs it as is (type stripping): the syntax stays erasable.
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
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO, type Document, type Primitive } from "@gltf-transform/core";
import { EXTMeshoptCompression, KHRMeshQuantization } from "@gltf-transform/extensions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = resolve(HERE, "../../app-web/public/models");
const OUT = resolve(HERE, "../public/renderer-assets/models");
/** A base model's source name, as `vite/renderer-assets.ts` matches it. */
const MODEL = /^([a-z]{9})\.glb$/;
/** The voxel grid: every tile model is a 4-unit grid of 0.1-unit voxels (`outlines.ts`, `TILE_VOXELS`). */
const GRID = 0.1;

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });

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

function compressPrimitive(doc: Document, prim: Primitive): { quantum: number; grid: boolean } {
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
  const step = positionQuantum(position.getArray()!);
  const stored = step.top === 127 ? new Int8Array(used * 3) : new Int16Array(used * 3);
  position.setArray(permute(position.getArray()!, 3, stored, (v) => Math.round(v / step.quantum))).setNormalized(true);

  const normal = prim.getAttribute("NORMAL");
  normal?.setArray(permute(normal.getArray()!, 3, new Int16Array(used * 3), (v) => Math.round(Math.max(-1, Math.min(1, v)) * 32767))).setNormalized(true);

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
function verify(name: string, source: Document, copy: Document, quantum: number): string {
  const a = onlyPrimitive(source, name);
  const b = onlyPrimitive(copy, name);
  const ai = a.getIndices()!.getArray()!;
  const bi = b.getIndices()!.getArray()!;
  if (ai.length !== bi.length) throw new Error(`${name}: ${ai.length} indices became ${bi.length}`);
  const scale = copy.getRoot().listNodes()[0]!.getScale()[0] / source.getRoot().listNodes()[0]!.getScale()[0];
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
    for (let k = 0; k < 3; k++) pos = Math.max(pos, Math.abs(p[k]! - q[k]! * scale));
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
  // Half a quantum, and float32's rounding of a dequantized value.
  if (pos > quantum / 2 + 1e-6) throw new Error(`${name}: a position moved ${pos}`);
  if (nor > 0.01) throw new Error(`${name}: a normal turned ${nor} degrees`);
  if (uv > 1e-5) throw new Error(`${name}: a UV moved ${uv}`);
  return `position ${pos.toExponential(1)}, normal ${nor.toFixed(4)} deg, uv ${uv.toExponential(1)}`;
}

async function compress(name: string, bytes: Uint8Array): Promise<{ out: Uint8Array; note: string }> {
  const doc = await io.readBinary(bytes);
  const node = doc.getRoot().listNodes()[0]!;
  const step = compressPrimitive(doc, onlyPrimitive(doc, name));
  // Normalized: three reads an integer q as q / 127 (8 bits) or q / 32767 (16 bits), so the node scales by that many quanta.
  const s = node.getScale()[0] * step.quantum * step.top;
  node.setScale([s, s, s]);
  doc.createExtension(KHRMeshQuantization).setRequired(true);
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  const out = await io.writeBinary(doc);
  const note = verify(name, await io.readBinary(bytes), await io.readBinary(out), step.quantum);
  return { out, note: `${step.grid ? `grid 0.1, ${step.top === 127 ? 8 : 16} bits` : `step ${step.quantum.toExponential(3)}`}; ${note}` };
}

const check = process.argv.includes("--check");
const sources = readdirSync(SOURCE).filter((f) => MODEL.test(f)).sort();
const written = new Set<string>();
let before = 0;
let after = 0;
let stale = false;
mkdirSync(OUT, { recursive: true });
for (const file of sources) {
  const key = MODEL.exec(file)![1]!;
  const src = readFileSync(join(SOURCE, file));
  const { out, note } = await compress(key, src);
  const target = `${key}.${hashOf(out)}.glb`;
  written.add(target);
  before += src.length;
  after += out.length;
  console.log(`${key}: ${src.length} -> ${out.length} B (${target}; ${note})`);
  if (check) {
    let current: Uint8Array | null = null;
    try {
      current = readFileSync(join(OUT, target));
    } catch {}
    if (!current || Buffer.compare(current, out) !== 0) stale = true;
  } else {
    writeFileSync(join(OUT, target), out);
  }
}
for (const file of readdirSync(OUT)) {
  if (written.has(file)) continue;
  if (check) stale = true;
  else unlinkSync(join(OUT, file));
}
console.log(`${sources.length} models: ${before} -> ${after} B`);
if (check && stale) {
  console.error("public/renderer-assets/models is not what this script writes: run node scripts/compress-models.ts");
  process.exit(1);
}
