import { describe, expect, it } from "vitest";
import {
  getEffectsProfile,
  getLightingProfile,
  getRenderProfileForCameraMode,
} from "../src/core/render-profiles";

describe("render profiles", () => {
  it("maps camera mode to render profile", () => {
    expect(getRenderProfileForCameraMode("play")).toBe("play");
    expect(getRenderProfileForCameraMode("showcase")).toBe("showcase");
  });

  it("uses stronger post-processing in showcase than play", () => {
    const play = getEffectsProfile("play");
    const showcase = getEffectsProfile("showcase");
    const cinematic = getEffectsProfile("showcaseCinematic");

    expect(showcase.bloom.strength).toBeGreaterThan(play.bloom.strength);
    expect(showcase.ssao.enabled).toBe(false);
    expect(play.ssao.enabled).toBe(false);
    expect(cinematic.ssao.enabled).toBe(true);
  });

  it("uses brighter exposure and denser atmosphere in showcase than play", () => {
    const play = getLightingProfile("play");
    const showcase = getLightingProfile("showcase");

    expect(showcase.exposure).toBeGreaterThan(play.exposure);
    expect(showcase.fogDensity).toBeGreaterThan(play.fogDensity);
  });
});
