import { describe, expect, it } from "vitest";
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
});
