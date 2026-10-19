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
  CameraController,
  CLOSEST_DISTANCE,
  OPENING_DISTANCE,
  PLAY_DEFAULT_POLAR_ANGLE,
  PLAY_MAX_POLAR_ANGLE,
  PLAY_ROTATE_SPEED,
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
    expect(controller.controls.minPolarAngle).toBe(0);
    expect(controller.controls.maxPolarAngle).toBeCloseTo(Math.PI * 0.3);
  });

  it("opens tilted 27 degrees at the opening distance, and tilts from straight down to 54 (TILT-54)", () => {
    expect(PLAY_DEFAULT_POLAR_ANGLE).toBeCloseTo((27 * Math.PI) / 180, 12);
    expect(PLAY_MAX_POLAR_ANGLE).toBeCloseTo((54 * Math.PI) / 180, 12);
    expect(PLAY_MAX_POLAR_ANGLE).toBeCloseTo(2 * PLAY_DEFAULT_POLAR_ANGLE, 12);
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

  it("tilts with two fingers on touch (a pinch still zooms), pans with one, tilts with the right button", () => {
    const controller = new CameraController(canvas);
    expect(controller.controls.touches).toEqual({ ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE });
    expect(controller.controls.mouseButtons).toEqual({ LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE });
    expect(controller.controls.rotateSpeed).toBe(PLAY_ROTATE_SPEED);
    // A drag over the surface's full height covers the whole range (OrbitControls: 2 PI x speed x dy / height).
    expect(2 * Math.PI * PLAY_ROTATE_SPEED).toBeGreaterThan(PLAY_MAX_POLAR_ANGLE);
  });

  it("comes no closer than the near plane allows at the steepest tilt", () => {
    expect(CLOSEST_DISTANCE).toBe(10);
    expect(new CameraController(canvas).controls.minDistance).toBe(CLOSEST_DISTANCE);
  });

  it("applies showcase mode with freer orbit and tilt", () => {
    const controller = new CameraController(canvas);

    (controller as any).setMode("showcase");

    expect(controller.controls.minAzimuthAngle).toBe(-Infinity);
    expect(controller.controls.maxAzimuthAngle).toBe(Infinity);
    expect(controller.controls.maxPolarAngle).toBeGreaterThan(PLAY_MAX_POLAR_ANGLE);
  });

  it("returns to play mode after showcase", () => {
    const controller = new CameraController(canvas);

    (controller as any).setMode("showcase");
    (controller as any).setMode("play");

    expect(controller.controls.minAzimuthAngle).toBe(0);
    expect(controller.controls.maxAzimuthAngle).toBe(0);
    expect(controller.controls.maxPolarAngle).toBeCloseTo(PLAY_MAX_POLAR_ANGLE);
    expect(controller.controls.touches.TWO).toBe(THREE.TOUCH.DOLLY_ROTATE);
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

  it("uses placement-safe touch mapping in play mode: one finger pans, two pinch and tilt", () => {
    const controller = new CameraController(canvas);

    expect(controller.controls.touches.ONE).toBe(THREE.TOUCH.PAN);
    expect(controller.controls.touches.TWO).toBe(THREE.TOUCH.DOLLY_ROTATE);
  });

  it("uses rotate-friendly touch mapping in showcase mode", () => {
    const controller = new CameraController(canvas);
    (controller as any).setMode("showcase");

    expect(controller.controls.touches.ONE).toBe(THREE.TOUCH.ROTATE);
    expect(controller.controls.touches.TWO).toBe(THREE.TOUCH.DOLLY_PAN);
  });
});
