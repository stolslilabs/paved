import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import {
  DEFAULT_OUTLINE_SETTINGS,
  DEFAULT_OPENING_TILE_PX,
  MIN_OUTLINE_OPACITY,
  OUTLINE_CLOSEST_FACTOR,
  OUTLINE_DEPTH_BIAS,
  OUTLINE_FADE_START,
  OUTLINE_FADE_PRESETS,
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
  outlineScreenOf,
  outlinesAllowed,
  outlineWrittenGrey,
  outlineWrittenColor,
  easeFadeEnd,
  outlineWrittenColorOf,
  outlineFade,
  outlineFadeT,
  outlineOpacityAtOpening,
  outlineStroke,
  probeMajorPerformanceCaveat,
  tilePixels,
  type OutlineSettings,
} from "../src/core/outlines";
import {
  cameraDistanceLimits,
  capPixelRatio,
  resolveRendererSettings,
  DEFAULT_CAMERA_ZOOM_SETTINGS,
  DEFAULT_RENDERER_SETTINGS,
  PIXEL_RATIO_CAPS,
  SMALL_SCREEN_PX,
  resolveMaxPixelRatio,
} from "../src/core/settings";
import { buildEdgesGeometry } from "../src/core/edges";
import { TILE_SIZE } from "../src/core/types";
import { CLOSEST_DISTANCE, OPENING_DISTANCE } from "../src/core/CameraController";

const S: OutlineSettings = {
  enabled: true,
  force: "auto",
  // With the default opening tile size (60 px): off at 60 px, fully on at 90.
  fadeOffFactor: 1,
  fadeFullFactor: 1.5,
  fadeExponent: 2,
  fadeEasedEnd: false,
  widthVoxels: 0.02,
  minWidthDevicePx: 1,
  maxWidthPx: 2.5,
  color: "#1f1f1f",
  segmentOffDevicePx: 0.5,
  segmentFullDevicePx: 1,
};

/** The tile size (CSS px) at which a world-width stroke is `devicePx` wide at pixel ratio `ratio`. */
const tilePxForWidth = (settings: OutlineSettings, devicePx: number, ratio = 1) =>
  (devicePx * TILE_SIZE) / (settings.widthVoxels * VOXEL_SIZE * ratio);

