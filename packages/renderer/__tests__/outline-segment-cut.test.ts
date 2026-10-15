import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  DEFAULT_OUTLINE_SETTINGS,
  VOXEL_SIZE,
  applyOutlineStroke,
  createOutline,
  createOutlineMaterial,
  outlineStroke,
  segmentFade,
} from "../src/core/outlines";
import { buildEdgesGeometry, mergeCollinearSegments } from "../src/core/edges";

const { segmentOffDevicePx: OFF, segmentFullDevicePx: FULL } = DEFAULT_OUTLINE_SETTINGS;

/** A segment's length on screen in device px, as the outline vertex shader projects it (no near-plane trim needed). */
function screenLength(camera: THREE.PerspectiveCamera, a: THREE.Vector3, b: THREE.Vector3, width: number, height: number): number {
  const pa = a.clone().project(camera);
  const pb = b.clone().project(camera);
  return Math.hypot(((pb.x - pa.x) / 2) * width, ((pb.y - pa.y) / 2) * height);
}

/** The game's camera (fov 50, zoom 5: `CameraController`) looking straight down from `distance` at the origin. */
function topDown(distance: number, width: number, height: number): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(50, width / height, 1, 2000);
  camera.zoom = 5;
  camera.position.set(0, distance, 0.001);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return camera;
}

describe("the screen-size cut", () => {
  it("draws nothing below the off length, all from the full length, linearly between: no pop", () => {
    expect(OFF).toBe(0.5);
    expect(FULL).toBe(1);
    for (const px of [0, 0.1, 0.49]) expect(segmentFade(px, OFF, FULL)).toBe(0);
    expect(segmentFade(Number.NaN, OFF, FULL)).toBe(0);
    expect(segmentFade(0.75, OFF, FULL)).toBeCloseTo(0.5, 9);
    for (const px of [1, 1.5, 40]) expect(segmentFade(px, OFF, FULL)).toBe(1);
    // Continuous: a tiny change of length (a tiny change of zoom) never moves the share by more than its slope allows.
    let previous = 0;
    for (let px = 0; px <= 2; px += 0.001) {
      const fade = segmentFade(px, OFF, FULL);
      expect(fade).toBeGreaterThanOrEqual(previous);
      expect(fade - previous).toBeLessThanOrEqual(0.001 / (FULL - OFF) + 1e-9);
      previous = fade;
    }
    // Equal bounds are a step at the full length; both at 0 is no cut at all.
    expect(segmentFade(0.99, 1, 1)).toBe(0);
    expect(segmentFade(1, 1, 1)).toBe(1);
    expect(segmentFade(0, 0, 0)).toBe(1);
  });

  it("at the game's opening view, drops a voxel's vertical edge and keeps a horizontal one", () => {
    // 1440 x 900 at DPR 1 and 2, straight down from 240: a tile is about 60 CSS px, a voxel about 1.5.
    for (const ratio of [1, 2]) {
      const [width, height] = [1440 * ratio, 900 * ratio];
      const camera = topDown(240, width, height);
      // A tile near the edge of the view, where perspective shows the most of a vertical edge.
      const at = new THREE.Vector3(30, 0, 18);
      const vertical = screenLength(camera, at, at.clone().add(new THREE.Vector3(0, VOXEL_SIZE, 0)), width, height);
      const horizontal = screenLength(camera, at, at.clone().add(new THREE.Vector3(VOXEL_SIZE, 0, 0)), width, height);
      expect(segmentFade(vertical, OFF, FULL)).toBe(0);
      expect(horizontal).toBeGreaterThan(1.4 * ratio);
      expect(segmentFade(horizontal, OFF, FULL)).toBe(1);
    }
  });

  it("brings a short segment back as the camera zooms in, through the fade", () => {
    const [width, height] = [1440, 900];
    const a = new THREE.Vector3(0, 0, 0);
    const b = new THREE.Vector3(VOXEL_SIZE / 4, 0, 0);
    const at = (distance: number) => segmentFade(screenLength(topDown(distance, width, height), a, b, width, height), OFF, FULL);
    expect(at(240)).toBe(0);
    expect(at(60)).toBe(1);
    const between = [120, 110, 100, 90, 80].map(at);
    expect(between.some((f) => f > 0 && f < 1)).toBe(true);
    for (let i = 1; i < between.length; i++) expect(between[i]).toBeGreaterThanOrEqual(between[i - 1]);
  });

  it("goes to the shader with the stroke: the stroke carries the settings, the material takes them", () => {
    const stroke = outlineStroke(60, { ...DEFAULT_OUTLINE_SETTINGS, segmentOffDevicePx: 1.5, segmentFullDevicePx: 3 });
    expect(stroke).toMatchObject({ segmentOff: 1.5, segmentFull: 3 });
    const material = createOutlineMaterial();
    expect(material.uniforms.segmentCut.value.toArray()).toEqual([OFF, FULL]);
    applyOutlineStroke(material, stroke);
    expect(material.uniforms.segmentCut.value.toArray()).toEqual([1.5, 3]);
    // A stroke without them takes the defaults.
    applyOutlineStroke(material, { width: 1, opacity: 1 });
    expect(material.uniforms.segmentCut.value.toArray()).toEqual([OFF, FULL]);
    // The vertex shader collapses the cut segment's quad, and the fragment shader fades by the share kept.
    expect(material.vertexShader).toContain("segmentCut");
    expect(material.vertexShader).toMatch(/vFade <= 0\.0[\s\S]*gl_Position = vec4\( 0\.0, 0\.0, 2\.0, 1\.0 \)/);
    expect(material.fragmentShader).toContain("opacity * coverage * vFade");
  });
});

