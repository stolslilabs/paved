import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  computeCameraFit,
  DEFAULT_CAMERA_FIT_SETTINGS,
  FRAME_INSETS,
  frameInsetsFor,
  projectGround,
  type CellExtent,
  type FrameInsets,
} from "../src/core/camera-fit";
import { CLOSEST_DISTANCE, OPENING_DISTANCE, PLAY_DEFAULT_POLAR_ANGLE, tiltedOffset } from "../src/core/CameraController";
import { DEFAULT_RENDERER_SETTINGS, resolveRendererSettings } from "../src/core/settings";
import { tilePixels } from "../src/core/outlines";

/** The viewports of the issue (#678), phone first. */
const VIEWPORTS = [
  { name: "375x812", width: 375, height: 812 },
  { name: "390x844", width: 390, height: 844 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1920x1080", width: 1920, height: 1080 },
];

/** The extent in cells of each board: the starter alone, a 10-tile game, the 38-tile bench board's, and a long road. */
const BOARDS: Record<string, CellExtent> = {
  "1 tile": { minX: 0, maxX: 0, minZ: 0, maxZ: 0 },
  "10 tiles": { minX: -2, maxX: 1, minZ: -1, maxZ: 1 },
  "38 tiles": { minX: -4, maxX: 3, minZ: -3, maxZ: 3 },
  "long board": { minX: -12, maxX: 11, minZ: 0, maxZ: 1 },
};

const EPS = 1e-6;

/** The free band of a viewport, in NDC, as `computeCameraFit` reads its insets. */
function freeBand(width: number, height: number, insets: FrameInsets) {
  return {
    left: -1 + (2 * insets.left) / width,
    right: 1 - (2 * insets.right) / width,
    bottom: -1 + (2 * insets.bottom) / height,
    top: 1 - (2 * insets.top) / height,
  };
}

function corners(area: { minX: number; maxX: number; minZ: number; maxZ: number }) {
  return [
    { x: area.minX, z: area.minZ },
    { x: area.maxX, z: area.minZ },
    { x: area.minX, z: area.maxZ },
    { x: area.maxX, z: area.maxZ },
  ];
}

describe("computeCameraFit (CAMERA-FIT, #678)", () => {
  for (const viewport of VIEWPORTS) {
    for (const [boardName, cells] of Object.entries(BOARDS)) {
      it(`frames the ${boardName} board at ${viewport.name}: inside the band, tight on one side, or at the ceiling`, () => {
        const fit = computeCameraFit({ cells, width: viewport.width, height: viewport.height });
        const band = freeBand(viewport.width, viewport.height, frameInsetsFor(viewport.width));
        expect(fit.distance).toBeGreaterThanOrEqual(CLOSEST_DISTANCE);
        expect(fit.distance).toBeLessThanOrEqual(OPENING_DISTANCE + EPS);

        const points = corners(fit.area).map((p) => projectGround(p, fit, viewport));
        const xs = points.map((p) => p.x);
        const ys = points.map((p) => p.y);
        if (fit.limitedBy === "ceiling") {
          expect(fit.distance).toBe(OPENING_DISTANCE);
          // Larger than the screen: it overflows the band on at least one side.
          const overflow = Math.max(band.left - Math.min(...xs), Math.max(...xs) - band.right, band.bottom - Math.min(...ys), Math.max(...ys) - band.top);
          expect(overflow).toBeGreaterThan(0);
          return;
        }
        // Inside the free band...
        expect(Math.min(...xs)).toBeGreaterThanOrEqual(band.left - EPS);
        expect(Math.max(...xs)).toBeLessThanOrEqual(band.right + EPS);
        expect(Math.min(...ys)).toBeGreaterThanOrEqual(band.bottom - EPS);
        expect(Math.max(...ys)).toBeLessThanOrEqual(band.top + EPS);
        // ...and touching it on the side that binds: the closest frame that holds the area.
        const gap =
          fit.limitedBy === "width"
            ? Math.min(Math.min(...xs) - band.left, band.right - Math.max(...xs))
            : Math.min(Math.min(...ys) - band.bottom, band.top - Math.max(...ys));
        expect(gap).toBeLessThan(1e-6);
        // Centred: the area's centre at the band's centre.
        const centre = projectGround({ x: (fit.area.minX + fit.area.maxX) / 2, z: (fit.area.minZ + fit.area.maxZ) / 2 }, fit, viewport);
        expect(centre.x).toBeCloseTo((band.left + band.right) / 2, 6);
        expect(centre.y).toBeCloseTo((band.bottom + band.top) / 2, 6);
      });
    }
  }

  it("frames the tiles and one ring of free slots, widened to the 5 x 5 floor around a small board", () => {
    const one = computeCameraFit({ cells: BOARDS["1 tile"], width: 375, height: 812 });
    // The starter's 3 x 3 cells (it and its ring) widened to 5 x 5 cells of 3 units, centred on the starter.
    expect(one.area).toEqual({ minX: -7.5, maxX: 7.5, minZ: -7.5, maxZ: 7.5 });
    const ten = computeCameraFit({ cells: BOARDS["10 tiles"], width: 375, height: 812 });
    // 4 x 3 cells and the ring: 6 x 5 cells (x from -3 to 2, z from -2 to 2).
    expect(ten.area).toEqual({ minX: -10.5, maxX: 7.5, minZ: -7.5, maxZ: 7.5 });
    const empty = computeCameraFit({ cells: null, width: 375, height: 812 });
    expect(empty).toEqual(one);
  });

  it("never zooms in until the starter tile fills the screen: it opens at most a fifth of the free band wide", () => {
    for (const viewport of VIEWPORTS) {
      const fit = computeCameraFit({ cells: BOARDS["1 tile"], width: viewport.width, height: viewport.height });
      const tile = [projectGround({ x: -1.5, z: 1.5 }, fit, viewport), projectGround({ x: 1.5, z: 1.5 }, fit, viewport)];
      const band = freeBand(viewport.width, viewport.height, frameInsetsFor(viewport.width));
      expect((tile[1].x - tile[0].x) / (band.right - band.left)).toBeLessThanOrEqual(1 / 5 + 1e-9);
    }
  });

  it("depends on the screen: a phone held upright is bound by its width, a desktop by its height, and they differ", () => {
    const phone = computeCameraFit({ cells: BOARDS["10 tiles"], width: 375, height: 812 });
    const desktop = computeCameraFit({ cells: BOARDS["10 tiles"], width: 1440, height: 900 });
    expect(phone.limitedBy).toBe("width");
    expect(desktop.limitedBy).toBe("height");
    expect(phone.distance).not.toBeCloseTo(desktop.distance, 0);
    // Turning the phone sideways frames it again by its (new) height.
    expect(computeCameraFit({ cells: BOARDS["10 tiles"], width: 812, height: 375 }).limitedBy).toBe("height");
  });

  it("opens closer than today's 240 on every board that fits, and at 240 on a board too large for the screen", () => {
    for (const viewport of VIEWPORTS) {
      expect(computeCameraFit({ cells: BOARDS["1 tile"], ...viewport }).distance).toBeLessThan(OPENING_DISTANCE);
    }
    const long = computeCameraFit({ cells: BOARDS["long board"], width: 375, height: 812 });
    expect(long).toMatchObject({ distance: OPENING_DISTANCE, limitedBy: "ceiling" });
  });

  it("grows with the board", () => {
    for (const viewport of VIEWPORTS) {
      const d = ["1 tile", "10 tiles", "38 tiles"].map((b) => computeCameraFit({ cells: BOARDS[b], ...viewport }).distance);
      // The 10-tile board is no deeper than the floor: on a screen bound by its height it opens as the starter does.
      expect(d[0]).toBeLessThanOrEqual(d[1]);
      expect(d[1]).toBeLessThan(d[2]);
    }
  });

  it("follows the floor N (tuned in the story) and the ceiling and closest zoom given", () => {
    const at = (floorCells: number) => computeCameraFit({ cells: BOARDS["1 tile"], width: 1440, height: 900, floorCells }).distance;
    expect(at(3)).toBeLessThan(at(5));
    expect(at(7)).toBeGreaterThan(at(5));
    expect(computeCameraFit({ cells: BOARDS["38 tiles"], width: 375, height: 812, maxDistance: 100 })).toMatchObject({ distance: 100, limitedBy: "ceiling" });
    expect(computeCameraFit({ cells: BOARDS["1 tile"], width: 1440, height: 900, floorCells: 0, ring: 0, minDistance: 80 })).toMatchObject({
      distance: 80,
      limitedBy: "closest",
    });
  });

  it("keeps the frame off the HUD: the area's centre sits above the screen's when the bottom inset is the larger", () => {
    const fit = computeCameraFit({ cells: BOARDS["10 tiles"], width: 375, height: 812 });
    expect(FRAME_INSETS.phone.bottom).toBeGreaterThan(FRAME_INSETS.phone.top);
    const centre = projectGround({ x: (fit.area.minX + fit.area.maxX) / 2, z: (fit.area.minZ + fit.area.maxZ) / 2 }, fit, { width: 375, height: 812 });
    expect(centre.y).toBeGreaterThan(0);
    // No insets: centred on the screen.
    const bare = computeCameraFit({ cells: BOARDS["10 tiles"], width: 375, height: 812, insets: { top: 0, bottom: 0, left: 0, right: 0 } });
    const c = projectGround({ x: (bare.area.minX + bare.area.maxX) / 2, z: (bare.area.minZ + bare.area.maxZ) / 2 }, bare, { width: 375, height: 812 });
    expect(c.x).toBeCloseTo(0, 9);
    expect(c.y).toBeCloseTo(0, 9);
    // Insets larger than the screen leave a band of a fifth of it, never a folded one.
    const crushed = computeCameraFit({ cells: BOARDS["10 tiles"], width: 375, height: 812, insets: { top: 600, bottom: 600, left: 0, right: 0 } });
    expect(Number.isFinite(crushed.distance)).toBe(true);
  });

  it("keeps every corner off a lopsided HUD: the far edge can bind when the free band sits to one side", () => {
    // The review's case: the free band is the right 340 px, and the far left corner, not the near one, binds.
    const viewport = { width: 1440, height: 900 };
    const cases: { cells: CellExtent | null; insets: FrameInsets }[] = [
      { cells: null, insets: { left: 1100, right: 0, top: 0, bottom: 300 } },
      { cells: null, insets: { left: 0, right: 1100, top: 0, bottom: 300 } },
      { cells: BOARDS["10 tiles"], insets: { left: 900, right: 0, top: 120, bottom: 200 } },
    ];
    for (const { cells, insets } of cases) {
      const fit = computeCameraFit({ cells, ...viewport, insets });
      expect(fit.limitedBy).toBe("width");
      const band = freeBand(viewport.width, viewport.height, insets);
      const camera = new THREE.PerspectiveCamera(50, viewport.width / viewport.height, 5, 2000);
      camera.zoom = 5;
      camera.updateProjectionMatrix();
      const target = new THREE.Vector3(fit.target.x, 0, fit.target.z);
      camera.position.copy(target).add(tiltedOffset(fit.distance, PLAY_DEFAULT_POLAR_ANGLE));
      camera.lookAt(target);
      camera.updateMatrixWorld();
      const xs = corners(fit.area).map((p) => new THREE.Vector3(p.x, 0, p.z).project(camera).x);
      expect(Math.min(...xs)).toBeGreaterThanOrEqual(band.left - 1e-4);
      expect(Math.max(...xs)).toBeLessThanOrEqual(band.right + 1e-4);
      // Still the closest such frame: one corner touches the band.
      expect(Math.min(Math.min(...xs) - band.left, band.right - Math.max(...xs))).toBeLessThan(1e-4);
    }
  });

  it("takes the phone's insets below the tablet breakpoint and the larger HUD's from it", () => {
    expect(frameInsetsFor(375)).toBe(FRAME_INSETS.phone);
    expect(frameInsetsFor(639)).toBe(FRAME_INSETS.phone);
    expect(frameInsetsFor(640)).toBe(FRAME_INSETS.tablet);
    expect(frameInsetsFor(1440)).toBe(FRAME_INSETS.tablet);
  });

  it("projects as three's camera does at the play tilt", () => {
    const viewport = { width: 390, height: 844 };
    const fit = computeCameraFit({ cells: BOARDS["38 tiles"], ...viewport });
    const camera = new THREE.PerspectiveCamera(50, viewport.width / viewport.height, 5, 2000);
    camera.zoom = 5;
    camera.updateProjectionMatrix();
    const target = new THREE.Vector3(fit.target.x, 0, fit.target.z);
    camera.position.copy(target).add(tiltedOffset(fit.distance, PLAY_DEFAULT_POLAR_ANGLE));
    camera.lookAt(target);
    camera.updateMatrixWorld();
    for (const p of corners(fit.area)) {
      const ndc = new THREE.Vector3(p.x, 0, p.z).project(camera);
      const ours = projectGround(p, fit, viewport);
      expect(ours.x).toBeCloseTo(ndc.x, 3);
      expect(ours.y).toBeCloseTo(ndc.y, 3);
    }
  });

  it("is a settings group with its defaults: on, a floor of 5, one ring, auto insets, no following", () => {
    expect(DEFAULT_RENDERER_SETTINGS.cameraFit).toEqual(DEFAULT_CAMERA_FIT_SETTINGS);
    expect(DEFAULT_CAMERA_FIT_SETTINGS).toEqual({ enabled: true, floorCells: 5, ring: 1, insets: "auto", followBoard: false });
    expect(resolveRendererSettings({ cameraFit: { floorCells: 7 } }).cameraFit).toEqual({ ...DEFAULT_CAMERA_FIT_SETTINGS, floorCells: 7 });
  });

  it("keeps the outlines' reference: at the new, closer openings a tile is at least the opening tile size S (fully outlined)", () => {
    const camera = new THREE.PerspectiveCamera(50, 1, 5, 2000);
    camera.zoom = 5;
    for (const viewport of VIEWPORTS) {
      const s = tilePixels(camera, OPENING_DISTANCE, viewport.height);
      for (const cells of Object.values(BOARDS)) {
        const fit = computeCameraFit({ cells, ...viewport });
        expect(tilePixels(camera, fit.distance, viewport.height)).toBeGreaterThanOrEqual(s - EPS);
      }
    }
  });
});
