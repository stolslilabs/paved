import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { MeshoptDecoder } from "meshoptimizer";
import { NodeIO } from "@gltf-transform/core";
import { KHRDracoMeshCompression } from "@gltf-transform/extensions";
// The renderer's own outline builder, from its source: the outlines are the part of a tile a quantization could change.
import { buildEdgesGeometry } from "../../renderer/src/core/edges";

const ORIGINALS = resolve(__dirname, "../asset-sources/models");
const COMPRESSED = resolve(__dirname, "../public/renderer-assets/models");

type Gltf = {
  accessors: { bufferView: number; byteOffset?: number; componentType: number; count: number; type: string; normalized?: boolean }[];
  bufferViews: { byteOffset?: number; byteLength: number; byteStride?: number; extensions?: { EXT_meshopt_compression?: { byteOffset?: number; byteLength: number; byteStride: number; count: number; mode: string; filter?: string } } }[];
  meshes: { primitives: { attributes: Record<string, number>; indices: number }[] }[];
  nodes: { mesh?: number; scale?: number[]; translation?: number[]; rotation?: number[] }[];
};
const ARRAYS: Record<number, Int8ArrayConstructor | Uint8ArrayConstructor | Int16ArrayConstructor | Uint16ArrayConstructor | Uint32ArrayConstructor | Float32ArrayConstructor> = {
  5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array,
};
const SIZES: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

/** A tile model's one primitive as three's GLTFLoader builds it: its raw (quantized) attribute values, meshopt decoded. */
function readGlb(file: string) {
  const glb = readFileSync(file);
  const jsonLength = glb.readUInt32LE(12);
  const json = JSON.parse(glb.subarray(20, 20 + jsonLength).toString()) as Gltf;
  const bin = glb.subarray(28 + jsonLength);
  const views = json.bufferViews.map((view) => {
    const meshopt = view.extensions?.EXT_meshopt_compression;
    if (!meshopt) return bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    const out = new Uint8Array(meshopt.count * meshopt.byteStride);
    const source = bin.subarray(meshopt.byteOffset ?? 0, (meshopt.byteOffset ?? 0) + meshopt.byteLength);
    MeshoptDecoder.decodeGltfBuffer(out, meshopt.count, meshopt.byteStride, source, meshopt.mode as "ATTRIBUTES", (meshopt.filter ?? "NONE") as "NONE");
    return out;
  });
  const accessor = (index: number) => {
    const a = json.accessors[index]!;
    const view = json.bufferViews[a.bufferView]!;
    const Arr = ARRAYS[a.componentType]!;
    const size = SIZES[a.type]!;
    const stride = view.extensions?.EXT_meshopt_compression?.byteStride ?? view.byteStride ?? size * Arr.BYTES_PER_ELEMENT;
    const bytes = views[a.bufferView]!;
    const out = new Arr(a.count * size);
    const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const get = { 5120: "getInt8", 5121: "getUint8", 5122: "getInt16", 5123: "getUint16", 5125: "getUint32", 5126: "getFloat32" }[a.componentType] as "getInt16";
    for (let i = 0; i < a.count; i++) for (let k = 0; k < size; k++) out[i * size + k] = data[get]((a.byteOffset ?? 0) + i * stride + k * Arr.BYTES_PER_ELEMENT, true);
    return { array: out, size, normalized: !!a.normalized };
  };
  const node = json.nodes.find((n) => n.mesh !== undefined)!;
  const prim = json.meshes[node.mesh!]!.primitives[0]!;
  const raw = accessor(prim.attributes.POSITION!);
  // A normalized integer as three's BufferAttribute reads it (`MathUtils.denormalize`): q / 127 or q / 32767, at least -1.
  const top = raw.array instanceof Int8Array ? 127 : raw.array instanceof Int16Array ? 32767 : null;
  if (raw.normalized && top === null) throw new Error(`${file}: normalized positions of this type are not read here`);
  const position = { array: raw.normalized ? Float64Array.from(raw.array, (q) => Math.max(q / top!, -1)) : raw.array };
  const index = accessor(prim.indices).array;
  // What `buildEdgesGeometry` reads of three's BufferGeometry: the raw values, as GLTFLoader keeps a quantized attribute.
  const geometry = {
    getIndex: () => ({ count: index.length, getX: (i: number) => index[i]! }),
    getAttribute: () => ({ count: position.array.length / 3, getX: (i: number) => position.array[i * 3]!, getY: (i: number) => position.array[i * 3 + 1]!, getZ: (i: number) => position.array[i * 3 + 2]! }),
  };
  return { geometry, indices: index.length, scale: node.scale?.[0] ?? 1, translation: node.translation ?? [0, 0, 0], rotation: node.rotation ?? [0, 0, 0, 1] };
}

type Geometry = ReturnType<typeof readGlb>["geometry"];

/**
 * The outline segments in model units, each as a sorted pair of rounded ends: a set that ignores order and direction. `at`
 * takes an end, as the geometry stores it, to the frame compared (by default, times the node's `scale`).
 */
function segments(geometry: Geometry, scale: number, at: (v: number[]) => number[] = (v) => v.map((x) => x * scale)): string[] {
  const p = buildEdgesGeometry(geometry as unknown as Parameters<typeof buildEdgesGeometry>[0]).getAttribute("position");
  const end = (i: number) => at([p.getX(i), p.getY(i), p.getZ(i)]).map((v) => Math.round(v * 1e3) / 1e3 + 0).join(",");
  const out: string[] = [];
  for (let i = 0; i < p.count; i += 2) out.push([end(i), end(i + 1)].sort().join(" "));
  return out.sort();
}

