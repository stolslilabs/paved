import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { MeshoptDecoder } from "meshoptimizer";
// The renderer's own outline builder, from its source: the outlines are the part of a tile a quantization could change.
import { buildEdgesGeometry } from "../../renderer/src/core/edges";

const ORIGINALS = resolve(__dirname, "../../app-web/public/models");
const COMPRESSED = resolve(__dirname, "../public/renderer-assets/models");

type Gltf = {
  accessors: { bufferView: number; byteOffset?: number; componentType: number; count: number; type: string; normalized?: boolean }[];
  bufferViews: { byteOffset?: number; byteLength: number; byteStride?: number; extensions?: { EXT_meshopt_compression?: { byteOffset?: number; byteLength: number; byteStride: number; count: number; mode: string; filter?: string } } }[];
  meshes: { primitives: { attributes: Record<string, number>; indices: number }[] }[];
  nodes: { mesh?: number; scale?: number[] }[];
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
  return { geometry, indices: index.length, scale: node.scale?.[0] ?? 1 };
}

/** The outline segments in model units, each as a sorted pair of rounded ends: a set that ignores order and direction. */
function segments(geometry: ReturnType<typeof readGlb>["geometry"], scale: number): string[] {
  const p = buildEdgesGeometry(geometry as unknown as Parameters<typeof buildEdgesGeometry>[0]).getAttribute("position");
  const end = (i: number) => [p.getX(i), p.getY(i), p.getZ(i)].map((v) => Math.round(v * scale * 1e3) / 1e3).join(",");
  const out: string[] = [];
  for (let i = 0; i < p.count; i += 2) out.push([end(i), end(i + 1)].sort().join(" "));
  return out.sort();
}

beforeAll(async () => {
  await MeshoptDecoder.ready;
});

describe("the compressed models draw the same outlines as the originals", () => {
  const names = readdirSync(COMPRESSED).sort();

  it.each(names)("%s", (name) => {
    const original = readGlb(join(ORIGINALS, `${name.slice(0, 9)}.glb`));
    const compressed = readGlb(join(COMPRESSED, name));
    expect(compressed.indices).toBe(original.indices);
    const expected = segments(original.geometry, original.scale);
    expect(expected.length).toBeGreaterThan(1000);
    expect(segments(compressed.geometry, compressed.scale)).toEqual(expected);
  });
});
