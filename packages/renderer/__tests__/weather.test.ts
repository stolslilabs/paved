import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { AmbientLoop } from "../src/core/ambient-loop";
import { createSnowUniforms } from "../src/core/snow-shader";
import { TileRenderer } from "../src/core/TileRenderer";
import { Weather, gradeOf } from "../src/core/weather";
import {
  DEFAULT_WEATHER_SETTINGS,
  PARTICLE_MAX,
  resolveWeatherSettings,
  weatherCloudFactor,
  weatherMode,
  type WeatherSettings,
} from "../src/core/weather-settings";

/** A summer's, an autumn's... noon and night (`position`: 0 a dawn; the day is 0.625 of a cycle). */
const noon = (season: "summer" | "autumn" | "winter" | "spring") => ({ season, position: 0.3125 });
const night = (season: "summer" | "autumn" | "winter" | "spring") => ({ season, position: 0.8 });

function weatherOf(settings: WeatherSettings = DEFAULT_WEATHER_SETTINGS) {
  const time = { value: 0 };
  const snow = createSnowUniforms();
  const weather = new Weather(time, snow, settings);
  return { weather, snow, time };
}

describe("the weather (#607 PR 2): the settings", () => {
  it("are subtle by default: a light rain and snow, grades of a fifth at most, faint shafts", () => {
    const d = DEFAULT_WEATHER_SETTINGS;
    expect(d.autumn.rain.density).toBeLessThanOrEqual(0.4);
    expect(d.winter.snow.density).toBeLessThanOrEqual(0.4);
    for (const season of ["summer", "autumn", "winter", "spring"] as const) expect(d[season].grade.amount).toBeLessThanOrEqual(0.25);
    expect(d.spring.rays.opacity).toBeLessThanOrEqual(0.15);
    expect(d.summer.shimmer).toBeLessThanOrEqual(0.02);
  });

  it("take the fields given over the base, and keep the base's for a value of the wrong kind or out of range", () => {
    const s = resolveWeatherSettings({ area: 2, autumn: { rain: { density: 0.8, opacity: 3 } }, winter: { cover: 1 }, summer: { grade: { color: "orange" } } });
    expect(s.area).toBe(DEFAULT_WEATHER_SETTINGS.area);
    expect(s.autumn.rain.density).toBe(0.8);
    expect(s.autumn.rain.opacity).toBe(DEFAULT_WEATHER_SETTINGS.autumn.rain.opacity);
    expect(s.autumn.leaves).toEqual(DEFAULT_WEATHER_SETTINGS.autumn.leaves);
    expect(s.winter.cover).toBe(1);
    expect(s.summer.grade.color).toBe(DEFAULT_WEATHER_SETTINGS.summer.grade.color);
    expect(resolveWeatherSettings({ enabled: "yes" as never })).toEqual(DEFAULT_WEATHER_SETTINGS);
  });

  it("are off on the Low tier and with the ambient effects off; under reduced motion only the static parts show", () => {
    const ambient = { enabled: true, reducedMotion: "auto" as const };
    expect(weatherMode({ enabled: true }, ambient, "medium", false)).toBe("moving");
    expect(weatherMode({ enabled: true }, ambient, "low", false)).toBe("off");
    expect(weatherMode({ enabled: true }, { ...ambient, enabled: false }, "high", false)).toBe("off");
    expect(weatherMode({ enabled: false }, ambient, "high", false)).toBe("off");
    expect(weatherMode({ enabled: true }, ambient, "medium", true)).toBe("still");
    expect(weatherMode({ enabled: true }, { ...ambient, reducedMotion: true }, "medium", false)).toBe("still");
    expect(weatherMode({ enabled: true }, { ...ambient, reducedMotion: false }, "medium", true)).toBe("moving");
  });

  it("brings more clouds in autumn only", () => {
    const s = DEFAULT_WEATHER_SETTINGS;
    expect(weatherCloudFactor(s, "autumn")).toBe(s.autumn.clouds);
    expect(s.autumn.clouds).toBeGreaterThan(1);
    expect(weatherCloudFactor(s, "summer")).toBe(1);
    expect(weatherCloudFactor(s, null)).toBe(1);
    expect(weatherCloudFactor({ ...s, enabled: false }, "autumn")).toBe(1);
  });
});