describe("outlineStroke: the zoom-to-stroke function", () => {
  it("is off at and below the off size", () => {
    for (const px of [0, 1, 30, 59.9, 60]) expect(outlineStroke(px, S)).toMatchObject({ width: 0, opacity: 0 });
    expect(outlineStroke(Number.NaN, S).opacity).toBe(0);
  });

  it("fades 1 - t^p between the off and the full sizes, t on log(tile px), from nothing, without a pop", () => {
    expect(outlineStroke(60.01, S).opacity).toBe(0); // under 1/255: not drawn
    // The middle of the log range (the geometric mean, 60 x sqrt(1.5)) is t = 0.5: 1 - 0.25 with p = 2.
    expect(outlineStroke(60 * Math.sqrt(1.5), S)).toMatchObject({ width: 1 });
    expect(outlineStroke(60 * Math.sqrt(1.5), S).opacity).toBeCloseTo(0.75, 9);
    // A quarter of the log range from the full end (t = 0.25): 1 - 0.0625.
    expect(outlineStroke(60 * Math.pow(1.5, 0.75), S).opacity).toBeCloseTo(0.9375, 9);
    expect(outlineStroke(89.99, S).opacity).toBeGreaterThan(0.999);
    expect(outlineStroke(90, S)).toMatchObject({ width: 1, opacity: 1 });
  });

  it("measures t on the logarithm of the tile size: 0 at the full size and above, 1 at the off size and below", () => {
    expect(outlineFadeT(90, 60, 90)).toBe(0);
    expect(outlineFadeT(1e6, 60, 90)).toBe(0);
    expect(outlineFadeT(60, 60, 90)).toBe(1);
    expect(outlineFadeT(1, 60, 90)).toBe(1);
    expect(outlineFadeT(60 * Math.sqrt(1.5), 60, 90)).toBeCloseTo(0.5, 9);
    // Each wheel step (a constant factor) moves t by the same amount.
    const d1 = outlineFadeT(70, 60, 90) - outlineFadeT(70 * 1.05, 60, 90);
    const d2 = outlineFadeT(80, 60, 90) - outlineFadeT(80 * 1.05, 60, 90);
    expect(d1).toBeCloseTo(d2, 9);
  });

  it("is 1 - t^p for p in [1, 4], clamped outside the range and of the exponent", () => {
    const px = 60 * Math.pow(1.5, 0.5); // t = 0.5
    for (const p of [1, 1.5, 2, 3, 4]) expect(outlineFade(px, 60, 90, p)).toBeCloseTo(1 - Math.pow(0.5, p), 9);
    expect(outlineFade(px, 60, 90, 0.2)).toBeCloseTo(0.5, 9); // clamped to 1
    expect(outlineFade(px, 60, 90, 9)).toBeCloseTo(1 - 0.5 ** 4, 9); // clamped to 4
    for (const p of [1, 2, 3, 4]) {
      expect(outlineFade(60, 60, 90, p)).toBe(0);
      expect(outlineFade(10, 60, 90, p)).toBe(0);
      expect(outlineFade(90, 60, 90, p)).toBe(1);
      expect(outlineFade(900, 60, 90, p)).toBe(1);
    }
  });

  it("takes t from a variable start: the same position in the log range, whatever the start", () => {
    // Off at 60 px, start at 90 / 900 / 1800 px: the middle of each log range is t = 0.5.
    for (const full of [90, 900, 1800]) {
      expect(outlineFadeT(60 * Math.sqrt(full / 60), 60, full)).toBeCloseTo(0.5, 9);
      expect(outlineFade(60 * Math.sqrt(full / 60), 60, full, 2)).toBeCloseTo(0.75, 9);
      expect(outlineFadeT(full, 60, full)).toBe(0);
    }
    // A later start fades more gently where the earlier one is already weaker: lower opacity at a given size.
    expect(outlineFade(100, 60, 1800)).toBeLessThan(outlineFade(100, 60, 150));
  });

  it("starts gently and accelerates into the threshold: the slope grows as the camera zooms out (p > 1)", () => {
    const step = 1.02;
    const deltas: number[] = [];
    for (let px = 90; px / step > 60; px /= step) deltas.push(outlineFade(px, 60, 90, 2) - outlineFade(px / step, 60, 90, 2));
    for (let i = 1; i < deltas.length; i++) expect(deltas[i]).toBeGreaterThan(deltas[i - 1]);
    // Linear: every step weighs the same.
    const lin = outlineFade(85, 60, 90, 1) - outlineFade(85 / step, 60, 90, 1);
    const lin2 = outlineFade(65, 60, 90, 1) - outlineFade(65 / step, 60, 90, 1);
    expect(lin).toBeCloseTo(lin2, 9);
  });

  it("eases the end when asked: the same curve above the span, a zero slope at the off size, no kink", () => {
    expect(easeFadeEnd(0)).toBe(0);
    expect(easeFadeEnd(1)).toBe(1);
    expect(easeFadeEnd(0.25)).toBeCloseTo(0.25, 12);
    expect(easeFadeEnd(0.5)).toBe(0.5);
    // C1 at the span's edge, flat at 0, never above the plain curve, monotone.
    const h = 1e-6;
    expect((easeFadeEnd(0.25) - easeFadeEnd(0.25 - h)) / h).toBeCloseTo(1, 4);
    expect(easeFadeEnd(h) / h).toBeLessThan(1e-4);
    let prev = 0;
    for (let b = 0; b <= 0.25; b += 0.005) {
      expect(easeFadeEnd(b)).toBeLessThanOrEqual(b + 1e-12);
      expect(easeFadeEnd(b)).toBeGreaterThanOrEqual(prev);
      prev = easeFadeEnd(b);
    }
    // Through outlineFade: identical away from the end, flatter near it.
    expect(outlineFade(85, 60, 90, 2, true)).toBe(outlineFade(85, 60, 90, 2, false));
    const near = 60 * 1.02;
    expect(outlineFade(near, 60, 90, 2, true)).toBeLessThan(outlineFade(near, 60, 90, 2, false));
    expect(outlineFade(near, 60, 90, 2, true)).toBeGreaterThan(0);
    expect(outlineStroke(near, { ...S, fadeEasedEnd: true }).opacity).toBe(outlineFade(near, 60, 90, 2, true) >= MIN_OUTLINE_OPACITY ? outlineFade(near, 60, 90, 2, true) : 0);
  });

  it("has the presets linear 1, square 2 and cube 3, square being the default", () => {
    expect(OUTLINE_FADE_PRESETS).toEqual({ linear: 1, square: 2, cube: 3 });
    expect(DEFAULT_OUTLINE_SETTINGS.fadeExponent).toBe(OUTLINE_FADE_PRESETS.square);
    expect(DEFAULT_OUTLINE_SETTINGS.fadeEasedEnd).toBe(false);
  });

  it("changes by a bounded share of the opacity at each wheel step", () => {
    const step = 1.02;
    const at = (px: number) => outlineFade(px, 60, 90, 1);
    const deltas: number[] = [];
    for (let px = 60; px * step < 90; px *= step) deltas.push(at(px * step) - at(px));
    // Linear: the slope is 1 per log range, a step's share of it is ln(1.02) / ln(1.5).
    expect(Math.max(...deltas)).toBeLessThan((Math.log(step) / Math.log(1.5)) * 1.01);
  });

  it("hides the stroke below an opacity of 1/255", () => {
    expect(MIN_OUTLINE_OPACITY).toBe(1 / 255);
    // 1 - t^2 = 1/255 at t = sqrt(254 / 255); just above the off size, on the log scale.
    const justUnder = 60 * Math.pow(1.5, 1 - Math.sqrt(254 / 255) - 1e-4);
    expect(outlineFade(justUnder, 60, 90)).toBeLessThan(MIN_OUTLINE_OPACITY);
    expect(outlineStroke(justUnder, S)).toMatchObject({ width: 0, opacity: 0 });
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
    for (const px of [tilePxForWidth(S, 2.5), 1e5, 1e6, Infinity]) expect(outlineStroke(px, S)).toMatchObject({ width: 2.5, opacity: 1 });
    expect(outlineStroke(1e6, S, 2)).toMatchObject({ width: 5, opacity: 1 });
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
    expect(outlineStroke(400, { ...S, enabled: false })).toMatchObject({ width: 0, opacity: 0 });
    const step = { ...S, fadeFullFactor: 1 };
    expect(outlineFade(60, 60, 60)).toBe(0);
    expect(outlineFade(60.1, 60, 60)).toBe(1);
    expect(outlineStroke(60, step).opacity).toBe(0);
    expect(outlineStroke(60.5, step)).toMatchObject({ width: 1, opacity: 1 });
  });

  it("defaults: off at 0.85 S, fully on from 1.5 S, square, a hairline, dark grey", () => {
    expect(OUTLINE_CLOSEST_FACTOR).toBe(30);
    expect(OUTLINE_CLOSEST_FACTOR).toBe(OPENING_DISTANCE / CLOSEST_DISTANCE);
    expect(OUTLINE_FADE_START).toBe(1.5);
    expect(DEFAULT_OUTLINE_SETTINGS).toEqual({
      enabled: true,
      force: "auto",
      fadeOffFactor: 0.85,
      fadeFullFactor: 1.5,
      fadeExponent: 2,
      fadeEasedEnd: false,
      widthVoxels: 0.015,
      minWidthDevicePx: 1,
      maxWidthPx: 2,
      color: "#2a2928",
      segmentOffDevicePx: 0.5,
      segmentFullDevicePx: 1,
    });
    for (const s of [52, 60, 75]) {
      expect(outlineStroke(1.5 * s, DEFAULT_OUTLINE_SETTINGS, 1, s)).toMatchObject({ opacity: 1 });
      expect(outlineStroke(0.85 * s, DEFAULT_OUTLINE_SETTINGS, 1, s).opacity).toBe(0);
      // The opening view: t = ln(1.5) / ln(1.5 / 0.85) = 0.7139, 1 - t^2 = 0.4904.
      expect(outlineStroke(s, DEFAULT_OUTLINE_SETTINGS, 1, s).opacity).toBeCloseTo(0.4904, 3);
    }
    expect(outlineOpacityAtOpening()).toBeCloseTo(0.4904, 3);
    // The tile size at the closest zoom is the opening one times 240 / 8, seen from the camera.
    const cam = new THREE.PerspectiveCamera(50, 1, 5, 2000);
    expect(tilePixels(cam, CLOSEST_DISTANCE, 900) / openingTilePixels(cam, 900)).toBeCloseTo(OUTLINE_CLOSEST_FACTOR, 9);
    // The opacity at S and at 1.15 S for each curve at the default start.
    const at = (m: number, p: number) => outlineFade(m, 0.85, 1.5, p);
    expect([1, 2, 3].map((p) => Number(at(1, p).toFixed(4)))).toEqual([0.2861, 0.4904, 0.6362]);
    expect([1, 2, 3].map((p) => Number(at(1.15, p).toFixed(4)))).toEqual([0.5322, 0.7812, 0.8976]);
    // The "max zoom-in" start (the closest zoom, 30 S): the literal version, almost off at S.
    const far = (m: number, p: number) => outlineFade(m, 0.85, OUTLINE_CLOSEST_FACTOR, p);
    expect([1, 2, 3].map((p) => Number(far(1, p).toFixed(4)))).toEqual([0.0456, 0.0891, 0.1307]);
    expect(outlineOpacityAtOpening(0.85, OUTLINE_CLOSEST_FACTOR)).toBeCloseTo(0.0891, 3);
    expect(outlineStroke(30 * 60, { ...DEFAULT_OUTLINE_SETTINGS, fadeFullFactor: OUTLINE_CLOSEST_FACTOR }, 1, 60).opacity).toBe(1);
    expect(outlineStroke(29 * 60, { ...DEFAULT_OUTLINE_SETTINGS, fadeFullFactor: OUTLINE_CLOSEST_FACTOR }, 1, 60).opacity).toBeLessThan(1);
    // Without an opening size, a 900 px high window's (60 px).
    expect(DEFAULT_OPENING_TILE_PX).toBe(60);
    expect(outlineStroke(70).opacity).toBeCloseTo(outlineFade(70, 51, 90), 9);
    expect(outlineStroke(90)).toMatchObject({ width: 1, opacity: 1 });
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

  it("puts the fade at the same distances on every screen: 0.49 at the opening view, fully on from 240 / 1.5, off past 240 / 0.85", () => {
    for (const height of [780, 900, 1300]) {
      const s = openingTilePixels(camera, height);
      const at = (distance: number) => outlineStroke(tilePixels(camera, distance, height), DEFAULT_OUTLINE_SETTINGS, 1, s);
      expect(at(240).opacity).toBeCloseTo(0.4904, 3);
      expect(at(240 / 1.5)).toMatchObject({ width: 1, opacity: 1 });
      expect(at(CLOSEST_DISTANCE)).toMatchObject({ width: 1, opacity: 1 });
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
    // The colour is the one shown: the shader gets the colour that shows each channel after the finish pass.
    const written = material.uniforms.diffuse.value;
    const shown = outlineScreenOf([written.r, written.g, written.b]);
    for (let k = 0; k < 3; k++) expect(Math.abs(shown[k] - [0x33, 0x66, 0x99][k])).toBeLessThanOrEqual(1);
  });

  it("starts dark grey, #2a2928 on screen (about #101010 written), and antialiases in its shader (no multisampling needed)", () => {
    const material = createOutlineMaterial();
    const written = material.uniforms.diffuse.value.g;
    expect(Math.abs(written * 255 - 0x10)).toBeLessThan(1.5);
    expect(outlineScreenOf(written)[1]).toBe(0x29);
    expect(material.fragmentShader).toContain("coverage");
    expect(material.fog).toBe(true);
  });

  it("converts a hue per channel, not only the green: the shown colour comes back within one 8-bit step", () => {
    for (const css of ["#2a2928", "#3a1a1a", "#a02828", "#1c3a5a", "#336699"]) {
      const material = createOutlineMaterial(css);
      const written = material.uniforms.diffuse.value;
      const shown = outlineScreenOf([written.r, written.g, written.b]);
      const want = [parseInt(css.slice(1, 3), 16), parseInt(css.slice(3, 5), 16), parseInt(css.slice(5, 7), 16)];
      for (let k = 0; k < 3; k++) expect(Math.abs(shown[k] - want[k])).toBeLessThanOrEqual(1);
    }
    // A red is red, not grey: the old green-only conversion wrote r = g = b.
    const red = createOutlineMaterial("#a02828").uniforms.diffuse.value;
    expect(red.r).toBeGreaterThan(red.g * 3);
    // A grey stays grey, to the step.
    const grey = outlineWrittenColor([0x2a, 0x2a, 0x2a]);
    expect(Math.abs(grey[0] - grey[1]) + Math.abs(grey[1] - grey[2])).toBeLessThan(0.02);
  });

  it("memoizes the conversion on the colour: a zoom step re-applies the stroke without solving again", () => {
    const first = outlineWrittenColorOf("#2a2928");
    expect(outlineWrittenColorOf("#2a2928")).toBe(first);
    expect(outlineWrittenColorOf("#a02828")).not.toBe(first);
    expect([...first]).toEqual(outlineWrittenColor([0x2a, 0x29, 0x28]));
    // The default writes about #0f0f0f in linear light, each channel converted (15.0, 15.1, 15.2 of 255).
    for (const [k, want] of [15.0, 15.1, 15.2].entries()) expect(first[k] * 255).toBeCloseTo(want, 0);
    const material = createOutlineMaterial();
    const before = material.uniforms.diffuse.value.clone();
    applyOutlineStroke(material, { width: 1, opacity: 1 }, "#2a2928");
    expect(material.uniforms.diffuse.value.equals(before)).toBe(true);
  });

  it("converts the shown colour to the grey the finish pass needs: a round trip within one 8-bit step", () => {
    for (const shown of [0, 8, 0x20, 0x29, 0x2a, 0x53, 0x80, 0xc0]) {
      const back = outlineScreenOf(outlineWrittenGrey(shown))[1];
      expect(Math.abs(back - shown)).toBeLessThanOrEqual(1);
    }
    expect(outlineWrittenGrey(0)).toBeLessThan(1e-9);
    expect(outlineWrittenGrey(255)).toBeCloseTo(1, 9);
    // The old default #1f1f1f, written as it was, showed lifted to about #53524f at the opening view.
    expect(Math.abs(outlineScreenOf(0x1f / 255)[1] - 0x52)).toBeLessThanOrEqual(2);
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

  it("takes an unset or unknown force as auto, never as a forced path", () => {
    expect(resolveRendererSettings({ outlines: { force: undefined } }).outlines.force).toBe("auto");
    expect(resolveRendererSettings({ outlines: { force: "sometimes" as never } }).outlines.force).toBe("auto");
    expect(resolveRendererSettings({ outlines: { force: "on" } }).outlines.force).toBe("on");
    expect(resolveRendererSettings({ outlines: { force: "off" } }).outlines.force).toBe("off");
  });

  it("keeps the default pixel-ratio cap for a missing, zero or negative one", () => {
    const cap = DEFAULT_RENDERER_SETTINGS.maxPixelRatio;
    expect(resolveRendererSettings({}).maxPixelRatio).toBe(cap);
    expect(resolveRendererSettings({ maxPixelRatio: 0 }).maxPixelRatio).toBe(cap);
    expect(resolveRendererSettings({ maxPixelRatio: -1 }).maxPixelRatio).toBe(cap);
    expect(resolveRendererSettings({ maxPixelRatio: 1.5 }).maxPixelRatio).toBe(1.5);
    expect(resolveRendererSettings({ maxPixelRatio: "auto" }, { ...DEFAULT_RENDERER_SETTINGS, maxPixelRatio: 2 }).maxPixelRatio).toBe("auto");
  });

  it("resolves the \"auto\" cap by device: 2 on a coarse pointer or a small screen, 1.75 elsewhere; a number as is", () => {
    const desk = { coarsePointer: false, width: 1440, height: 900 };
    expect(PIXEL_RATIO_CAPS).toEqual({ coarse: 2, fine: 1.75 });
    expect(resolveMaxPixelRatio("auto", desk)).toBe(1.75);
    expect(resolveMaxPixelRatio("auto", { ...desk, coarsePointer: true })).toBe(2);
    expect(resolveMaxPixelRatio("auto", { ...desk, width: 360, height: 780 })).toBe(2);
    expect(resolveMaxPixelRatio("auto", { ...desk, width: 844, height: 390 })).toBe(2); // a phone held sideways
    expect(resolveMaxPixelRatio("auto", { ...desk, width: SMALL_SCREEN_PX + 1, height: 900 })).toBe(1.75);
    expect(resolveMaxPixelRatio("auto", { ...desk, width: 0, height: 0 })).toBe(1.75); // a hidden container is not small
    expect(resolveMaxPixelRatio(1.5, { ...desk, coarsePointer: true })).toBe(1.5);
  });

  it("caps the pixel ratio: min(devicePixelRatio, cap), 1 for a screen that reports none", () => {
    expect(capPixelRatio(3, 2)).toBe(2);
    expect(capPixelRatio(2, 1.5)).toBe(1.5);
    expect(capPixelRatio(1, 2)).toBe(1);
    expect(capPixelRatio(0, 2)).toBe(1);
    expect(capPixelRatio(Number.NaN, 2)).toBe(1);
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

describe("probeMajorPerformanceCaveat", () => {
  /** Stubs `document.createElement("canvas")` with a canvas whose `getContext(type, options)` is `getContext`. */
  function stubCanvas(getContext: (type: string, options: unknown) => unknown) {
    const createElement = vi.fn(() => ({ getContext: vi.fn(getContext) }));
    vi.stubGlobal("document", { createElement });
    return createElement;
  }
  afterEach(() => vi.unstubAllGlobals());

  it("is true when the browser refuses a context without a major performance caveat", () => {
    const createElement = stubCanvas(() => null);
    expect(probeMajorPerformanceCaveat()).toBe(true);
    expect(createElement).toHaveBeenCalledWith("canvas");
  });

  it("is false when the context is made, and releases it at once", () => {
    const loseContext = vi.fn();
    const getExtension = vi.fn((name: string) => (name === "WEBGL_lose_context" ? { loseContext } : null));
    let asked: unknown[] = [];
    stubCanvas((type, options) => ((asked = [type, options]), { getExtension }));
    expect(probeMajorPerformanceCaveat()).toBe(false);
    expect(asked).toEqual(["webgl2", { failIfMajorPerformanceCaveat: true }]);
    expect(loseContext).toHaveBeenCalledTimes(1);
  });

  it("is undefined when the probe throws, or when there is no DOM", () => {
    stubCanvas(() => {
      throw new Error("no WebGL");
    });
    expect(probeMajorPerformanceCaveat()).toBeUndefined();
    vi.unstubAllGlobals();
    vi.stubGlobal("document", undefined);
    expect(probeMajorPerformanceCaveat()).toBeUndefined();
  });
});
