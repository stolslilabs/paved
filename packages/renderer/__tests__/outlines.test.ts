import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  DEFAULT_OUTLINE_SETTINGS,
  MIN_OUTLINE_OPACITY,
  OUTLINE_DEPTH_BIAS,
  TILE_VOXELS,
  VOXEL_SIZE,
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
import { TILE_SIZE } from "../src/core/types";

const S: OutlineSettings = {
  enabled: true,
  fadeOffTilePx: 60,
  fadeFullTilePx: 90,
  widthVoxels: 0.02,
  minWidthDevicePx: 1,
  maxWidthPx: 2.5,
  color: "#1f1f1f",
};

/** The tile size (CSS px) at which a world-width stroke is `devicePx` wide at pixel ratio `ratio`. */
const tilePxForWidth = (settings: OutlineSettings, devicePx: number, ratio = 1) =>
  (devicePx * TILE_SIZE) / (settings.widthVoxels * VOXEL_SIZE * ratio);

describe("outlineStroke: the zoom-to-stroke function", () => {
  it("is off at and below the off size", () => {
    for (const px of [0, 1, 30, 59.9, 60]) expect(outlineStroke(px, S)).toEqual({ width: 0, opacity: 0 });
    expect(outlineStroke(Number.NaN, S).opacity).toBe(0);
  });

  it("fades in linearly between the off and the full sizes, from nothing, without a pop", () => {
    expect(outlineStroke(60.01, S).opacity).toBe(0); // under 1/255: not drawn
    expect(outlineStroke(60 + 30.001 / 255, S).opacity).toBeCloseTo(1 / 255, 6);
    expect(outlineStroke(70, S).opacity).toBeCloseTo(1 / 3, 9);
    expect(outlineStroke(75, S)).toEqual({ width: 1, opacity: 0.5 });
    expect(outlineStroke(90, S)).toEqual({ width: 1, opacity: 1 });
  });

  it("hides the stroke below an opacity of 1/255", () => {
    expect(MIN_OUTLINE_OPACITY).toBe(1 / 255);
    const justUnder = 60 + (30 / 255) * 0.99;
    expect(outlineStroke(justUnder, S)).toEqual({ width: 0, opacity: 0 });
  });

  it("is the world width in device px: a share of a voxel at the zoom, times the pixel ratio", () => {
    expect(VOXEL_SIZE).toBe(TILE_SIZE / TILE_VOXELS);
    expect(TILE_VOXELS).toBe(40);
    const tilePx = tilePxForWidth(S, 1.5);
    expect(outlineStroke(tilePx, S).width).toBeCloseTo(1.5, 9);
    expect(outlineStroke(tilePx, S, 1.5).width).toBeCloseTo(2.25, 9);
    expect(outlineStroke(tilePx / 2, S, 2).width).toBeCloseTo(1.5, 9);
  });

  it("never draws thinner than the minimum, in device px, whatever the pixel ratio", () => {
    expect(outlineStroke(100, S).width).toBe(1);
    expect(outlineStroke(100, S, 2).width).toBe(1);
    expect(outlineStroke(100, { ...S, minWidthDevicePx: 0.5 }).width).toBeCloseTo(0.5, 9);
  });

  it("caps the width at the maximum in CSS px when zoomed in", () => {
    for (const px of [tilePxForWidth(S, 2.5), 1e5, 1e6, Infinity]) expect(outlineStroke(px, S)).toEqual({ width: 2.5, opacity: 1 });
    expect(outlineStroke(1e6, S, 2)).toEqual({ width: 5, opacity: 1 });
  });

  it("never gets thinner or fainter as the camera zooms in, and is continuous", () => {
    let prev = outlineStroke(0, S);
    for (let px = 0; px <= 30000; px += 0.5) {
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

  it("is off when disabled, and handles equal sizes as a step", () => {
    expect(outlineStroke(400, { ...S, enabled: false })).toEqual({ width: 0, opacity: 0 });
    const step = { ...S, fadeFullTilePx: 60 };
    expect(outlineStroke(60, step).opacity).toBe(0);
    expect(outlineStroke(60.5, step)).toEqual({ width: 1, opacity: 1 });
  });

  it("defaults: off at 52 px a tile, about two thirds at the game's opening view of a 900 px window, on at 64 px, a hairline, dark grey", () => {
    const camera = new THREE.PerspectiveCamera(50, 1.6, 1, 2000);
    camera.zoom = 5;
    expect(DEFAULT_OUTLINE_SETTINGS).toEqual({
      enabled: true,
      fadeOffTilePx: 52,
      fadeFullTilePx: 64,
      widthVoxels: 0.015,
      minWidthDevicePx: 1,
      maxWidthPx: 2,
      color: "#1f1f1f",
    });
    expect(outlineStroke(52).opacity).toBe(0);
    const opening = outlineStroke(tilePixels(camera, 240, 900));
    expect(opening.opacity).toBeGreaterThan(0.6);
    expect(opening.opacity).toBeLessThan(0.75);
    expect(outlineStroke(64)).toEqual({ width: 1, opacity: 1 });
    // Fully zoomed in (distance 5) at DPR 2 the world width (about 2.2 device px) is past the hairline, under the cap.
    const zoomedIn = outlineStroke(tilePixels(camera, 5, 900), DEFAULT_OUTLINE_SETTINGS, 2);
    expect(zoomedIn.width).toBeGreaterThan(1);
    expect(zoomedIn.width).toBeLessThan(4);
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

  it("is hidden below an opacity of 1/255 and takes the stroke and the colour otherwise", () => {
    const material = createOutlineMaterial();
    applyOutlineStroke(material, { width: 0, opacity: 0 });
    expect(material.visible).toBe(false);
    applyOutlineStroke(material, { width: 1, opacity: 0.5 / 255 });
    expect(material.visible).toBe(false);
    applyOutlineStroke(material, { width: 1.5, opacity: 0.4 }, "#336699");
    expect(material.visible).toBe(true);
    expect(material.uniforms.linewidth.value).toBe(1.5);
    expect(material.uniforms.opacity.value).toBe(0.4);
    // The CSS channels go to the shader as they are: the composer shows them without an sRGB encoding.
    expect(material.uniforms.diffuse.value.getHex(THREE.LinearSRGBColorSpace)).toBe(0x336699);
  });

  it("starts dark grey, #1f1f1f, and antialiases in its shader (no multisampling needed)", () => {
    const material = createOutlineMaterial();
    expect(material.uniforms.diffuse.value.getHex(THREE.LinearSRGBColorSpace)).toBe(0x1f1f1f);
    expect(material.fragmentShader).toContain("coverage");
    expect(material.fog).toBe(true);
  });

  it("is told the viewport it is drawn into, in device px, before each draw", () => {
    const material = createOutlineMaterial();
    const outline = createOutline(buildEdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), material);
    const renderer = { getCurrentViewport: (v: THREE.Vector4) => v.set(0, 0, 2880, 1800) };
    outline.onBeforeRender(renderer as any, new THREE.Scene(), new THREE.Camera(), outline.geometry, material, null as any);
    expect(material.uniforms.viewport.value.toArray()).toEqual([0, 0, 2880, 1800]);
    // A tile's clone keeps it: outlines are cloned with their tile type's model.
    const clone = outline.clone();
    expect(clone.onBeforeRender).toBe(outline.onBeforeRender);
    expect(isOutline(clone)).toBe(true);
  });
});

describe("renderer settings", () => {
  it("fills what an input leaves out with the defaults", () => {
    const s = resolveRendererSettings({ outlines: { maxWidthPx: 3, color: "#333333" }, camera: { capZoomOut: true } });
    expect(s.outlines).toEqual({ ...DEFAULT_OUTLINE_SETTINGS, maxWidthPx: 3, color: "#333333" });
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
