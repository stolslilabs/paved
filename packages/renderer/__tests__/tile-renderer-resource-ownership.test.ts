import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { FADED_OPACITY, TileRenderer } from "../src/core/TileRenderer";
import { isOutline } from "../src/core/outlines";
import type { TileRenderData } from "../src/core/types";

function makeTile(overrides: Partial<TileRenderData> = {}): TileRenderData {
  return {
    game_id: 1,
    id: 1,
    player_id: "0x1",
    plan: 9,
    orientation: 1,
    x: 0,
    y: 0,
    worldX: 0,
    worldZ: 0,
    ...overrides,
  };
}

function createSharedAssetLoader() {
  const source = new THREE.Group();
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff });
  const mesh = new THREE.Mesh(geometry, material);
  source.add(mesh);

  return {
    source,
    geometry,
    material,
    has: () => true,
    want: () => {},
    setSkins: () => {},
    getModel(_key: string) {
      return source.clone();
    },
    getTexture() {
      return new THREE.Texture();
    },
  };
}

describe("TileRenderer resource ownership", () => {
  it("does not dispose shared source geometry when tile instances are removed", () => {
    const assets = createSharedAssetLoader();
    const geometryDisposeSpy = vi.spyOn(assets.geometry, "dispose");
    const renderer = new TileRenderer(assets as any);

    renderer.updateTiles([makeTile()]);
    renderer.updateTiles([]);

    expect(geometryDisposeSpy).not.toHaveBeenCalled();
  });

  it("keeps the shared edge outlines when a tile is removed, and disposes them with the renderer", () => {
    const assets = createSharedAssetLoader();
    const renderer = new TileRenderer(assets as any);

    renderer.updateTiles([makeTile()]);

    const edgeLines: THREE.Mesh[] = [];
    renderer.getGroup().traverse((obj) => {
      if (isOutline(obj)) edgeLines.push(obj as THREE.Mesh);
    });

    expect(edgeLines.length).toBeGreaterThan(0);

    const edgeGeoDisposeSpies = edgeLines.map((line) => vi.spyOn(line.geometry, "dispose"));
    const edgeMatDisposeSpies = edgeLines.map((line) => vi.spyOn(line.material as THREE.Material, "dispose"));

    renderer.updateTiles([]);

    for (const spy of [...edgeGeoDisposeSpies, ...edgeMatDisposeSpies]) {
      expect(spy).not.toHaveBeenCalled();
    }

    renderer.dispose();
    for (const spy of [...edgeGeoDisposeSpies, ...edgeMatDisposeSpies]) {
      expect(spy).toHaveBeenCalled();
    }
  });

  it("shares geometry and materials between tiles of the same type", () => {
    const assets = createSharedAssetLoader();
    const renderer = new TileRenderer(assets as any);

    renderer.updateTiles([makeTile({ id: 1 }), makeTile({ id: 2, worldX: 1, orientation: 2 })]);

    // The placed tiles' group (the grid around them is the placement's, SLOTS).
    const meshes: THREE.Mesh[] = [];
    renderer.getGroup().children[0]!.traverse((obj) => {
      if (obj instanceof THREE.Mesh && !isOutline(obj)) meshes.push(obj);
    });

    expect(meshes).toHaveLength(2);
    expect(meshes[0].geometry).toBe(assets.geometry);
    expect(meshes[1].geometry).toBe(assets.geometry);
    expect(meshes[0].material).toBe(meshes[1].material);

    const edges: THREE.Mesh[] = [];
    renderer.getGroup().traverse((obj) => {
      if (isOutline(obj)) edges.push(obj as THREE.Mesh);
    });
    expect(edges).toHaveLength(2);
    expect(edges[0].geometry).toBe(edges[1].geometry);
    expect(edges[0].material).toBe(edges[1].material);
  });

  it("gives each tile mesh one outline, and a pending tile keeps it", () => {
    const assets = createSharedAssetLoader();
    const renderer = new TileRenderer(assets as any);

    renderer.updateTiles([makeTile({ pending: true })]);

    const outlines: THREE.Mesh[] = [];
    renderer.getGroup().traverse((obj) => {
      if (isOutline(obj)) outlines.push(obj as THREE.Mesh);
    });
    expect(outlines).toHaveLength(1);
    expect(outlines[0].children).toHaveLength(0);
    expect(outlines[0].material).not.toBeInstanceOf(THREE.MeshStandardMaterial);
  });
});

