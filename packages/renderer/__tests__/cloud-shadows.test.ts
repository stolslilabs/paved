import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { DEFAULT_AMBIENT_SETTINGS, DEFAULT_CLOUD_SHADOWS, resolveAmbientSettings } from "../src/core/ambient-settings";
import { CLOUD_FRAGMENT_GLSL, cloudLightsFragment, createCloudUniforms } from "../src/core/cloud-shader";
import { CLOUD_MAP_SIZE, CLOUD_MIN_MOVE, CloudShadows, cloudEdges, cloudNoise, noiseQuantiles, windOf } from "../src/core/cloud-shadows";

describe("cloud shadows (#573): the settings", () => {
  it("are on under the ambient switch, light (15 to 25 % of the sun) and with no visible wisps by default", () => {
    expect(DEFAULT_AMBIENT_SETTINGS.clouds).toBe(DEFAULT_CLOUD_SHADOWS);
    expect(DEFAULT_CLOUD_SHADOWS.enabled).toBe(true);
    expect(DEFAULT_CLOUD_SHADOWS.darkness).toBeGreaterThanOrEqual(0.15);
    expect(DEFAULT_CLOUD_SHADOWS.darkness).toBeLessThanOrEqual(0.25);
    expect(DEFAULT_CLOUD_SHADOWS.wisps).toBe(0);
    expect(DEFAULT_CLOUD_SHADOWS.moon).toBe(0);
  });

  it("take the fields given over the base, and keep the base's for a value out of range", () => {
    const s = resolveAmbientSettings({ clouds: { coverage: 2, darkness: -1, scale: 0, windDirection: 200, seasonCoverage: { winter: 2 } } }).clouds;
    expect(s.coverage).toBe(1);
    expect(s.darkness).toBe(DEFAULT_CLOUD_SHADOWS.darkness);
    expect(s.scale).toBe(DEFAULT_CLOUD_SHADOWS.scale);
    expect(s.windDirection).toBe(200);
    expect(s.seasonCoverage).toEqual({ ...DEFAULT_CLOUD_SHADOWS.seasonCoverage, winter: 2 });
    expect(resolveAmbientSettings({ clouds: { enabled: "no" as never } }).clouds).toEqual(DEFAULT_CLOUD_SHADOWS);
  });
});

