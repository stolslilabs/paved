import { describe, expect, it } from "vitest";
import { CLOSEST_DISTANCE, PLAY_DEFAULT_POLAR_ANGLE, PLAY_MAX_POLAR_ANGLE, PLAY_ROTATE_SPEED } from "../src/core/CameraController";
import { NativeCameraController } from "../src/core/NativeCameraController";

describe("NativeCameraController", () => {
  it("clamps pan in play mode to board bounds", () => {
    const controller = new NativeCameraController();
    controller.setBoardBounds({ minX: -3, maxX: 3, minZ: -3, maxZ: 3 });

    controller.applyPan(100, -100);

    expect(controller.target.x).toBeGreaterThanOrEqual(-9);
    expect(controller.target.x).toBeLessThanOrEqual(9);
    expect(controller.target.z).toBeGreaterThanOrEqual(-9);
    expect(controller.target.z).toBeLessThanOrEqual(9);
  });

  it("does not clamp pan in showcase mode", () => {
    const controller = new NativeCameraController();
    controller.setBoardBounds({ minX: -3, maxX: 3, minZ: -3, maxZ: 3 });
    controller.setMode("showcase");

    controller.applyPan(100, -100);

    expect(controller.target.x).toBe(100);
    expect(controller.target.z).toBe(-100);
  });

  it("clamps pinch distance within min/max", () => {
    const controller = new NativeCameraController({
      minDistance: 5,
      maxDistance: 20,
      initialDistance: 10,
    });

    controller.applyPinch(0.01);
    expect(controller.getDistance()).toBe(20);

    controller.applyPinch(100);
    expect(controller.getDistance()).toBe(5);
  });

  it("opens at the web's default tilt and tilts within its range", () => {
    const controller = new NativeCameraController({ initialDistance: 100 });
    expect(controller.getPolarAngle()).toBe(PLAY_DEFAULT_POLAR_ANGLE);
    const position = controller.getPosition();
    expect(position.length()).toBeCloseTo(100, 9);
    expect(Math.acos(position.y / 100)).toBeCloseTo(PLAY_DEFAULT_POLAR_ANGLE, 9);

    // A drag down tilts towards straight down, as OrbitControls does: 2 PI x speed x dy / height.
    controller.applyTilt(100, 800);
    expect(controller.getPolarAngle()).toBeCloseTo(PLAY_DEFAULT_POLAR_ANGLE - (2 * Math.PI * PLAY_ROTATE_SPEED * 100) / 800, 9);
    controller.applyTilt(10_000, 800);
    expect(controller.getPolarAngle()).toBe(0);
    controller.applyTilt(-10_000, 800);
    expect(controller.getPolarAngle()).toBe(PLAY_MAX_POLAR_ANGLE);
    controller.applyTilt(50, 0);
    expect(controller.getPolarAngle()).toBe(PLAY_MAX_POLAR_ANGLE);
  });

  it("keeps the web's closest zoom by default", () => {
    const controller = new NativeCameraController();
    controller.applyPinch(1000);
    expect(controller.getDistance()).toBe(CLOSEST_DISTANCE);
  });
});
