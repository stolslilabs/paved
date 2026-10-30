import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";

vi.mock("three/addons/controls/OrbitControls.js", () => {
  class MockOrbitControls {
    camera: THREE.PerspectiveCamera;
    domElement: HTMLCanvasElement;
    target = new THREE.Vector3();

    enableRotate = true;
    enablePan = true;
    enableDamping = true;
    zoomToCursor = true;
    panSpeed = 0.8;
    rotateSpeed = 0.1;
    zoomSpeed = 0.8;

    minAzimuthAngle = -Infinity;
    maxAzimuthAngle = Infinity;
    minPolarAngle = 0;
    maxPolarAngle = Math.PI;
    minDistance = 0;
    maxDistance = Infinity;

    touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };

    mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };

    constructor(camera: THREE.PerspectiveCamera, domElement: HTMLCanvasElement) {
      this.camera = camera;
      this.domElement = domElement;
    }

    addEventListener(): void {}
    update(): boolean {
      return false;
    }
    reset(): void {}
    dispose(): void {}
  }

  return { OrbitControls: MockOrbitControls };
});

import {
  CAMERA_NEAR,
  CameraController,
  CLOSEST_DISTANCE,
  closestDistanceAt,
  FREE_MAX_POLAR_ANGLE,
  FREE_MIN_POLAR_ANGLE,
  FREE_RETURN_MS,
  TALLEST_TILE_HEIGHT,
  OPENING_DISTANCE,
  PLAY_DEFAULT_POLAR_ANGLE,
  tiltedOffset,
} from "../src/core/CameraController";

