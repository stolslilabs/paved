// The voxel drop's mesh (VOXEL-DROP, #512): its own chunk, loaded on the first drop (`TileDrops`). One instanced unit cube per
// solid voxel of a tile model, the fall computed in the vertex shader from one time uniform: the CPU sets a number a frame.
import * as THREE from "three";
import { VoxelCache, paletteU, type VoxelGrid } from "./voxelizer";
import { planDrop } from "./voxel-drop-schedule";
import { DROP_EASES, DROP_LANDINGS, type VoxelDropSettings } from "./voxel-drop-settings";

export { VoxelCache };

/** The share of a voxel's fall that is the fall itself; the rest is its landing (squash or rebound). */
const FALL_SHARE = 0.7;
/** The cube outline's width, in cube units, and its colour in linear light (`#1f1f1f`, as `core/outlines.ts`). */
const OUTLINE_WIDTH = 0.09;
const OUTLINE_LINEAR = 0.0137;

/** The uniforms the vertex displacement reads, shared by the colour and the shadow-depth materials of one drop. */
interface DropUniforms {
  [name: string]: THREE.IUniform;
  uTime: THREE.IUniform<number>;
  uFallMs: THREE.IUniform<number>;
  uFallHeight: THREE.IUniform<number>;
  uStep: THREE.IUniform<number>;
  uOrigin: THREE.IUniform<THREE.Vector3>;
  uEase: THREE.IUniform<number>;
  uLanding: THREE.IUniform<number>;
  uOutline: THREE.IUniform<number>;
}

const DECLARATIONS = /* glsl */ `
  attribute vec3 aCell;
  attribute float aDelay;
  attribute float aU;
  uniform float uTime;
  uniform float uFallMs;
  uniform float uFallHeight;
  uniform float uStep;
  uniform vec3 uOrigin;
  uniform float uEase;
  uniform float uLanding;
  uniform float uOutline;
  varying vec3 vCube;
  varying float vOutline;
`;

/** Replaces `begin_vertex`: the cube placed on its cell, lifted by what is left of its fall, squashed or rebounding as it lands. */
const DISPLACE = /* glsl */ `
  float dropT = uTime - aDelay;
  float fallT = clamp(dropT / (uFallMs * ${FALL_SHARE.toFixed(2)}), 0.0, 1.0);
  float landT = clamp((dropT - uFallMs * ${FALL_SHARE.toFixed(2)}) / (uFallMs * ${(1 - FALL_SHARE).toFixed(2)}), 0.0, 1.0);
  float eased = uEase < 0.5 ? fallT : (uEase < 1.5 ? fallT * fallT : fallT * fallT * fallT);
  vec3 cubeSize = vec3(1.0);
  float lift = (1.0 - eased) * uFallHeight;
  if (uLanding > 0.5 && uLanding < 1.5) {
    float squash = sin(3.14159265 * landT) * step(0.999, fallT);
    cubeSize = vec3(1.0 + 0.18 * squash, 1.0 - 0.4 * squash, 1.0 + 0.18 * squash);
  } else if (uLanding > 1.5) {
    lift += 0.9 * uStep * abs(sin(3.14159265 * 1.5 * landT)) * (1.0 - landT) * step(0.999, fallT);
  }
  vec3 transformed = (aCell + 0.5) * uStep + uOrigin;
  transformed.xz += (position.xz) * uStep * cubeSize.xz;
  transformed.y += (position.y + 0.5) * uStep * cubeSize.y - 0.5 * uStep + lift;
  // Not launched yet: collapsed to a point, no pixel.
  if (dropT < 0.0) transformed = vec3(0.0);
  vCube = position + 0.5;
  vOutline = uOutline * (1.0 - smoothstep(0.7, 1.0, fallT));
`;

const EASE_INDEX = Object.fromEntries(DROP_EASES.map((name, i) => [name, i]));
const LANDING_INDEX = Object.fromEntries(DROP_LANDINGS.map((name, i) => [name, i]));

/** The vertex shader of both materials: the declarations after the includes' head, the displacement for `begin_vertex`. */
function patchVertex(shader: { vertexShader: string; uniforms: Record<string, THREE.IUniform> }, uniforms: DropUniforms): void {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", `#include <common>\n${DECLARATIONS}`)
    .replace("#include <begin_vertex>", DISPLACE);
}

/**
 * The falling voxels of one tile: a mesh in the tile's container (so it lies where the real model does), shown while the real
 * model is hidden. `update(time)` moves the clock; `dispose` frees the geometry and materials this drop allocated (the palette
 * texture is the model's, and stays).
 */
export class VoxelDrop {
  readonly object: THREE.Mesh;
  /** The drop's nominal duration, ms, and how long it plays at the clock's speed. */
  readonly durationMs: number;
  readonly playMs: number;
  readonly instances: number;
  readonly triangles: number;
  private readonly uniforms: DropUniforms;
  private readonly geometry: THREE.InstancedBufferGeometry;
  private readonly materials: THREE.Material[] = [];
  private startedAt: number | null = null;
  private readonly speed: number;