describe("the weather: what each season draws", () => {
  it("draws each season's own: summer the grade and glare, autumn rain and leaves, winter snow and cover, spring rays and petals", () => {
    const { weather, snow } = weatherOf();
    weather.setMode("moving");
    weather.setCycle(noon("summer"));
    let s = weather.stats();
    expect(s.particles).toEqual({ rain: 0, leaves: 0, snow: 0, petals: 0 });
    expect([s.rays, s.cover]).toEqual([0, 0]);
    expect(s.drawCalls).toBe(1);

    weather.setCycle(noon("autumn"));
    // A change while the weather moves fades in on the loop: snap it by stepping past the fade.
    for (let t = 0; t <= 10; t += 0.1) weather.step(t);
    s = weather.stats();
    expect(s.particles.rain).toBe(Math.round(DEFAULT_WEATHER_SETTINGS.autumn.rain.density * PARTICLE_MAX.rain));
    expect(s.particles.leaves).toBeGreaterThan(0);
    expect(s.splashes).toBeGreaterThan(0);
    expect(s.particles.snow).toBe(0);

    weather.setCycle(noon("winter"));
    for (let t = 10; t <= 20; t += 0.1) weather.step(t);
    s = weather.stats();
    expect(s.particles.snow).toBeGreaterThan(0);
    expect(s.particles.rain).toBe(0);
    expect(snow.uSnowCover.value).toBeCloseTo(DEFAULT_WEATHER_SETTINGS.winter.cover);

    weather.setCycle(noon("spring"));
    for (let t = 20; t <= 30; t += 0.1) weather.step(t);
    s = weather.stats();
    expect(s.rays).toBeGreaterThan(0);
    expect(s.particles.petals).toBeGreaterThan(0);
    expect(snow.uSnowCover.value).toBe(0);
    weather.dispose();
  });

  it("fades one season into the next over `fadeSeconds` while it moves, and asks for frames while it does", () => {
    const { weather } = weatherOf();
    weather.setMode("moving");
    weather.setCycle(noon("summer"));
    weather.setCycle(noon("autumn"));
    weather.step(0);
    expect(weather.step(1.5)).toBe(true);
    const { presence } = weather.stats();
    // 0.1 s a step at most: the steps of 1.5 s move it by a share of 0.1 / fadeSeconds.
    expect(presence.autumn).toBeCloseTo(0.1 / DEFAULT_WEATHER_SETTINGS.fadeSeconds);
    expect(presence.summer).toBeCloseTo(1 - 0.1 / DEFAULT_WEATHER_SETTINGS.fadeSeconds);
    weather.dispose();
  });

  it("under reduced motion, nothing falls: the grades, the glare, the rays held and the snow on the tops stay; no frame is asked", () => {
    const { weather, snow } = weatherOf();
    weather.setMode("still");
    weather.setCycle(noon("winter"));
    expect(weather.stats().particles.snow).toBe(0);
    expect(snow.uSnowCover.value).toBeCloseTo(DEFAULT_WEATHER_SETTINGS.winter.cover);
    expect(weather.step(1)).toBe(false);
    weather.setCycle(noon("autumn"));
    expect(weather.stats()).toMatchObject({ particles: { rain: 0, leaves: 0 }, splashes: 0, drawCalls: 1 });
    expect(snow.uSnowCover.value).toBe(0);
    weather.setCycle(noon("spring"));
    expect(weather.stats().rays).toBeGreaterThan(0);
    expect(weather.stats().particles.petals).toBe(0);
    weather.dispose();
  });

  it("draws nothing when off (the Low tier, the effects off) and leaves the tiles' snow at 0", () => {
    const { weather, snow } = weatherOf();
    weather.setMode("moving");
    weather.setCycle(noon("winter"));
    expect(snow.uSnowCover.value).toBeGreaterThan(0);
    weather.setMode("off");
    expect(weather.stats().drawCalls).toBe(0);
    expect(snow.uSnowCover.value).toBe(0);
    expect(weather.step(1)).toBe(false);
    weather.dispose();
  });

  it("at night the glare, the rays and the grades go with the sun; the snow still falls, dimmer", () => {
    const { weather } = weatherOf();
    weather.setMode("moving");
    weather.setCycle(night("spring"));
    expect(weather.stats()).toMatchObject({ daylight: 0, rays: 0, drawCalls: 1 });
    weather.setCycle(night("winter"));
    weather.step(0);
    for (let t = 0; t <= 10; t += 0.1) weather.step(t);
    expect(weather.stats().particles.snow).toBeGreaterThan(0);
    weather.setCycle(night("summer"));
    for (let t = 10; t <= 20; t += 0.1) weather.step(t);
    expect(weather.stats().drawCalls).toBe(0);
    weather.dispose();
  });

  it("each layer can be turned off, and a season as a whole", () => {
    const settings = resolveWeatherSettings({ autumn: { rain: { enabled: false } }, winter: { enabled: false } });
    const { weather, snow } = weatherOf(settings);
    weather.setMode("moving");
    weather.setCycle(noon("autumn"));
    expect(weather.stats()).toMatchObject({ particles: { rain: 0 }, splashes: 0 });
    expect(weather.stats().particles.leaves).toBeGreaterThan(0);
    weather.setMode("still");
    weather.setCycle(noon("winter"));
    expect(weather.stats().drawCalls).toBe(0);
    expect(snow.uSnowCover.value).toBe(0);
    weather.dispose();
  });

  it("steps on the one ambient loop and asks for a frame only while something moves", () => {
    const loop = new AmbientLoop();
    const weather = new Weather(loop.time, createSnowUniforms(), DEFAULT_WEATHER_SETTINGS);
    loop.register(weather);
    loop.setEnabled(true);
    weather.setMode("moving");
    weather.setCycle(noon("autumn"));
    expect(loop.tick(0)).toBe(true);
    expect(loop.tick(40)).toBe(true);
    weather.setCycle(noon("summer"));
    const summer = resolveWeatherSettings({ summer: { shimmer: 0 } });
    weather.setSettings(summer);
    for (let t = 80; t < 5000; t += 40) loop.tick(t);
    // Summer with no shimmer: a still grade and glare, no frame of its own.
    expect(loop.tick(5040)).toBe(false);
    loop.dispose();
    weather.dispose();
  });

  it("a season turned off (or on) shows at once while nothing steps: under reduced motion and off", () => {
    const { weather } = weatherOf();
    weather.setMode("still");
    weather.setCycle(noon("spring"));
    expect(weather.stats()).toMatchObject({ presence: { spring: 1 }, drawCalls: 1 });
    expect(weather.stats().rays).toBeGreaterThan(0);
    weather.setSettings(resolveWeatherSettings({ spring: { enabled: false } }));
    expect(weather.stats()).toMatchObject({ presence: { spring: 0 }, rays: 0, drawCalls: 0 });
    weather.setSettings(DEFAULT_WEATHER_SETTINGS);
    expect(weather.stats()).toMatchObject({ presence: { spring: 1 }, drawCalls: 1 });
    weather.dispose();
  });

  it("the shimmer runs at its speed, and a speed of 0 stops it (no shimmer, no frame of its own)", () => {
    const { weather } = weatherOf(resolveWeatherSettings({ summer: { shimmerSpeed: 2.5 } }));
    const overlay = weather.object.children.find((c) => c.name === "weather-grade") as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
    weather.setMode("moving");
    weather.setCycle(noon("summer"));
    expect(overlay.material.uniforms.uShimmerSpeed!.value).toBe(2.5);
    expect(overlay.material.uniforms.uShimmer!.value).toBeGreaterThan(0);
    expect(overlay.material.fragmentShader).toContain("uTime * uShimmerSpeed");
    expect(weather.step(1)).toBe(true);
    weather.setSettings(resolveWeatherSettings({ summer: { shimmerSpeed: 0 } }));
    expect(overlay.material.uniforms.uShimmer!.value).toBe(0);
    expect(weather.step(2)).toBe(false);
    weather.dispose();
  });

  it("calls onChange on every change, and dispose frees what it made and turns the snow off", () => {
    const { weather, snow } = weatherOf();
    const onChange = vi.fn();
    weather.onChange = onChange;
    weather.setMode("still");
    weather.setCycle(noon("winter"));
    expect(onChange).toHaveBeenCalledTimes(2);
    const disposed: string[] = [];
    weather.object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.addEventListener("dispose", () => disposed.push(`${child.name} geometry`));
        (child.material as THREE.Material).addEventListener("dispose", () => disposed.push(`${child.name} material`));
      }
    });
    const parent = new THREE.Group().add(weather.object);
    weather.dispose();
    weather.dispose();
    expect(disposed).toHaveLength(12);
    expect(parent.children).toHaveLength(0);
    expect(snow.uSnowCover.value).toBe(0);
  });

  it("a grade is white at no share and its colour, mixed by its amount, at full share", () => {
    expect(gradeOf({ color: "#ff0000", amount: 1 }, 0).getHex()).toBe(0xffffff);
    expect(gradeOf({ color: "#ff0000", amount: 1 }, 1).getHex()).toBe(0xff0000);
    const half = gradeOf({ color: "#000000", amount: 0.5 }, 1);
    expect(half.r).toBeCloseTo(0.5);
  });
});

