import { describe, it, expect, vi } from "vitest";
import * as THREE from "three";
import { CharRenderer } from "../src/core/CharRenderer";
import type { CharacterRenderData } from "../src/core/types";

function makeChar(overrides: Partial<CharacterRenderData> = {}): CharacterRenderData {
  return {
    gameId: 1,
    playerId: "player1",
    index: 0,
    tileId: 1,
    spot: 0,
    weight: 1,
    power: 1,
    color: "#ff0000",
    worldX: 0,
    worldZ: 0,
    ...overrides,
  };
}

describe("CharRenderer.updateBillboards — vector allocation", () => {
  it("does not call camera.position.clone() per frame", () => {
    const renderer = new CharRenderer();
    renderer.updateCharacters([makeChar()]);

    const camera = new THREE.PerspectiveCamera(50, 1, 1, 2000);
    camera.position.set(0, 10, 5);
    camera.updateMatrixWorld(true);

    const cloneSpy = vi.spyOn(camera.position, "clone");

    // Call 10 times
    for (let i = 0; i < 10; i++) {
      renderer.updateBillboards(camera);
    }

    // Pre-allocated approach: should never clone camera position
    expect(cloneSpy).not.toHaveBeenCalled();
    cloneSpy.mockRestore();
  });

  it("makes billboard discs face camera horizontally", () => {
    const renderer = new CharRenderer();
    renderer.updateCharacters([makeChar({ worldX: 0, worldZ: 0 })]);

    const camera = new THREE.PerspectiveCamera(50, 1, 1, 2000);
    camera.position.set(10, 10, 10);
    camera.updateMatrixWorld(true);

    renderer.updateBillboards(camera);

    // Find the billboard disc (tagged with userData.isBillboard)
    let billboard: THREE.Object3D | null = null;
    renderer.getGroup().traverse((child) => {
      if (child.userData.isBillboard) billboard = child;
    });

    expect(billboard).not.toBeNull();
    // Billboard should have been oriented via lookAt
    // Its quaternion should be non-identity (it was rotated toward camera)
    const identity = new THREE.Quaternion();
    expect(billboard!.quaternion.equals(identity)).toBe(false);
  });
});

describe("CharRenderer.updateCharacters", () => {
  it("adds new characters to the group", () => {
    const renderer = new CharRenderer();
    expect(renderer.getGroup().children.length).toBe(0);

    renderer.updateCharacters([makeChar()]);
    expect(renderer.getGroup().children.length).toBe(1);
  });

  it("removes characters no longer in the list", () => {
    const renderer = new CharRenderer();
    renderer.updateCharacters([makeChar(), makeChar({ index: 1 })]);
    expect(renderer.getGroup().children.length).toBe(2);

    renderer.updateCharacters([makeChar()]); // remove index 1
    expect(renderer.getGroup().children.length).toBe(1);
  });

  it("does not duplicate existing characters", () => {
    const renderer = new CharRenderer();
    const char = makeChar();

    renderer.updateCharacters([char]);
    renderer.updateCharacters([char]);
    expect(renderer.getGroup().children.length).toBe(1);
  });
});

describe("CharRenderer.dispose", () => {
  it("clears all character meshes", () => {
    const renderer = new CharRenderer();
    renderer.updateCharacters([makeChar(), makeChar({ index: 1 })]);
    expect(renderer.getGroup().children.length).toBe(2);

    renderer.dispose();
    // Meshes should be disposed (internal map cleared)
    // Group still exists but updating should work fresh
    renderer.updateCharacters([makeChar()]);
    expect(renderer.getGroup().children.length).toBe(3); // old 2 still in group + 1 new (dispose doesn't remove from group)
  });
});
