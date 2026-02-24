import { describe, it, expect, vi } from "vitest";
import * as THREE from "three";
import { TileRenderer } from "../src/core/TileRenderer";
import type { HoverState } from "../src/core/types";

// Minimal mock AssetLoader that returns a simple box mesh inside a Group
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

function makeHoverState(overrides: Partial<HoverState> = {}): HoverState {
  return {
    x: 0,
    y: 0,
    valid: true,
    idle: true,
    planIndex: 9, // a non-zero plan index (not "00")
    orientation: 1,
    ...overrides,
  };
}

describe("TileRenderer.setHover — position caching", () => {
  it("does not rebuild mesh when called twice with identical hover state", () => {
    const assets = createMockAssetLoader();
    const getModelSpy = vi.spyOn(assets, "getModel");
    const tr = new TileRenderer(assets as any);

    const state = makeHoverState({ x: 2, y: 3 });

    tr.setHover(state);
    expect(getModelSpy).toHaveBeenCalledTimes(1);

    tr.setHover({ ...state }); // same values, new object
    // Should NOT call getModel again — cached
    expect(getModelSpy).toHaveBeenCalledTimes(1);
  });

  it("rebuilds mesh when grid position changes", () => {
    const assets = createMockAssetLoader();
    const getModelSpy = vi.spyOn(assets, "getModel");
    const tr = new TileRenderer(assets as any);

    tr.setHover(makeHoverState({ x: 0, y: 0 }));
    const callsAfterFirst = getModelSpy.mock.calls.length;

    tr.setHover(makeHoverState({ x: 1, y: 0 }));
    const callsAfterSecond = getModelSpy.mock.calls.length;

    // Position changed — should have called getModel again
    expect(callsAfterSecond).toBeGreaterThan(callsAfterFirst);
  });

  it("rebuilds mesh when planIndex changes at same position", () => {
    const assets = createMockAssetLoader();
    const getModelSpy = vi.spyOn(assets, "getModel");
    const tr = new TileRenderer(assets as any);

    tr.setHover(makeHoverState({ x: 0, y: 0, planIndex: 9 }));
    const callsAfterFirst = getModelSpy.mock.calls.length;

    tr.setHover(makeHoverState({ x: 0, y: 0, planIndex: 5 }));
    const callsAfterSecond = getModelSpy.mock.calls.length;

    expect(callsAfterSecond).toBeGreaterThan(callsAfterFirst);
  });

  it("rebuilds mesh when orientation changes at same position", () => {
    const assets = createMockAssetLoader();
    const getModelSpy = vi.spyOn(assets, "getModel");
    const tr = new TileRenderer(assets as any);

    tr.setHover(makeHoverState({ x: 0, y: 0, orientation: 1 }));
    const callsAfterFirst = getModelSpy.mock.calls.length;

    tr.setHover(makeHoverState({ x: 0, y: 0, orientation: 2 }));
    const callsAfterSecond = getModelSpy.mock.calls.length;

    expect(callsAfterSecond).toBeGreaterThan(callsAfterFirst);
  });

  it("rebuilds mesh when valid state changes at same position", () => {
    const assets = createMockAssetLoader();
    const getModelSpy = vi.spyOn(assets, "getModel");
    const tr = new TileRenderer(assets as any);

    tr.setHover(makeHoverState({ x: 0, y: 0, valid: true }));
    const callsAfterFirst = getModelSpy.mock.calls.length;

    tr.setHover(makeHoverState({ x: 0, y: 0, valid: false }));
    const callsAfterSecond = getModelSpy.mock.calls.length;

    expect(callsAfterSecond).toBeGreaterThan(callsAfterFirst);
  });

  it("clears preview when called with null", () => {
    const assets = createMockAssetLoader();
    const tr = new TileRenderer(assets as any);

    tr.setHover(makeHoverState());
    const previewGroup = tr.getGroup().children[2]; // previewGroup
    expect(previewGroup.children.length).toBeGreaterThan(0);

    tr.setHover(null);
    expect(previewGroup.children.length).toBe(0);
  });
});

describe("TileRenderer.dispose — resource cleanup", () => {
  it("disposes emptyGroup meshes when dispose() is called", () => {
    const assets = createMockAssetLoader();
    const tr = new TileRenderer(assets as any);

    // Add some available slots
    tr.setAvailableSlots([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }]);
    const emptyGroup = tr.getGroup().children[1]; // emptyGroup is 2nd child
    expect(emptyGroup.children.length).toBe(3);

    tr.dispose();

    // emptyGroup should be cleared
    expect(emptyGroup.children.length).toBe(0);
  });

  it("disposes all three groups on dispose", () => {
    const assets = createMockAssetLoader();
    const tr = new TileRenderer(assets as any);

    // Add hover preview
    tr.setHover(makeHoverState());
    // Add available slots
    tr.setAvailableSlots([{ x: 0, y: 0 }]);

    const group = tr.getGroup();
    const tileGroup = group.children[0];
    const emptyGroup = group.children[1];
    const previewGroup = group.children[2];

    expect(previewGroup.children.length).toBeGreaterThan(0);
    expect(emptyGroup.children.length).toBeGreaterThan(0);

    tr.dispose();

    expect(previewGroup.children.length).toBe(0);
    expect(emptyGroup.children.length).toBe(0);
  });
});