beforeAll(async () => {
  await MeshoptDecoder.ready;
});

describe("the compressed models draw the same outlines as the originals", () => {
  // The base models; a theme's folder (`forest/`, Draco sources) is checked by `renderer-manifest.test.ts`.
  const names = readdirSync(COMPRESSED).filter((n) => n.endsWith(".glb")).sort();

  it.each(names)("%s", (name) => {
    const original = readGlb(join(ORIGINALS, `${name.slice(0, 9)}.glb`));
    const compressed = readGlb(join(COMPRESSED, name));
    expect(compressed.indices).toBe(original.indices);
    const expected = segments(original.geometry, original.scale);
    expect(expected.length).toBeGreaterThan(1000);
    expect(segments(compressed.geometry, compressed.scale)).toEqual(expected);
  });
});

// P11b's review note: the Forest models (theme 1) against the Draco sources the compress script read
// (`asset-sources/models/extended/<plan>_HF_<n>.glb`). The script snapped each source position to the 0.1 voxel grid, within
// Draco's half step; the outlines are the part of a tile that snap could change, so they are compared here.
const EXTENDED = join(ORIGINALS, "extended");
const FOREST = join(COMPRESSED, "forest");
const GRID = 0.1;

/** The self-hosted Draco decoder (its JavaScript build, no WebAssembly to fetch), run as the compress script runs it. */
async function dracoDecoder(): Promise<unknown> {
  const file = resolve(ORIGINALS, "../draco/draco_decoder.js");
  const module = { exports: {} as unknown };
  new Function("module", "exports", "require", "__filename", "__dirname", readFileSync(file, "utf8"))(module, module.exports, createRequire(file), file, dirname(file));
  return (module.exports as () => Promise<unknown>)();
}

/** `v` turned by the inverse of the unit quaternion `q` (`[x, y, z, w]`, glTF's order). */
function unrotate(q: number[], v: number[]): number[] {
  const [x, y, z, w] = [-q[0]!, -q[1]!, -q[2]!, q[3]!];
  const c = [y * v[2]! - z * v[1]!, z * v[0]! - x * v[2]!, x * v[1]! - y * v[0]!];
  const d = [y * c[2]! - z * c[1]!, z * c[0]! - x * c[2]!, x * c[1]! - y * c[0]!];
  return [0, 1, 2].map((k) => v[k]! + 2 * (w * c[k]! + d[k]!));
}

/** A Draco source decoded: its one primitive's float positions and indices (the geometry the outline builder reads), and its node. */
async function readSource(io: NodeIO, file: string) {
  const doc = await io.readBinary(readFileSync(file));
  const node = doc.getRoot().listNodes()[0]!;
  const prim = node.getMesh()!.listPrimitives()[0]!;
  const position = Array.from(prim.getAttribute("POSITION")!.getArray()!);
  const index = Array.from(prim.getIndices()!.getArray()!);
  const geometry = (positions: number[]) => ({
    getIndex: () => ({ count: index.length, getX: (i: number) => index[i]! }),
    getAttribute: () => ({ count: positions.length / 3, getX: (i: number) => positions[i * 3]!, getY: (i: number) => positions[i * 3 + 1]!, getZ: (i: number) => positions[i * 3 + 2]! }),
  });
  return { position, indices: index.length, geometry, scale: node.getScale()[0], translation: node.getTranslation(), rotation: node.getRotation() };
}

describe("the Forest models draw the same outlines as their Draco sources, within the voxel snap", () => {
  const names = readdirSync(FOREST).filter((n) => n.endsWith(".glb")).sort();
  let io: NodeIO;

  beforeAll(async () => {
    io = new NodeIO().registerExtensions([KHRDracoMeshCompression]).registerDependencies({ "draco3d.decoder": await dracoDecoder() });
  });

  it("covers the 72 high-forest variants", () => {
    expect(names).toHaveLength(72);
  });

  it.each(names)("%s", async (name) => {
    const source = await readSource(io, join(EXTENDED, `${name.replace(/\.[0-9a-f]{10}\.glb$/, "")}.glb`));
    const forest = readGlb(join(FOREST, name));
    expect(forest.indices).toBe(source.indices);

    // The snap: every source coordinate within Draco's half step of the 0.1 grid (the source's 14-bit step over a 4.1-unit
    // tile is 2.5e-4; the script checked 1.3e-4 against the decoded source).
    const snapped = source.position.map((v) => Math.round(v / GRID) * GRID);
    const moved = Math.max(...source.position.map((v, i) => Math.abs(v - snapped[i]!)));
    expect(moved).toBeLessThan(1.3e-4);

    // The compressed model in the source's frame: its node's scale, and its translation's change turned back (same rotation).
    const shift = unrotate(source.rotation, [0, 1, 2].map((k) => forest.translation[k]! - source.translation[k]!));
    const toSource = (v: number[]) => v.map((x, k) => (x * forest.scale + shift[k]!) / source.scale);
    const expected = segments(source.geometry(snapped), 1, (v) => v);
    expect(expected.length).toBeGreaterThan(100);
    // The outlines of the compressed copy are the snapped source's, segment for segment.
    expect(segments(forest.geometry, forest.scale, toSource)).toEqual(expected);
    // And the source's own outlines (unsnapped) are the same segments once their ends are snapped: the snap moved no edge.
    expect(segments(source.geometry(source.position), 1, (v) => v.map((x) => Math.round(x / GRID) * GRID))).toEqual(expected);
  });
});
