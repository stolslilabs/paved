import { describe, expect, it } from "vitest";
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

function createMockAssetLoader() {
  return {
    getModel(_key: string): THREE.Group {
      const group = new THREE.Group();
      const geo = new THREE.BoxGeometry(1, 1, 1);
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.15 });
      const mesh = new THREE.Mesh(geo, mat);
      group.add(mesh);
      return group;
    },
    getTexture(_key: string): THREE.Texture {
      return new THREE.Texture();
    },
  };
}

describe("TileRenderer material profile", () => {
  it("does not force voxel roughness to 1", () => {
    const renderer = new TileRenderer(createMockAssetLoader() as any);
    renderer.updateTiles([makeTile()]);

    const roughnessValues: number[] = [];
    renderer.getGroup().traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshStandardMaterial) {
        roughnessValues.push(obj.material.roughness);
      }
    });

    expect(roughnessValues.length).toBeGreaterThan(0);
    expect(roughnessValues.every((r) => r < 1)).toBe(true);
  });
});

