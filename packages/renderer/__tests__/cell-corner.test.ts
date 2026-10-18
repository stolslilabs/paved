import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { cellCorner, screenToGrid } from "../src/core/interaction";
import { TILE_SIZE } from "../src/core/types";

const SIZE = { width: 400, height: 400 };

function camera(): THREE.PerspectiveCamera {
  const c = new THREE.PerspectiveCamera(50, 1, 1, 2000);
  c.position.set(0, 24, 0.1);
  c.lookAt(0, 0, 0);
  c.updateMatrixWorld(true);
  return c;
}

describe("cellCorner", () => {
  it("puts the corner up and to the right of the cell's centre", () => {
    const corner = cellCorner({ x: 0, y: 0 }, camera(), new THREE.Matrix4(), SIZE, TILE_SIZE, 0);
    expect(corner.visible).toBe(true);
    expect(corner.x).toBeGreaterThan(200);
    expect(corner.y).toBeLessThan(200);
  });

  it("inverts screenToGrid: a point just inside the corner maps back into that cell", () => {
    const c = camera();
    const m = new THREE.Matrix4();
    const corner = cellCorner({ x: 2, y: -1 }, c, m, SIZE, TILE_SIZE, 0);
    const ndc = { x: ((corner.x - 2) / SIZE.width) * 2 - 1, y: -(((corner.y + 2) / SIZE.height) * 2 - 1) };
    expect(screenToGrid(ndc, c, m, TILE_SIZE)).toEqual({ x: 2, y: -1 });
  });

  it("is not visible off the surface", () => {
    expect(cellCorner({ x: 40, y: 0 }, camera(), new THREE.Matrix4(), SIZE, TILE_SIZE, 0).visible).toBe(false);
  });
});
