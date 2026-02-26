import { describe, expect, it } from "vitest";
import {
  getEffectsProfile,
  resolveEffectsProfile,
} from "../src/core/render-profiles";

describe("effects profile fallback", () => {
  it("returns base profile when capabilities are fully supported", () => {
    const base = getEffectsProfile("showcaseCinematic");
    const resolved = resolveEffectsProfile("showcaseCinematic", {
      supportsBloom: true,
      supportsVignette: true,
      supportsSSAO: true,
      lowPowerDevice: false,
    });

    expect(resolved).toEqual(base);
  });

  it("disables unsupported effects", () => {
    const resolved = resolveEffectsProfile("showcaseCinematic", {
      supportsBloom: false,
      supportsVignette: false,
      supportsSSAO: false,
      lowPowerDevice: false,
    });

    expect(resolved.ssao.enabled).toBe(false);
    expect(resolved.bloom.strength).toBe(0);
    expect(resolved.vignette.darkness).toBe(0);
  });

  it("reduces heavy effects on low-power devices", () => {
    const base = getEffectsProfile("showcaseCinematic");
    const resolved = resolveEffectsProfile("showcaseCinematic", {
      supportsBloom: true,
      supportsVignette: true,
      supportsSSAO: true,
      lowPowerDevice: true,
    });

    expect(resolved.ssao.enabled).toBe(false);
    expect(resolved.bloom.strength).toBeLessThan(base.bloom.strength);
    expect(resolved.vignette.darkness).toBeLessThan(base.vignette.darkness);
  });
});
