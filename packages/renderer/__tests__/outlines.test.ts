import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  DEFAULT_OUTLINE_SETTINGS,
  DEFAULT_OPENING_TILE_PX,
  MIN_OUTLINE_OPACITY,
  OUTLINE_DEPTH_BIAS,
  TILE_VOXELS,
  VOXEL_SIZE,
  applyOutlineStroke,
  createOutline,
  createOutlineMaterial,
  distanceForTilePixels,
  detectSoftwareWebGL,
  isOutline,
  isSoftwareRenderer,
  openingTilePixels,
  outlinesAllowed,
  outlineStroke,
  tilePixels,
  type OutlineSettings,
} from "../src/core/outlines";
import { cameraDistanceLimits, resolveRendererSettings, DEFAULT_CAMERA_ZOOM_SETTINGS } from "../src/core/settings";
import { buildEdgesGeometry } from "../src/core/edges";
import { TILE_SIZE } from "../src/core/types";
import { OPENING_DISTANCE } from "../src/core/CameraController";

const S: OutlineSettings = {
  enabled: true,
  force: "auto",
  // With the default opening tile size (60 px): off at 60 px, fully on at 90.
  fadeOffFactor: 1,
  fadeFullFactor: 1.5,
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
    // Zoom steps of 0.1 %, 1 to 30,000 px a tile; violations are collected, not asserted one by one (CI's 5 s budget).
    const bad: string[] = [];
    let prev = outlineStroke(0, S);
    for (let px = 1; px <= 30000; px *= 1.001) {
      const s = outlineStroke(px, S);
      if (s.width * s.opacity < prev.width * prev.opacity) bad.push(`weaker at ${px}`);
      if (prev.opacity > 0) {
        if (s.width < prev.width || s.opacity < prev.opacity) bad.push(`decreases at ${px}`);
        if (s.width - prev.width >= 0.01 || s.opacity - prev.opacity >= 0.05) bad.push(`jumps at ${px}`);
      }
      prev = s;
    }
    expect(bad).toEqual([]);
  });

  it("is off when disabled, and handles equal sizes as a step", () => {
    expect(outlineStroke(400, { ...S, enabled: false })).toEqual({ width: 0, opacity: 0 });
    const step = { ...S, fadeFullFactor: 1 };
    expect(outlineStroke(60, step).opacity).toBe(0);
    expect(outlineStroke(60.5, step)).toEqual({ width: 1, opacity: 1 });
  });

  it("defaults: fully on at the opening tile size S, off at 0.85 S, a hairline, dark grey", () => {
    expect(DEFAULT_OUTLINE_SETTINGS).toEqual({
      enabled: true,
      force: "auto",
      fadeOffFactor: 0.85,
      fadeFullFactor: 1,
      widthVoxels: 0.015,
      minWidthDevicePx: 1,
      maxWidthPx: 2,
      color: "#1f1f1f",
    });
    for (const s of [52, 60, 75]) {
      expect(outlineStroke(s, DEFAULT_OUTLINE_SETTINGS, 1, s)).toEqual({ width: 1, opacity: 1 });
      expect(outlineStroke(0.85 * s, DEFAULT_OUTLINE_SETTINGS, 1, s).opacity).toBe(0);
      expect(outlineStroke(0.925 * s, DEFAULT_OUTLINE_SETTINGS, 1, s).opacity).toBeCloseTo(0.5, 9);
    }
    // Without an opening size, a 900 px high window's (60 px).
    expect(DEFAULT_OPENING_TILE_PX).toBe(60);
    expect(outlineStroke(60)).toEqual({ width: 1, opacity: 1 });
    expect(outlineStroke(51).opacity).toBe(0);
  });
});