describe("cloud shadows: the tile shader's term", () => {
  it("hooks the shadow-casting directional lights (the sun) at full darkness and the others by the moon's share", () => {
    const chunk = cloudLightsFragment();
    expect(chunk).not.toBe(THREE.ShaderChunk.lights_fragment_begin);
    expect(chunk.match(/cloudLight\(/g)).toHaveLength(2);
    expect(chunk).toContain("cloudLight( directionalLight.direction, 1.0 )");
    expect(chunk).toContain("uCloudMoon * uNightOn * uNightLevel");
    // Inside the directional lights' loop, after the sun's shadow and before its light is added.
    const loop = chunk.slice(chunk.indexOf("NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )"));
    expect(loop.indexOf("getShadow( directionalShadowMap")).toBeLessThan(loop.indexOf("cloudLight("));
    expect(loop.indexOf("cloudLight(")).toBeLessThan(loop.indexOf("RE_Direct("));
    // The ambient, sky (hemisphere) and point lights are not touched.
    const before = chunk.slice(0, chunk.indexOf("NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )"));
    expect(before).not.toContain("cloudLight");
    expect(() => cloudLightsFragment("void main() {}")).toThrow(/sun shadow line/);
  });

  it("returns before reading the map while the darkness is 0 (the default, before the chunk is in)", () => {
    expect(CLOUD_FRAGMENT_GLSL).toMatch(/if \(uCloudDark \* strength <= 0\.0\) return 1\.0;/);
    expect(createCloudUniforms().uCloudDark.value).toBe(0);
  });
});

describe("cloud shadows: the cloud map", () => {
  const noise = cloudNoise(64);

  it("is a soft noise from 0 to 1, the same on every load, that tiles with no seam", () => {
    expect(Math.min(...noise)).toBe(0);
    expect(Math.max(...noise)).toBe(1);
    expect(cloudNoise(64)).toEqual(noise);
    const at = (x: number, y: number) => noise[y * 64 + x]!;
    let inner = 0;
    let seam = 0;
    for (let y = 0; y < 64; y++) {
      inner = Math.max(inner, Math.abs(at(31, y) - at(32, y)));
      seam = Math.max(seam, Math.abs(at(63, y) - at(0, y)), Math.abs(at(y, 63) - at(y, 0)));
    }
    // Across the wrap, no larger a step than inside the map: no seam.
    expect(seam).toBeLessThanOrEqual(inner * 1.5);
    expect(inner).toBeLessThan(0.2);
  });

  it("covers the share of the map the coverage says, with the edge's width the softness says", () => {
    const table = noiseQuantiles(noise);
    for (const coverage of [0.2, 0.4, 0.7]) {
      const [low, high] = cloudEdges(table, coverage, 0);
      const middle = (low + high) / 2;
      const share = noise.filter((v) => v > middle).length / noise.length;
      expect(share).toBeCloseTo(coverage, 1);
    }
    const [low, high] = cloudEdges(table, 0.4, 0.5);
    const inEdge = noise.filter((v) => v > low && v < high).length / noise.length;
    expect(inEdge).toBeCloseTo(0.5, 1);
  });

  it("drifts along the wind's direction in degrees", () => {
    expect(windOf(0)[0]).toBeCloseTo(1);
    expect(windOf(90)[1]).toBeCloseTo(1);
  });
});

describe("cloud shadows: the effect", () => {
  const make = (settings = DEFAULT_CLOUD_SHADOWS) => {
    const uniforms = createCloudUniforms();
    const clouds = new CloudShadows(uniforms, settings);
    return { uniforms, clouds };
  };

  it("sets nothing on the light until it is active, and steps no frame", () => {
    const { uniforms, clouds } = make();
    expect(uniforms.uCloudMap.value.image.width).toBe(CLOUD_MAP_SIZE);
    expect(uniforms.uCloudDark.value).toBe(0);
    expect(clouds.step(10)).toBe(false);
    clouds.setActive(true);
    expect(uniforms.uCloudDark.value).toBe(DEFAULT_CLOUD_SHADOWS.darkness);
    expect(uniforms.uCloudHeight.value).toBe(DEFAULT_CLOUD_SHADOWS.height);
    expect(uniforms.uCloudScale.value).toBeCloseTo(1 / DEFAULT_CLOUD_SHADOWS.scale);
  });

  it("asks for a frame once the clouds moved a quarter of a voxel, and moves the map against the wind", () => {
    const { uniforms, clouds } = make({ ...DEFAULT_CLOUD_SHADOWS, windDirection: 0, windSpeed: 1 });
    clouds.setActive(true);
    expect(clouds.step(0)).toBe(true);
    expect(clouds.step(CLOUD_MIN_MOVE / 2)).toBe(false);
    expect(clouds.step(CLOUD_MIN_MOVE * 1.01)).toBe(true);
    const x = uniforms.uCloudOffset.value.x;
    expect(clouds.step(1)).toBe(true);
    // One world unit of wind along +x: the map's offset goes back by 1 / scale (wrapped to one period).
    const moved = (x - uniforms.uCloudOffset.value.x + 1) % 1;
    expect(moved).toBeCloseTo(1 / DEFAULT_CLOUD_SHADOWS.scale - CLOUD_MIN_MOVE * 1.01 / DEFAULT_CLOUD_SHADOWS.scale, 5);
    expect(uniforms.uCloudOffset.value.y).toBe(0);
  });

  it("scales the coverage by the season while the cycle draws the board, and asks for a frame on a change", () => {
    const { clouds } = make();
    const onChange = vi.fn();
    clouds.onChange = onChange;
    clouds.setActive(true);
    expect(clouds.coverage()).toBeCloseTo(0.4);
    clouds.setSeason("winter");
    expect(clouds.coverage()).toBeCloseTo(0.4 * DEFAULT_CLOUD_SHADOWS.seasonCoverage.winter);
    clouds.setSeason(null);
    expect(clouds.coverage()).toBeCloseTo(0.4);
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it("is off with no coverage or no darkness; shows the wisps only when asked", () => {
    const { uniforms, clouds } = make();
    clouds.setActive(true);
    expect(clouds.object.visible).toBe(false);
    clouds.setSettings({ ...DEFAULT_CLOUD_SHADOWS, coverage: 0 });
    expect(uniforms.uCloudDark.value).toBe(0);
    expect(clouds.step(5)).toBe(false);
    clouds.setSettings({ ...DEFAULT_CLOUD_SHADOWS, wisps: 0.2 });
    expect(clouds.object.visible).toBe(true);
    expect(clouds.object.position.y).toBe(DEFAULT_CLOUD_SHADOWS.height);
    expect(clouds.object.castShadow).toBe(false);
  });

  it("disposes its map, wisps and material, and gives the term back its clear map", () => {
    const { uniforms, clouds } = make();
    const clear = createCloudUniforms().uCloudMap.value;
    const texture = uniforms.uCloudMap.value;
    const disposed = vi.fn();
    texture.addEventListener("dispose", disposed);
    clouds.setActive(true);
    clouds.dispose();
    expect(disposed).toHaveBeenCalledOnce();
    expect(uniforms.uCloudDark.value).toBe(0);
    expect(uniforms.uCloudMap.value).toBe(clear);
  });
});
