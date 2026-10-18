import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { PALETTE_CLASSES, labelTileColumns } from "../../src/core/features";
import { planLayout } from "../../src/core/feature-layout";

const APP = fileURLToPath(new URL("../../../app", import.meta.url));
export const SHIPPED = `${APP}/public/renderer-assets/models`;
export const SOURCES = `${APP}/asset-sources/models`;
export const PLANS = readdirSync(SOURCES)
  .filter((f) => f.endsWith(".glb"))
  .map((f) => f.slice(0, -4));

/** A GLB without its images (node has no image decoder): the geometry and its UVs are all the renderer's readers use. */
function withoutImages(glb: Buffer): ArrayBuffer {
  const jsonLength = glb.readUInt32LE(12);
  const json = JSON.parse(glb.subarray(20, 20 + jsonLength).toString());
  delete json.images;
  delete json.textures;
  delete json.samplers;
  for (const material of json.materials ?? []) delete material.pbrMetallicRoughness?.baseColorTexture;
  let text = JSON.stringify(json);
  while (text.length % 4) text += " ";
  const head = Buffer.from(text);
  const rest = glb.subarray(20 + jsonLength);
  const out = Buffer.alloc(20 + head.length + rest.length);
  out.writeUInt32LE(0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(head.length, 12);
  out.writeUInt32LE(0x4e4f534a, 16);
  head.copy(out, 20);
  rest.copy(out, 20 + head.length);
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.length);
}

let loader: GLTFLoader | null = null;

/** A model file as the renderer's loader gives it (meshopt decoded, images left out): its one mesh, world matrices set. */
export async function loadMesh(file: string): Promise<THREE.Mesh> {
  if (!loader) {
    await MeshoptDecoder.ready;
    loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
  }
  const gltf = await loader.parseAsync(withoutImages(readFileSync(file)), "");
  gltf.scene.updateMatrixWorld(true);
  let mesh: THREE.Mesh | null = null;
  gltf.scene.traverse((child) => {
    if (child instanceof THREE.Mesh) mesh = child;
  });
  return mesh!;
}

export const sourceOf = (mesh: THREE.Mesh) => ({ geometry: mesh.geometry, toModel: mesh.matrixWorld });

/** The shipped file of a plan (`<plan>.<hash>.glb`). */
export const shipped = (plan: string) => `${SHIPPED}/${readdirSync(SHIPPED).find((f) => f.startsWith(`${plan}.`) && f.endsWith(".glb"))!}`;

/** The night lights' columns of a base plan's mesh (`lightColumns`, through the classifier as the renderer runs it). */
export function litColumnsOf(plan: string, mesh: THREE.Mesh): Uint8Array {
  return labelTileColumns(mesh.geometry, planLayout(plan), mesh.matrixWorld, PALETTE_CLASSES.base).lights;
}