describe("CameraController camera modes", () => {
  const canvas = {
    clientWidth: 1280,
    clientHeight: 720,
  } as HTMLCanvasElement;

  it("starts in play mode constraints", () => {
    const controller = new CameraController(canvas);

    expect(controller.controls.minAzimuthAngle).toBe(0);
    expect(controller.controls.maxAzimuthAngle).toBe(0);
    // The tilt is locked at the default (#719): nothing rotates the camera.
    expect(controller.controls.minPolarAngle).toBe(PLAY_DEFAULT_POLAR_ANGLE);
    expect(controller.controls.maxPolarAngle).toBe(PLAY_DEFAULT_POLAR_ANGLE);
    expect(controller.controls.enableRotate).toBe(false);
  });

  it("opens tilted 27 degrees at the opening distance (TILT-54)", () => {
    expect(PLAY_DEFAULT_POLAR_ANGLE).toBeCloseTo((27 * Math.PI) / 180, 12);
    const controller = new CameraController(canvas);
    const offset = controller.camera.position.clone().sub(controller.controls.target);
    expect(offset.length()).toBeCloseTo(OPENING_DISTANCE, 9);
    // The polar angle from +y, towards +z: the azimuth the play camera is locked to.
    expect(Math.acos(offset.y / offset.length())).toBeCloseTo(PLAY_DEFAULT_POLAR_ANGLE, 9);
    expect(offset.x).toBe(0);
    expect(offset.z).toBeGreaterThan(0);
    // It looks at its target: the board's centre stays at the centre of the screen.
    const ahead = new THREE.Vector3(0, 0, -1).applyQuaternion(controller.camera.quaternion);
    expect(ahead.dot(offset.clone().normalize().negate())).toBeCloseTo(1, 9);
  });

  it("keeps the tilted offset when it frames the board", () => {
    const controller = new CameraController(canvas);
    controller.focusBounds({ minX: 0, maxX: 12, minZ: -6, maxZ: 6 });
    expect(controller.controls.target.toArray()).toEqual([6, 0, 0]);
    const offset = controller.camera.position.clone().sub(controller.controls.target);
    expect(offset.length()).toBeCloseTo(OPENING_DISTANCE, 9);
    expect(Math.acos(offset.y / offset.length())).toBeCloseTo(PLAY_DEFAULT_POLAR_ANGLE, 9);
  });

  it("straight down keeps a tiny offset (no gimbal lock)", () => {
    expect(tiltedOffset(240, 0).toArray()).toEqual([0, 240, 0.001]);
  });

  it("pans with one finger, pinches and pans with two, pans with the left and right buttons (#719)", () => {
    const controller = new CameraController(canvas);
    expect(controller.controls.touches).toEqual({ ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN });
    expect(controller.controls.mouseButtons).toEqual({ LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN });
  });

  it("comes no closer than the near plane allows", () => {
    expect(CLOSEST_DISTANCE).toBe(10);
    expect(new CameraController(canvas).controls.minDistance).toBe(CLOSEST_DISTANCE);
  });

  it("applies showcase mode with freer orbit and tilt", () => {
    const controller = new CameraController(canvas);

    (controller as any).setMode("showcase");

    expect(controller.controls.minAzimuthAngle).toBe(-Infinity);
    expect(controller.controls.maxAzimuthAngle).toBe(Infinity);
    expect(controller.controls.minPolarAngle).toBe(0);
    expect(controller.controls.maxPolarAngle).toBeCloseTo(Math.PI * 0.42);
    expect(controller.controls.enableRotate).toBe(true);
    expect(controller.controls.mouseButtons.RIGHT).toBe(THREE.MOUSE.ROTATE);
  });

  it("returns to play mode after showcase", () => {
    const controller = new CameraController(canvas);

    (controller as any).setMode("showcase");
    (controller as any).setMode("play");

    expect(controller.controls.minAzimuthAngle).toBe(0);
    expect(controller.controls.maxAzimuthAngle).toBe(0);
    expect(controller.controls.minPolarAngle).toBe(PLAY_DEFAULT_POLAR_ANGLE);
    expect(controller.controls.maxPolarAngle).toBe(PLAY_DEFAULT_POLAR_ANGLE);
    expect(controller.controls.enableRotate).toBe(false);
    expect(controller.controls.mouseButtons.RIGHT).toBe(THREE.MOUSE.PAN);
    expect(controller.controls.touches.TWO).toBe(THREE.TOUCH.DOLLY_PAN);
  });

  it("clamps pan target to board bounds in play mode", () => {
    const controller = new CameraController(canvas);

    (controller as any).setBoardBounds({ minX: -3, maxX: 3, minZ: -3, maxZ: 3 });
    controller.controls.target.set(100, 0, -100);

    controller.update();

    expect(controller.controls.target.x).toBeLessThanOrEqual(9);
    expect(controller.controls.target.x).toBeGreaterThanOrEqual(-9);
    expect(controller.controls.target.z).toBeLessThanOrEqual(9);
    expect(controller.controls.target.z).toBeGreaterThanOrEqual(-9);
  });

  it("does not clamp pan target in showcase mode", () => {
    const controller = new CameraController(canvas);

    (controller as any).setBoardBounds({ minX: -3, maxX: 3, minZ: -3, maxZ: 3 });
    (controller as any).setMode("showcase");
    controller.controls.target.set(100, 0, -100);

    controller.update();

    expect(controller.controls.target.x).toBe(100);
    expect(controller.controls.target.z).toBe(-100);
  });

  it("uses placement-safe touch mapping in play mode: one finger pans, two pinch and pan", () => {
    const controller = new CameraController(canvas);

    expect(controller.controls.touches.ONE).toBe(THREE.TOUCH.PAN);
    expect(controller.controls.touches.TWO).toBe(THREE.TOUCH.DOLLY_PAN);
  });

  it("uses rotate-friendly touch mapping in showcase mode", () => {
    const controller = new CameraController(canvas);
    (controller as any).setMode("showcase");

    expect(controller.controls.touches.ONE).toBe(THREE.TOUCH.ROTATE);
    expect(controller.controls.touches.TWO).toBe(THREE.TOUCH.DOLLY_PAN);
  });
});

/** The camera's farthest zoom by default. */
const DEFAULT_MAX_DISTANCE = 300;