describe("the weather: the snow on the tiles' tops (the tile shader)", () => {
  it("whitens the faces up after the normal is known, through shared uniforms, off at 0", () => {
    const tiles = new TileRenderer({} as never);
    const material = new THREE.MeshStandardMaterial();
    (tiles as any).patchTileShader(material, new THREE.BoxGeometry());
    const shader = { uniforms: {}, fragmentShader: THREE.ShaderLib.standard.fragmentShader, vertexShader: THREE.ShaderLib.standard.vertexShader } as never;
    material.onBeforeCompile(shader, {} as never);
    const { uniforms, fragmentShader } = shader as { uniforms: Record<string, { value: unknown }>; fragmentShader: string };
    expect(uniforms.uSnowCover).toBe(tiles.snowUniforms.uSnowCover);
    expect(tiles.snowUniforms.uSnowCover.value).toBe(0);
    expect(fragmentShader).toContain("if (uSnowCover <= 0.0) return 0.0;");
    const applied = fragmentShader.indexOf("snowOn(normal)");
    expect(applied).toBeGreaterThan(fragmentShader.indexOf("#include <normal_fragment_maps>"));
    expect(applied).toBeLessThan(fragmentShader.indexOf("#include <lights_physical_fragment>"));
    tiles.dispose();
  });
});
