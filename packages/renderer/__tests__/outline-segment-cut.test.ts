import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  DEFAULT_OUTLINE_SETTINGS,
  VOXEL_SIZE,
  applyOutlineStroke,
  createOutline,
  createOutlineMaterial,
  orderOutlineSegments,
  outlineSegmentCount,
  outlineStroke,
  AXIS_TOLERANCE,
  segmentFade,
  type OutlineSegmentOrder,
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

  it("has no step at the zoom where the outlines fade out (0.85 S, distance 282): OUT-FADE's check", () => {
    // 1440 x 900 at DPR 1 (the least device px), the camera from the opening distance 240 out to 300 in 0.5 % steps. The
    // outlines are off from 282; a segment the cut keeps whole or drops whole there does not change at all, and one in
    // its fade (a vertical edge seen from the 27 degree tilt) changes by a small step per zoom step: the cut is a ramp over
    // a factor of two in length, not a toggle.
    const [width, height] = [1440, 900];
    const at = new THREE.Vector3(30, 0, 18);
    const tilted = (distance: number) => {
      const camera = new THREE.PerspectiveCamera(50, width / height, 1, 2000);
      camera.zoom = 5;
      const tilt = (27 * Math.PI) / 180;
      camera.position.set(0, distance * Math.cos(tilt), distance * Math.sin(tilt));
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      return camera;
    };
    const along = (camera: THREE.PerspectiveCamera, v: THREE.Vector3) =>
      segmentFade(screenLength(camera, at, at.clone().add(v), width, height), OFF, FULL);
    const horizontal = new THREE.Vector3(VOXEL_SIZE, 0, 0);
    const vertical = new THREE.Vector3(0, VOXEL_SIZE, 0);
    let previous = along(tilted(240), vertical);
    for (let distance = 240; distance <= 300; distance *= 1.005) {
      expect(along(topDown(distance, width, height), horizontal)).toBe(1);
      expect(along(topDown(distance, width, height), vertical)).toBe(0);
      expect(along(tilted(distance), horizontal)).toBe(1);
      const fade = along(tilted(distance), vertical);
      expect(Math.abs(fade - previous)).toBeLessThan(0.03);
      previous = fade;
    }
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

describe("the segments the draw skips", () => {
  /** An edges geometry of the given segments. */
  const edgesOf = (segments: number[][]) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(segments.flat(), 3));
    return geometry;
  };
  const V = VOXEL_SIZE;
  // A tile-like outline 3 wide and 0.3 high (y up): its four 3-wide sides, and vertical edges 1, 2 and 4 voxels high.
  const tile = () => [
    [0, 0, 0, 3, 0, 0],
    [3, 0, 0, 3, 0, 3],
    [3, 0, 3, 0, 0, 3],
    [0, 0, 3, 0, 0, 0],
    [1, 0, 1, 1, V, 1],
    [2, 0, 2, 2, 4 * V, 2],
    [1, 0, 2, 1, 2 * V, 2],
  ];

  it("orders the segments along the shortest side (a tile's height) last, longest first", () => {
    const { positions, order } = orderOutlineSegments(new Float32Array(tile().flat()));
    expect(order.head).toBe(4);
    expect(order.axis.toArray()).toEqual([0, 1, 0]);
    expect(Array.from(order.tail)).toEqual([4 * V, 2 * V, V].map(Math.fround));
    expect(Array.from(positions.subarray(24, 30))).toEqual([2, 0, 2, 2, 4 * V, 2].map(Math.fround));
    expect(positions.length).toBe(tile().flat().length);
  });

  /** The outline of `tile()` placed at (x, z) on the board, and the count drawn from a camera straight down at `distance`. */
  function drawn(x: number, z: number, distance: number, ratio = 1, off = OFF) {
    const [width, height] = [1440 * ratio, 900 * ratio];
    const outline = createOutline(edgesOf(tile()), createOutlineMaterial()) as THREE.Mesh<THREE.InstancedBufferGeometry>;
    outline.position.set(x, 0, z);
    outline.updateMatrixWorld();
    const camera = topDown(distance, width, height);
    const order = outline.geometry.userData.segmentOrder as OutlineSegmentOrder;
    return { count: outlineSegmentCount(outline, outline.geometry, order, camera, width, height, off), camera, outline, width, height };
  }

  it("at the opening view, skips the short vertical edges and draws the rest", () => {
    // Near the axis, every vertical edge is a fraction of a pixel; the four sides are always drawn.
    expect(drawn(0, 0, 240).count).toBe(4);
    // Zoomed in on a tile off the axis, the tallest edge comes back first, then the others.
    const counts = [240, 60, 20, 8].map((d) => drawn(10, 6, d).count);
    expect(counts[0]).toBe(4);
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
    expect(counts[counts.length - 1]).toBe(7);
  });

  /** A perspective camera like the game's (fov 50, zoom 5, near 1) at `polar` degrees from vertical, looking at `target`. */
  function tilted(polar: number, azimuth: number, distance: number, target: THREE.Vector3, width: number, height: number) {
    const camera = new THREE.PerspectiveCamera(50, width / height, 1, 2000);
    camera.zoom = 5;
    const p = THREE.MathUtils.degToRad(polar);
    const a = THREE.MathUtils.degToRad(azimuth);
    camera.position.set(target.x + distance * Math.sin(p) * Math.sin(a), target.y + distance * Math.cos(p), target.z + distance * Math.sin(p) * Math.cos(a) + 0.001);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    return camera;
  }

  /** Checks every segment `outlineSegmentCount` skips for `camera` against its exact projection; the number skipped. */
  function expectSkippedUnderCut(x: number, z: number, camera: THREE.PerspectiveCamera, width: number, height: number): number {
    const outline = createOutline(edgesOf(tile()), createOutlineMaterial()) as THREE.Mesh<THREE.InstancedBufferGeometry>;
    outline.position.set(x, 0, z);
    outline.updateMatrixWorld();
    const order = outline.geometry.userData.segmentOrder as OutlineSegmentOrder;
    const count = outlineSegmentCount(outline, outline.geometry, order, camera, width, height, OFF);
    const start = outline.geometry.getAttribute("instanceStart");
    const end = outline.geometry.getAttribute("instanceEnd");
    for (let i = count; i < start.count; i++) {
      const a = new THREE.Vector3().fromBufferAttribute(start, i).applyMatrix4(outline.matrixWorld);
      const b = new THREE.Vector3().fromBufferAttribute(end, i).applyMatrix4(outline.matrixWorld);
      // In front of the camera: the projection is exact, with no near-plane trim.
      expect(a.clone().applyMatrix4(camera.matrixWorldInverse).z).toBeLessThan(-camera.near);
      expect(b.clone().applyMatrix4(camera.matrixWorldInverse).z).toBeLessThan(-camera.near);
      expect(screenLength(camera, a, b, width, height), `segment ${i}`).toBeLessThan(OFF);
    }
    return start.count - count;
  }

  it("skips only segments the shader would drop: each one is shorter on screen than the cut", () => {
    let skipped = 0;
    for (const ratio of [1, 2]) {
      for (const distance of [300, 240, 170, 100, 50, 20, 10]) {
        for (const [x, z] of [[0, 0], [12, -7], [30, 18], [-40, 25]]) {
          const { width, height } = drawn(x, z, distance, ratio);
          skipped += expectSkippedUnderCut(x, z, topDown(distance, width, height), width, height);
        }
      }
    }
    expect(skipped).toBeGreaterThan(0);
  });

  it("skips only what the shader would drop with the camera tilted: 10, 30, 55 and 80 degrees from vertical", () => {
    const skipped: Record<number, number> = { 10: 0, 30: 0, 55: 0, 80: 0 };
    for (const ratio of [1, 2]) {
      const [width, height] = [1440 * ratio, 900 * ratio];
      for (const polar of [10, 30, 55, 80]) {
        for (const azimuth of [0, 45, 160]) {
          for (const distance of [300, 240, 100, 30, 10]) {
            for (const [x, z] of [[0, 0], [2, -1], [-3, 4]]) {
              const camera = tilted(polar, azimuth, distance, new THREE.Vector3(1.5, 0, 1.5), width, height);
              skipped[polar] += expectSkippedUnderCut(x, z, camera, width, height);
            }
          }
        }
      }
    }
    // Tilted, the vertical edges grow on screen: fewer are skipped. At 10 degrees some still are; from 30, a one-voxel
    // riser is over the cut at every distance the outlines draw at, so none is (the check above still runs on each pose).
    expect(skipped[10]).toBeGreaterThan(0);
    expect(skipped[10]).toBeGreaterThanOrEqual(skipped[30]);
    expect(skipped[30]).toBeGreaterThanOrEqual(skipped[55]);
    expect(skipped[55]).toBeGreaterThanOrEqual(skipped[80]);
  });

  it("skips only what the shader would drop with the board at the screen's border", () => {
    let skipped = 0;
    for (const ratio of [1, 2]) {
      const [width, height] = [1440 * ratio, 900 * ratio];
      for (const distance of [240, 100]) {
        // Straight down, the view's half extents at the target: about 0.093 x distance high and 1.6 times that wide.
        const half = (Math.tan(THREE.MathUtils.degToRad(25)) / 5) * distance;
        const camera = topDown(distance, width, height);
        for (const [x, z] of [[1.6 * half - 1.5, 0], [-1.6 * half - 1.5, half - 1.5], [0, -half - 1.5], [1.6 * half - 2, half - 2]]) {
          skipped += expectSkippedUnderCut(x, z, camera, width, height);
        }
        // Tilted, the board's far side at the top border.
        for (const polar of [30, 55]) {
          const view = tilted(polar, 0, distance, new THREE.Vector3(0, 0, 0), width, height);
          expectSkippedUnderCut(-1.5, -half * 1.3, view, width, height);
          expectSkippedUnderCut(1.6 * half - 1.5, 0, view, width, height);
        }
      }
    }
    expect(skipped).toBeGreaterThan(0);
  });

  it("skips only what the shader would drop with the outline's bounding sphere just past the near plane", () => {
    const [width, height] = [1440, 900];
    const outline = createOutline(edgesOf(tile()), createOutlineMaterial()) as THREE.Mesh<THREE.InstancedBufferGeometry>;
    const sphere = outline.geometry.boundingSphere!;
    for (const gap of [0.01, 0.1, 0.5]) {
      for (const polar of [0, 30, 55, 80]) {
        // The camera at near + gap + radius from the sphere's centre, looking at it.
        const camera = tilted(polar, 30, 1 + gap + sphere.radius, sphere.center.clone(), width, height);
        expectSkippedUnderCut(0, 0, camera, width, height);
        // A little farther off the axis too: the sphere seen near the view's edge.
        const aside = tilted(polar, 30, 1 + gap + sphere.radius, sphere.center.clone().add(new THREE.Vector3(0.2, 0, 0.1)), width, height);
        expectSkippedUnderCut(0, 0, aside, width, height);
      }
    }
  });

  it("puts last only the segments within 1e-9 of the axis in cosine", () => {
    expect(AXIS_TOLERANCE).toBe(1e-9);
    const off = (angle: number) => [5, 0, 5, 5 + 0.3 * Math.sin(angle), 0.3 * Math.cos(angle), 5];
    const { order } = orderOutlineSegments(new Float32Array([[0, 0, 0, 10, 0, 0], [0, 0, 0, 0, 0, 10], off(0), off(1e-6), off(1e-3)].flat()));
    // Exactly vertical: last. 1e-6 rad off (cosine 1 - 5e-13): last. 1e-3 rad off (cosine 1 - 5e-7): not.
    expect(order.tail.length).toBe(2);
    expect(order.head).toBe(3);
  });

  it("draws everything with no cut, for a non-perspective camera, or with the camera inside the outline's bounds", () => {
    expect(drawn(10, 6, 240, 1, 0).count).toBe(7);
    const { outline } = drawn(0, 0, 240);
    const order = outline.geometry.userData.segmentOrder as OutlineSegmentOrder;
    const ortho = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 1000);
    ortho.position.set(0, 100, 0);
    ortho.lookAt(0, 0, 0);
    ortho.updateMatrixWorld();
    expect(outlineSegmentCount(outline, outline.geometry, order, ortho, 1440, 900, OFF)).toBe(7);
    const inside = topDown(0.1, 1440, 900);
    inside.position.set(1.5, 0.1, 1.5);
    inside.updateMatrixWorld();
    expect(outlineSegmentCount(outline, outline.geometry, order, inside, 1440, 900, OFF)).toBe(7);
  });

  it("sets the count on the shared geometry before each draw, from the camera drawn with", () => {
    const { outline, camera } = drawn(0, 0, 240);
    const renderer = { getCurrentViewport: (v: THREE.Vector4) => v.set(0, 0, 1440, 900) };
    outline.onBeforeRender(renderer as any, new THREE.Scene(), camera, outline.geometry, outline.material as any, null as any);
    expect(outline.geometry.instanceCount).toBe(4);
    outline.onBeforeRender(renderer as any, new THREE.Scene(), new THREE.Camera(), outline.geometry, outline.material as any, null as any);
    expect(outline.geometry.instanceCount).toBe(7);
  });
});