// The app's tile stack lifts its tiles above their cell and draws the tile in hand larger (`lift`, `scale`).
describe("TileRenderer lift and scale", () => {
  it("puts a tile `lift` units above its cell at its `scale`, and moves the same mesh when only those change", () => {
    const renderer = new TileRenderer(createSharedAssetLoader() as any);
    renderer.updateTiles([makeTile({ lift: 4, scale: 1.25 })]);
    const [mesh] = (renderer.getGroup().children[0] as THREE.Group).children;
    expect(mesh!.position.y).toBe(4);
    expect(mesh!.scale.x).toBe(1.25);

    expect(renderer.updateTiles([makeTile({ lift: 6, scale: 1 })])).toBe(true);
    const [moved] = (renderer.getGroup().children[0] as THREE.Group).children;
    expect(moved).toBe(mesh);
    expect(moved!.position.y).toBe(6);
    expect(moved!.scale.x).toBe(1);
    expect(renderer.updateTiles([makeTile({ lift: 6, scale: 1 })])).toBe(false);
  });

  it("unset: on its cell at its size", () => {
    const renderer = new TileRenderer(createSharedAssetLoader() as any);
    renderer.updateTiles([makeTile({ worldX: 2 })]);
    const [mesh] = (renderer.getGroup().children[0] as THREE.Group).children;
    expect(mesh!.position.toArray()).toEqual([6, 0, 0]);
    expect(mesh!.scale.x).toBe(1);
  });
});

// The tile stack's tile in hand on a cell of the board: see-through, untinted, without outlines (`faded`).
describe("TileRenderer faded tiles", () => {
  it("draws a faded tile with shared see-through copies of its materials and its outlines hidden; unfaded again, the originals", () => {
    const assets = createSharedAssetLoader();
    const renderer = new TileRenderer(assets as any);
    const meshes = () => {
      const found: THREE.Mesh[] = [];
      renderer.getGroup().children[0]!.traverse((c) => c instanceof THREE.Mesh && !isOutline(c) && found.push(c));
      return found;
    };
    renderer.updateTiles([makeTile({ id: 1, faded: true }), makeTile({ id: 2, worldX: 1, faded: true })]);
    const [a, b] = meshes() as [THREE.Mesh, THREE.Mesh];
    const material = a.material as THREE.MeshStandardMaterial;
    expect(material).not.toBe(assets.material);
    expect(material.transparent).toBe(true);
    expect(material.emissive.getHex()).toBe(assets.material.emissive.getHex());
    // The alpha is faded in the shader (the tile patch writes its own): its program is its own.
    const shader = { fragmentShader: "void main() {\n  #include <tonemapping_fragment>\n}", vertexShader: "", uniforms: {} };
    material.onBeforeCompile(shader as any, {} as any);
    expect(shader.fragmentShader).toContain(`gl_FragColor.a *= ${FADED_OPACITY.toFixed(3)};`);
    expect(material.customProgramCacheKey()).not.toBe(assets.material.customProgramCacheKey());
    expect(b.material).toBe(material);

    renderer.updateTiles([makeTile({ id: 1 }), makeTile({ id: 2, worldX: 1 })]);
    expect(meshes().every((m) => m.material === assets.material)).toBe(true);
  });
});

// The tile stack's pile: real tiles from the deck, a little askew, squashed to a slab (`yaw`, `thickness`).
describe("TileRenderer yaw and thickness", () => {
  it("turns a tile by `yaw` and squashes its model to `thickness`; unset, neither", () => {
    const renderer = new TileRenderer(createSharedAssetLoader() as any);
    renderer.updateTiles([makeTile({ yaw: 0.1, thickness: 0.3 })]);
    const [mesh] = (renderer.getGroup().children[0] as THREE.Group).children;
    expect(mesh!.rotation.y).toBeCloseTo(0.1);
    // The fake model is a unit box made 3 wide: 3 high, so 0.3 thick is a tenth of it.
    expect(mesh!.scale.y).toBeCloseTo(0.1);
    expect(mesh!.scale.x).toBe(1);
    expect(renderer.updateTiles([makeTile()])).toBe(true);
    expect(mesh!.rotation.y).toBe(0);
    expect(mesh!.scale.y).toBe(1);
  });
});

describe("TileRenderer lean", () => {
  it("leans a tile's up toward the azimuth given, after its yaw; unset, flat again", () => {
    const renderer = new TileRenderer(createSharedAssetLoader() as any);
    const toward = (35 * Math.PI) / 180;
    renderer.updateTiles([makeTile({ yaw: toward, lean: { angle: (40 * Math.PI) / 180, toward } })]);
    const [mesh] = (renderer.getGroup().children[0] as THREE.Group).children;
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(mesh!.quaternion);
    // Its up is 40 degrees off the vertical, toward the camera's azimuth (35 degrees from south toward east).
    expect(up.y).toBeCloseTo(Math.cos((40 * Math.PI) / 180));
    expect(Math.atan2(up.x, up.z)).toBeCloseTo(toward);
    // Its north, after the yaw, lies in the plane of the view: the tile's top reads north up on screen.
    const north = new THREE.Vector3(0, 0, -1).applyQuaternion(mesh!.quaternion);
    expect(north.x * Math.cos(toward) - north.z * Math.sin(toward)).toBeCloseTo(0);
    expect(renderer.updateTiles([makeTile()])).toBe(true);
    expect(mesh!.quaternion.equals(new THREE.Quaternion())).toBe(true);
  });
});
