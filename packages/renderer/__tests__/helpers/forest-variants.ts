import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

/** The Forest variants the app ships (meshopt-compressed, `packages/app/scripts/compress-models.ts`). */
export const FOREST = fileURLToPath(new URL("../../../app/public/renderer-assets/models/forest", import.meta.url));
export const FOREST_FILES = readdirSync(FOREST).filter((f) => f.endsWith(".glb"));

/** A GLB without its images (node has no image decoder): the geometry and its UVs are all the classifier reads. */
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

/** A Forest variant as the loader gives it (meshopt decoded), its world matrices set: the scene and its one mesh. */
export async function loadForestVariant(file: string): Promise<{ scene: THREE.Group; mesh: THREE.Mesh }> {
  if (!loader) {
    await MeshoptDecoder.ready;
    loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
  }
  const gltf = await loader.parseAsync(withoutImages(readFileSync(`${FOREST}/${file}`)), "");
  gltf.scene.updateMatrixWorld(true);
  let mesh: THREE.Mesh | null = null;
  gltf.scene.traverse((child) => {
    if (child instanceof THREE.Mesh) mesh = child;
  });
  return { scene: gltf.scene, mesh: mesh! };
}