describe("mergeCollinearSegments", () => {
  const merged = (segments: number[][]) => Array.from(mergeCollinearSegments(segments.flat()));
  const sorted = (xs: number[]) => {
    const segs: number[][] = [];
    for (let i = 0; i < xs.length; i += 6) segs.push(xs.slice(i, i + 6).map((v) => Math.round(v * 1e6) / 1e6 + 0));
    return segs.sort((a, b) => a.join().localeCompare(b.join()));
  };

  it("merges pieces end to end on one line, in either direction, and overlapping ones", () => {
    expect(sorted(merged([[0, 0, 0, 1, 0, 0], [1, 0, 0, 2, 0, 0], [3, 0, 0, 2, 0, 0]]))).toEqual([[0, 0, 0, 3, 0, 0]]);
    expect(sorted(merged([[0, 1, 0, 0, 1, 2], [0, 1, 1, 0, 1, 3]]))).toEqual([[0, 1, 0, 0, 1, 3]]);
    // A diagonal.
    expect(sorted(merged([[0, 0, 0, 1, 1, 1], [1, 1, 1, 2, 2, 2]]))).toEqual([[0, 0, 0, 2, 2, 2]]);
  });

  it("keeps apart what is not one straight run: a gap, a parallel line, a corner", () => {
    expect(sorted(merged([[0, 0, 0, 1, 0, 0], [1.5, 0, 0, 2, 0, 0]]))).toEqual([[0, 0, 0, 1, 0, 0], [1.5, 0, 0, 2, 0, 0]]);
    expect(sorted(merged([[0, 0, 0, 1, 0, 0], [1, 0.5, 0, 2, 0.5, 0]]))).toEqual([[0, 0, 0, 1, 0, 0], [1, 0.5, 0, 2, 0.5, 0]]);
    expect(sorted(merged([[0, 0, 0, 1, 0, 0], [1, 0, 0, 1, 1, 0]]))).toEqual([[0, 0, 0, 1, 0, 0], [1, 0, 0, 1, 1, 0]]);
  });

  it("drops zero-length segments and keeps an empty input empty", () => {
    expect(merged([[1, 1, 1, 1, 1, 1]])).toEqual([]);
    expect(merged([])).toEqual([]);
  });

  it("merges a box subdivided along its edges back to its 12 edges", () => {
    const box = new THREE.BoxGeometry(1, 1, 1, 3, 3, 3);
    // Subdivided faces are flat, so EdgesGeometry keeps only the edges: each split into 3 pieces.
    const edges = buildEdgesGeometry(box).getAttribute("position").array;
    expect(edges.length / 6).toBe(36);
    expect(mergeCollinearSegments(edges).length / 6).toBe(12);
  });
});

describe("the outline's quad", () => {
  it("is four corners of LineSegmentsGeometry's eight, two triangles a segment, collinear pieces merged", () => {
    const material = createOutlineMaterial();
    const outline = createOutline(buildEdgesGeometry(new THREE.BoxGeometry(1, 1, 1, 2, 2, 2)), material) as THREE.Mesh<
      THREE.InstancedBufferGeometry
    >;
    expect(Array.from(outline.geometry.getIndex()!.array)).toEqual([0, 6, 1, 6, 7, 1]);
    const position = outline.geometry.getAttribute("position");
    // The corners: 0 and 1 at the end side (y 2), 6 and 7 at the start side (y -1), x -1 and 1 across.
    expect([0, 1, 6, 7].map((i) => [position.getX(i), position.getY(i)])).toEqual([[-1, 2], [1, 2], [-1, -1], [1, -1]]);
    expect(outline.geometry.instanceCount).toBe(12);
    expect(outline.geometry.getAttribute("instanceStart").count).toBe(12);
  });
});
