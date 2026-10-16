import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { TileRenderer } from "../src/core/TileRenderer";
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

    const meshes: THREE.Mesh[] = [];
    renderer.getGroup().traverse((obj) => {
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
