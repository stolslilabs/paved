import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { TileRenderer } from "../src/core/TileRenderer";
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
    occupied_spot: 0,
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

  it("disposes generated edge geometry and line material when tile is removed", () => {
    const assets = createSharedAssetLoader();
    const renderer = new TileRenderer(assets as any);

    renderer.updateTiles([makeTile()]);

    const edgeLines: THREE.LineSegments[] = [];
    renderer.getGroup().traverse((obj) => {
      if (obj instanceof THREE.LineSegments) edgeLines.push(obj);
    });

    expect(edgeLines.length).toBeGreaterThan(0);

    const edgeGeoDisposeSpies = edgeLines.map((line) => vi.spyOn(line.geometry, "dispose"));
    const edgeMatDisposeSpies = edgeLines.map((line) => vi.spyOn(line.material as THREE.Material, "dispose"));

    renderer.updateTiles([]);

    for (const spy of edgeGeoDisposeSpies) {
      expect(spy).toHaveBeenCalled();
    }
    for (const spy of edgeMatDisposeSpies) {
      expect(spy).toHaveBeenCalled();
    }
  });
});
