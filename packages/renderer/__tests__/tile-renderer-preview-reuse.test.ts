import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { TileRenderer } from "../src/core/TileRenderer";
import type { HoverState } from "../src/core/types";

function createMockAssetLoader() {
  return {
    getModel(_key: string): THREE.Group {
      const group = new THREE.Group();
      const geo = new THREE.BoxGeometry(1, 1, 1);
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff });
      const mesh = new THREE.Mesh(geo, mat);
      group.add(mesh);
      return group;
    },
    getTexture(_key: string): THREE.Texture {
      return new THREE.Texture();
    },
    preloadAll: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn(),
  };
}

function hover(overrides: Partial<HoverState> = {}): HoverState {
  return {
    x: 0,
    y: 0,
    valid: true,
    idle: true,
    planIndex: 9,
    orientation: 1,
    ...overrides,
  };
}

describe("TileRenderer preview reuse", () => {
  it("reuses preview model when only grid position changes", () => {
    const assets = createMockAssetLoader();
    const getModelSpy = vi.spyOn(assets, "getModel");
    const renderer = new TileRenderer(assets as any);

    renderer.setHover(hover({ x: 0, y: 0 }));
    renderer.setHover(hover({ x: 1, y: 0 }));
    renderer.setHover(hover({ x: 2, y: 1 }));

    expect(getModelSpy).toHaveBeenCalledTimes(1);
  });

  it("rebuilds preview only when plan/orientation/valid key changes", () => {
    const assets = createMockAssetLoader();
    const getModelSpy = vi.spyOn(assets, "getModel");
    const renderer = new TileRenderer(assets as any);

    renderer.setHover(hover({ x: 0, y: 0, planIndex: 9, orientation: 1, valid: true }));
    renderer.setHover(hover({ x: 2, y: 2, planIndex: 9, orientation: 1, valid: true }));
    renderer.setHover(hover({ x: 2, y: 2, planIndex: 9, orientation: 2, valid: true }));

    expect(getModelSpy).toHaveBeenCalledTimes(2);
  });
});
