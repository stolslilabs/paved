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

function createMockAssetLoader() {
  return {
    getModel(_key: string): THREE.Group {
      const group = new THREE.Group();
      group.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
      return group;
    },
    getTexture(): THREE.Texture {
      return new THREE.Texture();
    },
  };
}

const placed = (renderer: TileRenderer) => [...renderer.getGroup().children[0].children];

describe("TileRenderer placement", () => {
  it("adds the new tile and keeps every other tile object as it was", () => {
    const assets = createMockAssetLoader();
    const getModel = vi.spyOn(assets, "getModel");
    const renderer = new TileRenderer(assets as any);
    const board = [makeTile({ id: 1 }), makeTile({ id: 2, worldX: 1, plan: 5 })];

    renderer.updateTiles(board);
    const before = placed(renderer);
    expect(before).toHaveLength(2);
    expect(getModel).toHaveBeenCalledTimes(2); // once per plan type

    renderer.updateTiles([...board, makeTile({ id: 3, worldX: 2, orientation: 3 })]);
    const after = placed(renderer);

    expect(after).toHaveLength(3);
    expect(after.slice(0, 2)).toEqual(before);
    expect(getModel).toHaveBeenCalledTimes(2); // the new tile reuses its type
  });

  it("replaces only the tile whose pending state changed", () => {
    const renderer = new TileRenderer(createMockAssetLoader() as any);
    const confirmed = makeTile({ id: 1 });
    renderer.updateTiles([confirmed, makeTile({ id: 2, worldX: 1, pending: true })]);
    const [first, pendingTile] = placed(renderer);

    renderer.updateTiles([confirmed, makeTile({ id: 2, worldX: 1 })]);
    const after = placed(renderer);

    expect(after).toHaveLength(2);
    expect(after[0]).toBe(first);
    expect(after[1]).not.toBe(pendingTile);
  });
});