describe("the opening tile size S", () => {
  const camera = new THREE.PerspectiveCamera(50, 1.6, 1, 2000);
  camera.zoom = 5;

  it("is a tile's size at the camera's opening distance (0.8 of the farthest, 240): about 52 px on a 360 x 780 phone, 60 in a 900 px window", () => {
    expect(OPENING_DISTANCE).toBe(240);
    expect(openingTilePixels(camera, 780)).toBeCloseTo(52.3, 1);
    expect(openingTilePixels(camera, 900)).toBeCloseTo(60.3, 1);
  });

  it("puts the fade at the same distances on every screen: on at the opening view, off past 240 / 0.85", () => {
    for (const height of [780, 900, 1300]) {
      const s = openingTilePixels(camera, height);
      const at = (distance: number) => outlineStroke(tilePixels(camera, distance, height), DEFAULT_OUTLINE_SETTINGS, 1, s);
      expect(at(240)).toEqual({ width: 1, opacity: 1 });
      expect(at(240 / 0.85 + 0.01).opacity).toBe(0);
      // The farthest zoom (300) is past the off distance (about 282): the outlines vanish zoomed out.
      expect(at(300).opacity).toBe(0);
      expect(at(260).opacity).toBeGreaterThan(0);
    }
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

describe("software WebGL: the outlines are off there unless forced", () => {
  /** A WebGL context whose unmasked renderer string is `renderer` (null: the debug extension is hidden). */
  const gl = (renderer: string | null, plain = "WebKit WebGL") => ({
    RENDERER: 0x1f01,
    getExtension: (name: string) => (name === "WEBGL_debug_renderer_info" && renderer !== null ? { UNMASKED_RENDERER_WEBGL: 0x9246 } : null),
    getParameter: (p: number) => (p === 0x9246 ? renderer : p === 0x1f01 ? plain : null),
  });
  const noCaveat = () => false;

  it("knows software renderer strings, and not GPU ones", () => {
    for (const s of [
      "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)",
      "Google SwiftShader",
      "llvmpipe (LLVM 15.0.7, 256 bits)",
      "Mesa softpipe",
      "Microsoft Basic Render Driver",
      "ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0)",
      "Software Rasterizer",
    ]) expect(isSoftwareRenderer(s), s).toBe(true);
    for (const s of ["ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Max, Unspecified Version)", "Adreno (TM) 740", "NVIDIA GeForce RTX 4070/PCIe/SSE2", "Apple GPU", "", null])
      expect(isSoftwareRenderer(s), String(s)).toBe(false);
  });

  it("turns the outlines off for a software renderer string, keeps them on for a GPU", () => {
    const soft = detectSoftwareWebGL(gl("Google SwiftShader") as any, noCaveat);
    expect(soft).toMatchObject({ software: true, renderer: "Google SwiftShader" });
    expect(soft.reason).toContain("SwiftShader");
    expect(outlinesAllowed("auto", soft)).toBe(false);
    const gpu = detectSoftwareWebGL(gl("ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Max, Unspecified Version)") as any, noCaveat);
    expect(gpu.software).toBe(false);
    expect(outlinesAllowed("auto", gpu)).toBe(true);
  });

  it("reads the plain RENDERER when the debug extension is hidden, and takes a major performance caveat as software", () => {
    expect(detectSoftwareWebGL(gl(null, "llvmpipe") as any, noCaveat).software).toBe(true);
    const caveat = detectSoftwareWebGL(gl("Apple GPU") as any, () => true);
    expect(caveat).toMatchObject({ software: true, reason: "major performance caveat" });
    // No context and no DOM to probe (React Native, tests): nothing says software.
    expect(detectSoftwareWebGL(undefined).software).toBe(false);
  });

  it("lets the force setting win over the detection", () => {
    expect(outlinesAllowed("on", { software: true })).toBe(true);
    expect(outlinesAllowed("off", { software: false })).toBe(false);
    expect(outlinesAllowed("auto", { software: true })).toBe(false);
    expect(outlinesAllowed("auto", { software: false })).toBe(true);
  });
});