describe("CameraController Camera mode (#875)", () => {
  const canvas = { clientWidth: 375, clientHeight: 812 } as HTMLCanvasElement;
  const deg = (d: number) => (d * Math.PI) / 180;

  /** The camera `distance` from `target`, tilted `polar` and turned `azimuth`. */
  function place(controller: CameraController, polar: number, azimuth: number, distance = 120, target = new THREE.Vector3(6, 0, -3)) {
    controller.controls.target.copy(target);
    controller.camera.position.copy(target).add(new THREE.Vector3().setFromSpherical(new THREE.Spherical(distance, polar, azimuth)));
    controller.camera.lookAt(target);
  }

  it("frees the tilt between 15 and 85 degrees and the turn all the way round, by mouse and by touch", () => {
    expect(FREE_MIN_POLAR_ANGLE).toBeCloseTo(deg(15), 12);
    expect(FREE_MAX_POLAR_ANGLE).toBeCloseTo(deg(85), 12);
    const controller = new CameraController(canvas);
    controller.setMode("free");

    expect(controller.getMode()).toBe("free");
    expect(controller.controls.enableRotate).toBe(true);
    expect(controller.controls.minPolarAngle).toBe(FREE_MIN_POLAR_ANGLE);
    expect(controller.controls.maxPolarAngle).toBe(FREE_MAX_POLAR_ANGLE);
    expect(controller.controls.minAzimuthAngle).toBe(-Infinity);
    expect(controller.controls.maxAzimuthAngle).toBe(Infinity);
    expect(controller.controls.enableDamping).toBe(true);
    // Desktop: the right button turns and tilts, the left pans, the wheel and the middle zoom.
    expect(controller.controls.mouseButtons).toEqual({ LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE });
    // Touch: one finger turns and tilts, two pinch and pan.
    expect(controller.controls.touches).toEqual({ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN });
  });

  it("enters from the play view without moving: the target, the distance and the angles are kept", () => {
    const controller = new CameraController(canvas);
    controller.frame({ x: 4, z: 2 }, 90);
    const position = controller.camera.position.clone();
    const target = controller.controls.target.clone();

    controller.setMode("free");
    controller.update(0);

    expect(controller.camera.position.distanceTo(position)).toBeLessThan(1e-9);
    expect(controller.controls.target.distanceTo(target)).toBeLessThan(1e-9);
    expect(controller.getAngles().polar).toBeCloseTo(PLAY_DEFAULT_POLAR_ANGLE, 9);
  });

  it("eases back to the play view's 27 degrees and turn over 600 ms when it leaves, the target and the distance kept", () => {
    const controller = new CameraController(canvas);
    controller.setMode("free");
    const target = new THREE.Vector3(6, 0, -3);
    place(controller, deg(80), Math.PI * 0.9, 120, target);

    controller.setMode("play");
    // Nothing jumps: the camera is where it was until the clock runs.
    expect(controller.getAngles().polar).toBeCloseTo(deg(80), 9);
    const tilts: number[] = [];
    for (let t = 1000; t <= 1000 + FREE_RETURN_MS; t += 50) {
      expect(controller.update(t)).toBe(true);
      tilts.push(controller.getAngles().polar);
      expect(controller.camera.position.distanceTo(target)).toBeCloseTo(120, 6);
    }
    // Eased in and out: the tilt only comes down, slowly at both ends.
    for (let i = 1; i < tilts.length; i++) expect(tilts[i]!).toBeLessThanOrEqual(tilts[i - 1]! + 1e-12);
    expect(tilts[0]! - tilts[1]!).toBeLessThan(tilts[5]! - tilts[6]!);
    expect(tilts[tilts.length - 2]! - tilts[tilts.length - 1]!).toBeLessThan(tilts[5]! - tilts[6]!);

    const { polar, azimuth } = controller.getAngles();
    expect(polar).toBeCloseTo(PLAY_DEFAULT_POLAR_ANGLE, 9);
    expect(Math.abs(Math.sin(azimuth))).toBeLessThan(1e-9);
    expect(Math.cos(azimuth)).toBeCloseTo(1, 9);
    expect(controller.controls.target.distanceTo(target)).toBe(0);
    // The play view's locks again.
    expect(controller.controls.enableRotate).toBe(false);
    expect(controller.controls.minPolarAngle).toBe(PLAY_DEFAULT_POLAR_ANGLE);
    expect(controller.controls.maxPolarAngle).toBe(PLAY_DEFAULT_POLAR_ANGLE);
    expect(controller.controls.minAzimuthAngle).toBe(0);
    expect(controller.controls.maxAzimuthAngle).toBe(0);
    // Done: the next ticks move nothing.
    expect(controller.update(5000)).toBe(false);
  });

  it("turns back the shorter way round", () => {
    const controller = new CameraController(canvas);
    controller.setMode("free");
    place(controller, deg(45), Math.PI * 0.9);
    controller.setMode("play");
    controller.update(0);
    controller.update(FREE_RETURN_MS / 2);
    // Halfway in time, halfway round (the curve is symmetric): 0.45 pi, not 1.45 pi through the half turn.
    expect(controller.getAngles().azimuth).toBeCloseTo(Math.PI * 0.45, 9);
  });

  it("cuts back to the play view at once without the animation (reduced motion)", () => {
    const controller = new CameraController(canvas);
    controller.setMode("free");
    place(controller, deg(70), -Math.PI / 2, 80);

    controller.setMode("play", { animate: false });

    expect(controller.getAngles().polar).toBeCloseTo(PLAY_DEFAULT_POLAR_ANGLE, 9);
    expect(Math.sin(controller.getAngles().azimuth)).toBeCloseTo(0, 9);
    expect(controller.controls.maxPolarAngle).toBe(PLAY_DEFAULT_POLAR_ANGLE);
    expect(controller.update(0)).toBe(false);
  });

  it("stops the return where a frame puts the camera, and re-entering keeps the camera where the return had it", () => {
    const controller = new CameraController(canvas);
    controller.setMode("free");
    place(controller, deg(80), 1);
    controller.setMode("play");
    controller.update(0);
    controller.update(FREE_RETURN_MS / 2);
    const halfway = controller.getAngles();

    controller.setMode("free");
    controller.update(FREE_RETURN_MS);
    expect(controller.getAngles().polar).toBeCloseTo(halfway.polar, 9);
    expect(controller.getAngles().azimuth).toBeCloseTo(halfway.azimuth, 9);

    controller.setMode("play");
    controller.update(0);
    controller.frame({ x: 0, z: 0 }, 100);
    expect(controller.getAngles().polar).toBeCloseTo(PLAY_DEFAULT_POLAR_ANGLE, 9);
    expect(controller.controls.maxPolarAngle).toBe(PLAY_DEFAULT_POLAR_ANGLE);
    expect(controller.update(FREE_RETURN_MS)).toBe(false);
  });

  it("clamps the target to the board in the Camera mode too", () => {
    const controller = new CameraController(canvas);
    controller.setMode("free");
    controller.setBoardBounds({ minX: -10, maxX: 10, minZ: -10, maxZ: 10 });
    controller.controls.target.set(100, 0, -100);
    controller.update(0);
    expect(controller.controls.target.x).toBe(16);
    expect(controller.controls.target.z).toBe(-16);
  });

  describe("the closest zoom at low angles", () => {
    const halfFovOf = (camera: THREE.PerspectiveCamera) => Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / camera.zoom);

    it("is no closer than today's at the play tilt, and grows with the tilt", () => {
      const { camera } = new CameraController(canvas);
      const halfFov = halfFovOf(camera);
      expect(closestDistanceAt(PLAY_DEFAULT_POLAR_ANGLE, halfFov)).toBeLessThanOrEqual(CLOSEST_DISTANCE);
      let last = 0;
      for (let d = 15; d <= 85; d += 5) {
        const closest = closestDistanceAt(deg(d), halfFov);
        expect(closest).toBeGreaterThan(last);
        last = closest;
      }
      expect(last).toBeGreaterThan(30);
      expect(last).toBeLessThan(DEFAULT_MAX_DISTANCE);
    });

    it("keeps the tallest tile's tops beyond the near plane, on the frustum's lower edge, from 15 to 85 degrees", () => {
      const controller = new CameraController(canvas);
      const halfFov = halfFovOf(controller.camera);
      for (let d = 15; d <= 85; d += 1) {
        const polar = deg(d);
        const distance = closestDistanceAt(polar, halfFov);
        place(controller, polar, 0, distance, new THREE.Vector3());
        controller.camera.updateMatrixWorld();
        // The lower edge's ray, from the camera: where it crosses the tops' height, the depth along the view.
        const ray = new THREE.Vector3(0, -Math.tan(halfFov), -1).normalize().transformDirection(controller.camera.matrixWorld);
        const height = controller.camera.position.y;
        expect(height).toBeGreaterThan(TALLEST_TILE_HEIGHT);
        const hit = controller.camera.position.clone().addScaledVector(ray, (height - TALLEST_TILE_HEIGHT) / -ray.y);
        const depth = -hit.applyMatrix4(controller.camera.matrixWorldInverse).z;
        expect(depth).toBeGreaterThanOrEqual(CAMERA_NEAR - 1e-6);
      }
    });

    it("moves a camera that tilts too low for its zoom out along its view, the target kept", () => {
      const controller = new CameraController(canvas);
      controller.setMode("free");
      const target = new THREE.Vector3(3, 0, 3);
      place(controller, deg(85), 2, 15, target);

      expect(controller.update(0)).toBe(true);

      const closest = closestDistanceAt(deg(85), halfFovOf(controller.camera));
      expect(controller.camera.position.distanceTo(target)).toBeCloseTo(closest, 6);
      expect(controller.getAngles().polar).toBeCloseTo(deg(85), 9);
      expect(controller.getAngles().azimuth).toBeCloseTo(2, 9);
      expect(controller.controls.target.distanceTo(target)).toBe(0);
      // Far enough: nothing moves.
      expect(controller.update(16)).toBe(false);
    });

    it("leaves the play camera's zoom as it was", () => {
      const controller = new CameraController(canvas);
      controller.frame({ x: 0, z: 0 }, CLOSEST_DISTANCE);
      expect(controller.update(0)).toBe(false);
      expect(controller.camera.position.length()).toBeCloseTo(CLOSEST_DISTANCE, 9);
    });
  });
});
