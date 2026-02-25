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

import { CameraController } from "../src/core/CameraController";

describe("CameraController camera modes", () => {
  const canvas = {
    clientWidth: 1280,
    clientHeight: 720,
  } as HTMLCanvasElement;

  it("starts in play mode constraints", () => {
    const controller = new CameraController(canvas);

    expect(controller.controls.minAzimuthAngle).toBe(0);
    expect(controller.controls.maxAzimuthAngle).toBe(0);
    expect(controller.controls.maxPolarAngle).toBeCloseTo(Math.PI * 0.15);
  });

  it("applies showcase mode with freer orbit and tilt", () => {
    const controller = new CameraController(canvas);

    (controller as any).setMode("showcase");

    expect(controller.controls.minAzimuthAngle).toBe(-Infinity);
    expect(controller.controls.maxAzimuthAngle).toBe(Infinity);
    expect(controller.controls.maxPolarAngle).toBeGreaterThan(Math.PI * 0.15);
  });

  it("returns to play mode after showcase", () => {
    const controller = new CameraController(canvas);

    (controller as any).setMode("showcase");
    (controller as any).setMode("play");

    expect(controller.controls.minAzimuthAngle).toBe(0);
    expect(controller.controls.maxAzimuthAngle).toBe(0);
    expect(controller.controls.maxPolarAngle).toBeCloseTo(Math.PI * 0.15);
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

  it("uses placement-safe touch mapping in play mode", () => {
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
