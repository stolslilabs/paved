import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { cellCorner, cellOutline, screenToGrid } from "../src/core/interaction";
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

/** The play view's camera (#719): 27 degrees from straight down, from the south, `distance` from the cell. */
function playCamera(distance: number): THREE.PerspectiveCamera {
  const c = new THREE.PerspectiveCamera(50, 1, 1, 2000);
  const polar = Math.PI * 0.15;
  c.position.set(0, distance * Math.cos(polar), distance * Math.sin(polar));
  c.lookAt(0, 0, 0);
  c.updateMatrixWorld(true);
  return c;
}

describe("cellOutline (TILE-ACTIONS)", () => {
  it("gives the cell's four corners in the board's order: north-west at the top left, then clockwise", () => {
    const [nw, ne, se, sw] = cellOutline({ x: 0, y: 0 }, camera(), new THREE.Matrix4(), SIZE, TILE_SIZE, 0);
    expect(nw!.x).toBeLessThan(200);
    expect(nw!.y).toBeLessThan(200);
    expect(ne!.x).toBeGreaterThan(200);
    expect(ne!.y).toBeLessThan(200);
    expect(se!.x).toBeGreaterThan(200);
    expect(se!.y).toBeGreaterThan(200);
    expect(sw!.x).toBeLessThan(200);
    expect(sw!.y).toBeGreaterThan(200);
    for (const p of [nw, ne, se, sw]) expect(p!.visible).toBe(true);
  });

  it("scales with the zoom about the cell: twice as close, twice as large on screen", () => {
    const width = (d: number) => {
      const [nw, ne] = cellOutline({ x: 0, y: 0 }, playCamera(d), new THREE.Matrix4(), SIZE, TILE_SIZE, 0.3);
      return ne!.x - nw!.x;
    };
    expect(width(30) / width(60)).toBeCloseTo(2, 1);
  });

  it("turns with the compass: a quarter turn moves each corner to its neighbour's place on screen", () => {
    const turned = new THREE.Matrix4().makeRotationY(Math.PI / 2);
    const plain = cellOutline({ x: 0, y: 0 }, camera(), new THREE.Matrix4(), SIZE, TILE_SIZE, 0);
    const quarter = cellOutline({ x: 0, y: 0 }, camera(), turned, SIZE, TILE_SIZE, 0);
    // The same four places on screen, taken by other corners.
    const key = (p: { x: number; y: number }) => `${Math.round(p.x)},${Math.round(p.y)}`;
    expect(new Set(quarter.map(key))).toEqual(new Set(plain.map(key)));
    expect(key(quarter[0]!)).not.toBe(key(plain[0]!));
  });

  it("the old anchor's drift (the zoom bug): the corner at the tallest tile's height parts from the slab's corner in proportion to the zoom", () => {
    // `projectCell` anchored the bubble at TALLEST_TILE_HEIGHT (2.625 units) above the board: a height in the scene, so its gap to
    // the tile on screen grew as the camera came closer. The outline at the slab's top has no such offset.
    const drift = (d: number) => {
      const c = playCamera(d);
      const high = cellCorner({ x: 0, y: 0 }, c, new THREE.Matrix4(), SIZE, TILE_SIZE, 2.625);
      const [, ne] = cellOutline({ x: 0, y: 0 }, c, new THREE.Matrix4(), SIZE, TILE_SIZE, 0.3);
      return Math.hypot(high.x - ne!.x, high.y - ne!.y);
    };
    expect(drift(30) / drift(60)).toBeGreaterThan(1.8);
  });
});
