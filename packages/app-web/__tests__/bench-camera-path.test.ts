import { describe, it, expect } from "vitest";
import { PATH_FAR, PATH_NEAR, cameraPose } from "../src/bench/camera-path";

const bounds = { minX: -15, maxX: 12, minZ: -9, maxZ: 18 };
const dist = (p: ReturnType<typeof cameraPose>) =>
  Math.hypot(...(p.position.map((v, i) => v - p.target[i]) as [number, number, number]));

describe("bench camera path", () => {
  it("is deterministic", () => {
    expect(cameraPose(0.37, bounds)).toEqual(cameraPose(0.37, bounds));
  });

  it("starts and ends at the far, top-down pose over the board centre", () => {
    for (const u of [0, 1]) {
      const p = cameraPose(u, bounds);
      expect(dist(p)).toBeCloseTo(PATH_FAR, 5);
      expect(p.target[0]).toBeCloseTo(-1.5, 5);
      expect(p.target[2]).toBeCloseTo(4.5, 5);
    }
  });

  it("zooms in to the near distance halfway and stays inside the play camera limits", () => {
    expect(dist(cameraPose(0.5, bounds))).toBeCloseTo(PATH_NEAR, 5);
    for (let i = 0; i <= 200; i++) {
      const p = cameraPose(i / 200, bounds);
      const d = dist(p);
      expect(d).toBeGreaterThanOrEqual(PATH_NEAR - 1e-6);
      expect(d).toBeLessThanOrEqual(PATH_FAR + 1e-6);
      const polar = Math.acos((p.position[1] - p.target[1]) / d);
      expect(polar).toBeLessThanOrEqual(Math.PI * 0.15 + 1e-9);
      expect(p.target[0]).toBeGreaterThanOrEqual(bounds.minX);
      expect(p.target[0]).toBeLessThanOrEqual(bounds.maxX);
      expect(p.target[2]).toBeGreaterThanOrEqual(bounds.minZ);
      expect(p.target[2]).toBeLessThanOrEqual(bounds.maxZ);
    }
  });
});
