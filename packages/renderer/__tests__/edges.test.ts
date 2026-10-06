import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { buildEdgesGeometry } from "../src/core/edges";

const MODELS = fileURLToPath(new URL("../../app-web/public/models", import.meta.url));

/** Position and index of the single primitive of a tile model (GLB), without a loader. */
function readTileGeometry(file: string): THREE.BufferGeometry {
  const glb = readFileSync(file);
  const jsonLength = glb.readUInt32LE(12);
  const gltf = JSON.parse(glb.subarray(20, 20 + jsonLength).toString());
  const bin = 20 + jsonLength + 8;
  const read = (index: number, Type: Float32ArrayConstructor | Uint32ArrayConstructor | Uint16ArrayConstructor, size: number) => {
    const accessor = gltf.accessors[index];
    const view = gltf.bufferViews[accessor.bufferView];
    const start = glb.byteOffset + bin + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    return new Type(glb.buffer.slice(start, start + accessor.count * size * Type.BYTES_PER_ELEMENT));
  };
  const primitive = gltf.meshes[0].primitives[0];
  const indexType = gltf.accessors[primitive.indices].componentType === 5125 ? Uint32Array : Uint16Array;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(read(primitive.attributes.POSITION, Float32Array, 3), 3));
  geometry.setIndex(new THREE.BufferAttribute(read(primitive.indices, indexType, 1), 1));
  return geometry;
}

function expectSameEdges(geometry: THREE.BufferGeometry, thresholdAngle?: number): void {
  const expected = new THREE.EdgesGeometry(geometry, thresholdAngle).getAttribute("position").array;
  const actual = buildEdgesGeometry(geometry, thresholdAngle).getAttribute("position").array;
  expect(Array.from(actual)).toEqual(Array.from(expected));
}

describe("buildEdgesGeometry", () => {
  it("gives EdgesGeometry's segments, in order, for indexed and non-indexed geometry", () => {
    expectSameEdges(new THREE.BoxGeometry(1, 2, 3, 2, 2, 2));
    expectSameEdges(new THREE.TorusKnotGeometry(1, 0.3, 64, 8));
    expectSameEdges(new THREE.IcosahedronGeometry(1, 2)); // non-indexed
    expectSameEdges(mergeVertices(new THREE.BoxGeometry(1, 1, 1, 3, 3, 3)));
    expectSameEdges(new THREE.CylinderGeometry(1, 1, 2, 24), 30);
  });

  it("gives EdgesGeometry's segments for every tile model", () => {
    const files = readdirSync(MODELS).filter((f) => f.endsWith(".glb"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expectSameEdges(readTileGeometry(`${MODELS}/${file}`));
    }
  });
});
