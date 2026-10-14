import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  DEFAULT_OUTLINE_SETTINGS,
  OUTLINE_DEPTH_BIAS,
  applyOutlineStroke,
  createOutline,
  createOutlineMaterial,
  distanceForTilePixels,
  isOutline,
  outlineStroke,
  tilePixels,
  type OutlineSettings,
} from "../src/core/outlines";
import { cameraDistanceLimits, resolveRendererSettings, DEFAULT_CAMERA_ZOOM_SETTINGS } from "../src/core/settings";
import { buildEdgesGeometry } from "../src/core/edges";

const S: OutlineSettings = {
  enabled: true,
  fadeThresholdTilePx: 60,
  fadeRangeTilePx: 30,
  minWidthPx: 1,
  maxWidthPx: 2.5,
  maxWidthTilePx: 500,
};

describe("outlineStroke: the zoom-to-width function", () => {
  it("is off at and below the fade threshold", () => {
    for (const px of [0, 1, 30, 59.9, 60]) expect(outlineStroke(px, S)).toEqual({ width: 0, opacity: 0 });
    expect(outlineStroke(Number.NaN, S).opacity).toBe(0);
  });

  it("fades in over the fade range, from nothing, without a pop", () => {
    expect(outlineStroke(60.01, S).opacity).toBeLessThan(1e-4);
    const mid = outlineStroke(75, S);
    expect(mid.opacity).toBeCloseTo(0.5, 5);
    expect(mid.width).toBe(1);
    expect(outlineStroke(90, S)).toEqual({ width: 1, opacity: 1 });
  });

  it("clamps at the maximum width zoomed in", () => {
    for (const px of [500, 501, 2000, 1e6, Infinity]) expect(outlineStroke(px, S)).toEqual({ width: 2.5, opacity: 1 });
  });

  it("never gets thinner or fainter as the camera zooms in, and is continuous", () => {
    let prev = outlineStroke(0, S);
    for (let px = 0; px <= 1000; px += 0.25) {
      const s = outlineStroke(px, S);
      expect(s.width * s.opacity).toBeGreaterThanOrEqual(prev.width * prev.opacity);
      if (prev.opacity > 0) {
        expect(s.width).toBeGreaterThanOrEqual(prev.width);
        expect(s.opacity).toBeGreaterThanOrEqual(prev.opacity);
        expect(s.width - prev.width).toBeLessThan(0.01);
        expect(s.opacity - prev.opacity).toBeLessThan(0.05);
      }
      prev = s;
    }
  });

  it("widens between the end of the fade and the maximum", () => {
    const w = outlineStroke(200, S).width;
    expect(w).toBeGreaterThan(1);
    expect(w).toBeLessThan(2.5);
  });

  it("is off when disabled, and handles a zero fade range as a step at the threshold", () => {
    expect(outlineStroke(400, { ...S, enabled: false })).toEqual({ width: 0, opacity: 0 });
    const step = { ...S, fadeRangeTilePx: 0 };
    expect(outlineStroke(60, step).opacity).toBe(0);
    expect(outlineStroke(60.5, step)).toEqual({ width: 1 + (2.5 - 1) * (Math.log(60.5 / 60) / Math.log(500 / 60)), opacity: 1 });
  });

  it("defaults: off at the game's opening view of a 900 px window, at full width zoomed in", () => {
    const camera = new THREE.PerspectiveCamera(50, 1.6, 1, 2000);
    camera.zoom = 5;
    expect(outlineStroke(tilePixels(camera, 240, 900)).opacity).toBe(0);
    expect(outlineStroke(tilePixels(camera, 5, 900))).toEqual({ width: DEFAULT_OUTLINE_SETTINGS.maxWidthPx, opacity: 1 });
  });
});

describe("tilePixels", () => {
  const camera = new THREE.PerspectiveCamera(50, 1.6, 1, 2000);
  camera.zoom = 5;

  it("is the tile's on-screen size: inversely proportional to distance, proportional to the viewport and the zoom", () => {
    const at240 = tilePixels(camera, 240, 900);
    // 240 units at 50 degrees and zoom 5 show 44.8 units: a 3-unit tile is about 60 px of 900.
    expect(at240).toBeCloseTo(60.3, 1);
    expect(tilePixels(camera, 120, 900)).toBeCloseTo(2 * at240, 6);
    expect(tilePixels(camera, 240, 450)).toBeCloseTo(at240 / 2, 6);
    expect(tilePixels(camera, 0, 900)).toBe(0);
    expect(tilePixels(camera, 240, 0)).toBe(0);
  });

  it("distanceForTilePixels is its inverse", () => {
    for (const d of [5, 60, 240, 300]) expect(distanceForTilePixels(camera, tilePixels(camera, d, 700), 700)).toBeCloseTo(d, 6);
  });
});

describe("outline material", () => {
  it("is biased towards the camera, drawn after the faces and writes no depth", () => {
    expect(OUTLINE_DEPTH_BIAS.factor).toBeLessThan(0);
    expect(OUTLINE_DEPTH_BIAS.units).toBeLessThan(0);
    const material = createOutlineMaterial();
    expect(material.polygonOffset).toBe(true);
    expect(material.polygonOffsetFactor).toBe(OUTLINE_DEPTH_BIAS.factor);
    expect(material.polygonOffsetUnits).toBe(OUTLINE_DEPTH_BIAS.units);
    expect(material.depthWrite).toBe(false);
    expect(material.transparent).toBe(true);
    const outline = createOutline(buildEdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), material);
    expect(isOutline(outline)).toBe(true);
    expect(outline.renderOrder).toBeGreaterThan(0);
  });

  it("is hidden at opacity 0 and takes the stroke otherwise", () => {
    const material = createOutlineMaterial();
    applyOutlineStroke(material, { width: 0, opacity: 0 });
    expect(material.visible).toBe(false);
    applyOutlineStroke(material, { width: 1.5, opacity: 0.4 });
    expect(material.visible).toBe(true);
    expect(material.linewidth).toBe(1.5);
    expect(material.opacity).toBe(0.4);
  });
});

describe("renderer settings", () => {
  it("fills what an input leaves out with the defaults", () => {
    const s = resolveRendererSettings({ outlines: { maxWidthPx: 3 }, camera: { capZoomOut: true } });
    expect(s.outlines).toEqual({ ...DEFAULT_OUTLINE_SETTINGS, maxWidthPx: 3 });
    expect(s.camera).toEqual({ ...DEFAULT_CAMERA_ZOOM_SETTINGS, capZoomOut: true });
  });

  it("caps the zoom-out only when the cap is on, never below the closest distance", () => {
    const camera = { minDistance: 5, maxDistance: 300, capZoomOut: false, zoomOutCapDistance: 150 };
    expect(cameraDistanceLimits(camera)).toEqual({ min: 5, max: 300 });
    expect(cameraDistanceLimits({ ...camera, capZoomOut: true })).toEqual({ min: 5, max: 150 });
    expect(cameraDistanceLimits({ ...camera, capZoomOut: true, zoomOutCapDistance: 400 })).toEqual({ min: 5, max: 300 });
    expect(cameraDistanceLimits({ ...camera, capZoomOut: true, zoomOutCapDistance: 2 })).toEqual({ min: 5, max: 5 });
  });

  it("keeps the fallback cap off by default", () => {
    expect(DEFAULT_CAMERA_ZOOM_SETTINGS.capZoomOut).toBe(false);
  });
});