  /**
   * `toContainer` takes the grid's frame (the type model's mesh, Y up) to the tile container's: the model's own rotation,
   * scale and offset as `TileRenderer.placedModel` gave them. `source` is the model's material, tuned: the drop lights alike.
   */
  constructor(grid: VoxelGrid, source: THREE.MeshStandardMaterial, toContainer: THREE.Matrix4, settings: VoxelDropSettings) {
    const schedule = planDrop(grid, settings);
    this.durationMs = schedule.durationMs;
    this.speed = settings.speed;
    this.playMs = schedule.durationMs / settings.speed;
    this.instances = grid.count;

    const box = new THREE.BoxGeometry(1, 1, 1);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = box.index;
    geometry.setAttribute("position", box.getAttribute("position"));
    geometry.setAttribute("normal", box.getAttribute("normal"));
    geometry.setAttribute("uv", box.getAttribute("uv"));
    const cell = new Float32Array(grid.count * 3);
    // The grid's cells are (x, y, layer); the shader's are in the model's frame: (x, height, the ground's other axis).
    for (let v = 0; v < grid.count; v++) {
      cell[v * 3] = grid.cells[v * 3]!;
      cell[v * 3 + 1] = grid.cells[v * 3 + 2]!;
      cell[v * 3 + 2] = grid.cells[v * 3 + 1]!;
    }
    const u = new Float32Array(grid.count);
    for (let v = 0; v < grid.count; v++) u[v] = paletteU(grid.entry[v]!);
    geometry.setAttribute("aCell", new THREE.InstancedBufferAttribute(cell, 3));
    geometry.setAttribute("aU", new THREE.InstancedBufferAttribute(u, 1));
    geometry.setAttribute("aDelay", new THREE.InstancedBufferAttribute(schedule.delays, 1));
    geometry.instanceCount = grid.count;
    this.geometry = geometry;
    this.triangles = (box.index ? box.index.count : 36) / 3 * grid.count;

    // The grid's corner is (x, height, ground's other axis) in the model's frame.
    this.uniforms = {
      uTime: { value: -1 },
      uFallMs: { value: schedule.fallMs },
      uFallHeight: { value: settings.fallVoxels * grid.step },
      uStep: { value: grid.step },
      uOrigin: { value: new THREE.Vector3(grid.origin[0], grid.origin[1], grid.origin[2]) },
      uEase: { value: EASE_INDEX[settings.ease]! },
      uLanding: { value: LANDING_INDEX[settings.landing]! },
      uOutline: { value: settings.outline ? 1 : 0 },
    };

    // The model's tuned standard material (palette map, roughness, metalness), without the tile shader's patches.
    const material = source.clone();
    material.onBeforeCompile = (shader) => {
      patchVertex(shader, this.uniforms);
      // Each cube reads its palette entry's texel; without a palette map the material's colour stays.
      if (source.map) shader.vertexShader = shader.vertexShader.replace("#include <uv_vertex>", "#include <uv_vertex>\n  vMapUv = vec2(aU, 0.5);");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vCube;\nvarying float vOutline;")
        .replace(
          "#include <map_fragment>",
          /* glsl */ `#include <map_fragment>
          {
            // The distance to the nearest edge of the face this fragment is on: the middle of the three distances to a pair of faces.
            vec3 edge = min(vCube, 1.0 - vCube);
            float onEdge = edge.x + edge.y + edge.z - min(min(edge.x, edge.y), edge.z) - max(max(edge.x, edge.y), edge.z);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${OUTLINE_LINEAR}), (1.0 - smoothstep(0.0, ${OUTLINE_WIDTH}, onEdge)) * vOutline);
          }`,
        );
    };
    material.customProgramCacheKey = () => "voxel-drop";
    this.materials.push(material);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(toContainer);
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    mesh.castShadow = settings.shadows;
    if (settings.shadows) {
      const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
      depth.onBeforeCompile = (shader) => patchVertex(shader, this.uniforms);
      depth.customProgramCacheKey = () => "voxel-drop-depth";
      mesh.customDepthMaterial = depth;
      this.materials.push(depth);
    }
    mesh.name = "voxel-drop";
    this.object = mesh;
    box.dispose();
  }

  /** Moves the clock to `time` (ms, `performance.now`); true while voxels are still to land. */
  update(time: number): boolean {
    this.startedAt ??= time;
    const elapsed = (time - this.startedAt) * this.speed;
    this.uniforms.uTime.value = elapsed;
    return elapsed < this.durationMs;
  }

  dispose(): void {
    this.object.removeFromParent();
    this.geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.materials.length = 0;
  }
}
