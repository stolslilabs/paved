import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  DAY_SHARE,
  DayNightClock,
  HOLDS,
  KEYFRAMES,
  START_POSITION,
  SHADOW_STEP,
  cycleAt,
  dayNightFrame,
  drawDayNight,
  releaseDayNight,
  hexToLinear,
  momentOf,
  linearToOklab,
  oklabToLinear,
  pageCycleTime,
  seasonsAt,
  seededSeason,
  startSeason,
  sunAt,
} from "../src/core/daynight";
import { DAY_PHASES, DAY_PHASE_AT, DEFAULT_DAYNIGHT_SETTINGS, DEFAULT_WINDOW_LIGHT, SEASONS, resolveDayNightSettings, resolveWindowLight } from "../src/core/daynight-settings";
import { resolveRendererSettings } from "../src/core/settings";
import { Effects } from "../src/core/Effects";
import { LOOK_PRESETS } from "../src/core/look";

const CYCLE_MS = DEFAULT_DAYNIGHT_SETTINGS.cycleMs;

describe("the cycle's clock (DAYNIGHT)", () => {
  it("is two minutes: about 75 s of day with its dawn and dusk, then 45 s of night", () => {
    expect(CYCLE_MS).toBe(120_000);
    expect(DAY_SHARE * CYCLE_MS).toBe(75_000);
    expect((1 - DAY_SHARE) * CYCLE_MS).toBe(45_000);
    // The sun is up exactly while the day lasts: up through the day, down through the night.
    for (let i = 1; i < 1000; i++) {
      const position = i / 1000;
      const { elevation } = sunAt("summer", position);
      if (position < DAY_SHARE) expect(elevation).toBeGreaterThan(0);
      else expect(elevation).toBe(0);
    }
    // Dawn, day and dusk hold within the day, the night after the sun has set.
    const [dawn, day, dusk, night] = HOLDS;
    expect(dawn[2]).toBeLessThan(day[1]);
    expect(dusk[2]).toBeLessThan(DAY_SHARE);
    expect(night[1]).toBeGreaterThan(DAY_SHARE);
  });

  it("runs the seasons in order, one cycle each, and wraps round", () => {
    const seasons = [0.3, 1.3, 2.3, 3.3, 4.3, -0.7].map((s) => cycleAt(s).season);
    expect(seasons).toEqual(["summer", "autumn", "winter", "spring", "summer", "spring"]);
    // A night eases into the next season's dawn.
    const late = cycleAt(0.97);
    expect(late.from).toEqual({ season: "summer", phase: "night" });
    expect(late.to).toEqual({ season: "autumn", phase: "dawn" });
    expect(cycleAt(3.97).to.season).toBe("summer");
  });

  it("reads each phase at its moment, and holds it there", () => {
    for (const season of SEASONS) {
      for (const phase of DAY_PHASES) {
        const point = cycleAt(SEASONS.indexOf(season) + DAY_PHASE_AT[phase]);
        expect(point).toMatchObject({ season, phase, blend: 0, from: { season, phase }, to: { season, phase } });
      }
    }
    // Between two holds it blends from one to the next, smoothly from 0 to 1.
    const between = [0.05, 0.08, 0.11].map((p) => cycleAt(p));
    expect(between.map((p) => [p.from.phase, p.to.phase])).toEqual([["dawn", "day"], ["dawn", "day"], ["dawn", "day"]]);
    expect(between[0].blend).toBeLessThan(between[1].blend);
    expect(between[1].blend).toBeLessThan(between[2].blend);
  });

  it("starts from a random season, the same for a seed, and the named one when named", () => {
    expect(seededSeason(42)).toBe(seededSeason(42));
    expect(startSeason("random", 7)).toBe(seededSeason(7));
    expect(startSeason("winter", 7)).toBe("winter");
    // Without a seed, once per page: every call gives the same.
    expect(startSeason("random", null)).toBe(startSeason("random", null));
    const drawn = new Set(Array.from({ length: 64 }, (_, seed) => seededSeason(seed)));
    expect([...drawn].sort()).toEqual([...SEASONS].sort());
  });

  it("moves at its speed, in steps of frameMs, carrying on from where it is when the speed changes", () => {
    const clock = new DayNightClock(1000, 500);
    expect(clock.advance(1000, 1, 33)).toBe(true);
    expect(clock.time).toBe(500);
    // Within one step of 33 ms nothing moves.
    expect(clock.advance(1010, 1, 33)).toBe(false);
    expect(clock.time).toBe(500);
    expect(clock.advance(1100, 1, 33)).toBe(true);
    expect(clock.time).toBe(600);
    // Ten times as fast from here on.
    expect(clock.advance(1200, 10, 33)).toBe(true);
    expect(clock.time).toBe(1600);
    // A whole cycle at x10 takes 12 s.
    const fast = new DayNightClock(0);
    fast.advance(0, 10, 33);
    fast.advance(12_000, 10, 33);
    expect(seasonsAt(fast.time, CYCLE_MS, "autumn")).toBeCloseTo(2, 9);
  });

  it("opens a page's board in daylight, and keeps the page's time for a board opened later", () => {
    expect(cycleAt(seasonsAt(pageCycleTime(-1, CYCLE_MS), CYCLE_MS, "summer")).phase).toBe("day");
    expect(START_POSITION).toBe(HOLDS[1][1]);
    expect(pageCycleTime(10_000_000, CYCLE_MS) - pageCycleTime(9_000_000, CYCLE_MS)).toBe(1_000_000);
  });
});

describe("the cycle's frames", () => {
  it("blends in OKLab: a colour goes there and back", () => {
    for (const hex of ["#1f65a1", "#f85e4d", "#0a141c", "#95dc94"]) {
      const back = oklabToLinear(linearToOklab(hexToLinear(hex)));
      hexToLinear(hex).forEach((c, i) => expect(back[i]).toBeCloseTo(c, 5));
    }
  });

  it("moves smoothly over four seasons: no jump in the backdrop, the lights or the sun while it shines", () => {
    const steps = 4 * 4000;
    let previous = dayNightFrame(0, 0.5);
    let worstBackdrop = 0;
    let worstLight = 0;
    for (let i = 1; i <= steps; i++) {
      const frame = dayNightFrame((4 * i) / steps, 0.5);
      for (const end of ["top", "bottom"] as const) {
        worstBackdrop = Math.max(worstBackdrop, Math.hypot(...frame.backdrop[end].map((v, k) => v - previous.backdrop[end][k])));
      }
      worstLight = Math.max(worstLight, Math.abs(frame.sun.intensity - previous.sun.intensity), Math.abs(frame.lights - previous.lights), Math.abs(frame.sky.intensity - previous.sky.intensity));
      // The sun's direction jumps only where it does not shine (the night: it rises in the east at dawn).
      const turn = Math.acos(Math.min(1, frame.sun.direction.reduce((sum, v, k) => sum + v * previous.sun.direction[k], 0)));
      if (turn > 0.01) expect(Math.max(frame.sun.intensity, previous.sun.intensity)).toBe(0);
      previous = frame;
    }
    // At 4000 steps a cycle (30 ms each), under a hundredth of OKLab's lightness and five hundredths of a light's strength (the sun rising).
    expect(worstBackdrop).toBeLessThan(0.01);
    expect(worstLight).toBeLessThan(0.05);
  });

  it("rises in the east, passes the south at noon and sets in the west, higher in summer than in winter", () => {
    const rise = sunAt("summer", 0.001);
    const noon = sunAt("summer", DAY_SHARE / 2);
    const set = sunAt("summer", DAY_SHARE - 0.001);
    expect(rise.azimuth).toBeCloseTo(90, 0);
    expect(noon.azimuth).toBeCloseTo(0, 6);
    expect(set.azimuth).toBeCloseTo(-90, 0);
    expect(noon.up).toBe(1);
    expect(sunAt("winter", DAY_SHARE / 2).elevation).toBeLessThan(noon.elevation);
  });

  it("lights the cities at night and not by day, and keeps the night's floor", () => {
    for (const season of SEASONS) {
      const s = SEASONS.indexOf(season);
      expect(dayNightFrame(s + DAY_PHASE_AT.day).lights).toBe(0);
      expect(dayNightFrame(s + DAY_PHASE_AT.night).lights).toBe(1);
      const night = dayNightFrame(s + DAY_PHASE_AT.night, 0.5);
      expect(night.sun.intensity).toBe(0);
      expect(night.sky.intensity).toBeGreaterThanOrEqual(0.5 * KEYFRAMES[season].day.skyIntensity);
      expect(night.sky.ambient).toBeGreaterThanOrEqual(0.5 * KEYFRAMES[season].day.ambient);
    }
  });

  it("paints the backdrop with the app's Tailwind tokens", () => {
    const theme = readFileSync(fileURLToPath(new URL("../../app/src/styles/theme.css", import.meta.url)), "utf8");
    const tokens = new Set([...theme.matchAll(/--color-[a-z]+-\d+: oklch\([^)]*\); \/\* (#[0-9A-F]{6}) \*\//g)].map((m) => m[1].toLowerCase()));
    expect(tokens.size).toBeGreaterThan(50);
    for (const season of SEASONS) {
      for (const phase of DAY_PHASES) {
        const { top, bottom } = KEYFRAMES[season][phase];
        expect(tokens.has(top), `${season} ${phase} top ${top}`).toBe(true);
        expect(tokens.has(bottom), `${season} ${phase} bottom ${bottom}`).toBe(true);
      }
    }
  });
});

describe("the cycle's settings", () => {
  it("are off in the renderer by default, and keep the base's value for one of the wrong kind", () => {
    expect(resolveRendererSettings().dayNight).toEqual(DEFAULT_DAYNIGHT_SETTINGS);
    expect(DEFAULT_DAYNIGHT_SETTINGS.enabled).toBe(false);
    const set = resolveDayNightSettings({ enabled: true, speed: 10, season: "winter", seed: 3, freezeAt: 1.5, cycleMs: -1, brightnessFloor: 4 });
    expect(set).toMatchObject({ enabled: true, speed: 10, season: "winter", seed: 3, freezeAt: 1.5, cycleMs: 120_000, brightnessFloor: 0.85 });
    expect(resolveDayNightSettings({ season: "monsoon" as never, reducedMotion: "sometimes" as never })).toMatchObject({ season: "random", reducedMotion: "auto" });
    expect(resolveRendererSettings({ dayNight: { enabled: true } }).dayNight.enabled).toBe(true);
  });
});

describe("the night lights' source (NIGHT-WINDOWS, #513)", () => {
  it("is the columns by default, so the board is unchanged, and takes only a known source", () => {
    expect(DEFAULT_DAYNIGHT_SETTINGS.lights).toBe("columns");
    expect(resolveRendererSettings().dayNight.lights).toBe("columns");
    expect(resolveDayNightSettings({ lights: "windows" }).lights).toBe("windows");
    expect(resolveDayNightSettings({ lights: "lasers" as never }).lights).toBe("columns");
    expect(resolveDayNightSettings({ enabled: true }, resolveDayNightSettings({ lights: "windows" })).lights).toBe("windows");
  });

  it("#571: the windows' own light, stronger and longer than the first pass's, set field by field; the columns' unchanged", () => {
    expect(DEFAULT_WINDOW_LIGHT).toEqual({ intensity: 1, reach: 10, falloff: 1.2, margin: 8, stagger: 1, rule: "structures" });
    expect(DEFAULT_DAYNIGHT_SETTINGS.windowLight).toEqual(DEFAULT_WINDOW_LIGHT);
    expect(DEFAULT_DAYNIGHT_SETTINGS.nightLightIntensity).toBe(0.4);
    expect(resolveDayNightSettings({ windowLight: { margin: 0 } }).windowLight).toEqual({ ...DEFAULT_WINDOW_LIGHT, margin: 0 });
    expect(resolveWindowLight({ intensity: -1, reach: 0, falloff: Number.NaN, margin: 99, stagger: 0, rule: "lasers" as never })).toEqual(DEFAULT_WINDOW_LIGHT);
    expect(resolveWindowLight({ margin: 3.6, rule: "columns" })).toMatchObject({ margin: 4, rule: "columns" });
    // A later partial keeps what an earlier one set.
    expect(resolveDayNightSettings({ enabled: true }, resolveDayNightSettings({ windowLight: { reach: 14 } })).windowLight.reach).toBe(14);
  });
});

describe("drawing the cycle (drawDayNight)", () => {
  function target() {
    const scene = new THREE.Scene();
    const key = new THREE.DirectionalLight();
    key.castShadow = true;
    key.shadow.radius = 3;
    scene.add(key);
    const hooks = { shadowMoved: vi.fn(), backdrop: vi.fn(), lights: vi.fn() };
    return { scene, key, hooks, t: { key, fill: null, sky: null, ambient: null, fog: null, distance: 100, crossfade: true, ...hooks } };
  }
  const twinOf = (scene: THREE.Scene, key: THREE.DirectionalLight) => scene.children.find((c) => c !== key && c instanceof THREE.DirectionalLight) as THREE.DirectionalLight;

  it("crossfades the sun's shadows between two lights a step of the arc apart, their strengths summing to the sun's", () => {
    const { scene, key, t } = target();
    const seasons = 0.2;
    drawDayNight(t, seasons, 0.6);
    const twin = twinOf(scene, key);
    expect(twin.castShadow).toBe(true);
    expect(twin.shadow.radius).toBe(3);
    expect(key.intensity + twin.intensity).toBeCloseTo(dayNightFrame(seasons, 0.6).sun.intensity, 9);
    // The two lights are one step apart.
    expect(THREE.MathUtils.radToDeg(key.position.angleTo(twin.position))).toBeLessThan(1.5);
    drawDayNight(t, seasons, 0.6);
    expect(scene.children.filter((c) => c instanceof THREE.DirectionalLight)).toHaveLength(2);
    releaseDayNight(key);
    expect(scene.children.filter((c) => c instanceof THREE.DirectionalLight)).toHaveLength(1);
  });

  it("moves a light to a new step only while its weight is 0: the shadows change smoothly, never jump", () => {
    const { scene, key, t } = target();
    const day = DAY_SHARE * SHADOW_STEP;
    let before: { key: THREE.Vector3; twin: THREE.Vector3; weights: [number, number] } | null = null;
    for (let i = 0; i < 400; i++) {
      drawDayNight(t, 0.2 + (i * day) / 37, 0);
      const twin = twinOf(scene, key);
      const total = key.intensity + twin.intensity;
      const now = { key: key.position.clone(), twin: twin.position.clone(), weights: [key.intensity / total, twin.intensity / total] as [number, number] };
      if (before) {
        if (!now.key.equals(before.key)) expect(Math.min(now.weights[0], before.weights[0])).toBeLessThan(0.03);
        if (!now.twin.equals(before.twin)) expect(Math.min(now.weights[1], before.weights[1])).toBeLessThan(0.03);
      }
      before = now;
    }
    releaseDayNight(key);
  });

  it("draws a still or held cycle with the key light alone, and releases a twin made while it moved", () => {
    const { scene, key, t } = target();
    const lights = () => scene.children.filter((c) => c instanceof THREE.DirectionalLight && c.castShadow);
    drawDayNight({ ...t, crossfade: false }, 0.3125, 0);
    expect(lights()).toEqual([key]);
    expect(key.intensity).toBeCloseTo(dayNightFrame(0.3125, 0).sun.intensity, 9);
    drawDayNight(t, 0.3125, 0);
    expect(lights()).toHaveLength(2);
    const twin = twinOf(scene, key);
    const disposed = vi.spyOn(twin.shadow, "dispose");
    drawDayNight({ ...t, crossfade: false }, 0.3125, 0);
    expect(lights()).toEqual([key]);
    expect(disposed).toHaveBeenCalled();
  });

  it("asks for the shadow map only when a light moved: never through a still night", () => {
    const { key, hooks, t } = target();
    drawDayNight(t, 0.7, 0);
    hooks.shadowMoved.mockClear();
    for (let i = 1; i < 50; i++) drawDayNight(t, 0.7 + i * 0.004, 0);
    expect(hooks.shadowMoved).not.toHaveBeenCalled();
    expect(key.intensity).toBe(0);
    releaseDayNight(key);
  });
});

describe("the backdrop pass", () => {
  it("adds the BACKDROP define and its colours to the finish pass only while the cycle draws it", () => {
    const effects = new Effects();
    effects.setLook(LOOK_PRESETS.mockup, "medium");
    const renderer = { getPixelRatio: () => 1, getSize: (v: THREE.Vector2) => v.set(400, 300), getDrawingBufferSize: (v: THREE.Vector2) => v.set(400, 300), domElement: { width: 400, height: 300 } };
    effects.init(renderer as never, new THREE.Scene(), new THREE.PerspectiveCamera());
    const finish = () => (effects as any).finishPass.material as THREE.RawShaderMaterial;
    expect("BACKDROP" in finish().defines).toBe(false);
    effects.setBackdrop(true, [0.5, 0.1, 0], [0.2, 0, -0.1]);
    expect("BACKDROP" in finish().defines).toBe(true);
    expect(finish().uniforms.backdropTop.value.toArray()).toEqual([0.5, 0.1, 0]);
    effects.setBackdrop(true, [0.6, 0, 0], [0.1, 0, 0]);
    expect(finish().uniforms.backdropBottom.value.toArray()).toEqual([0.1, 0, 0]);
    effects.setBackdrop(false);
    expect("BACKDROP" in finish().defines).toBe(false);
    effects.dispose();
  });

  it("keeps the bloom's stock blend without the backdrop; under it, the same colour and the scene's alpha kept", () => {
    const effects = new Effects();
    effects.setLook(LOOK_PRESETS.mockup, "high");
    const renderer = { getPixelRatio: () => 1, getSize: (v: THREE.Vector2) => v.set(400, 300), getDrawingBufferSize: (v: THREE.Vector2) => v.set(400, 300), domElement: { width: 400, height: 300 } };
    effects.init(renderer as never, new THREE.Scene(), new THREE.PerspectiveCamera());
    const blend = () => (effects as any).bloomPass.blendMaterial as THREE.ShaderMaterial;
    expect(blend().blending).toBe(THREE.AdditiveBlending);
    effects.setBackdrop(true, [0.5, 0, 0], [0.2, 0, 0]);
    // Three's additive blend is (SRC_ALPHA, ONE) on the colour: kept; the alpha takes nothing from the bloom.
    expect([blend().blending, blend().blendSrc, blend().blendDst, blend().blendSrcAlpha, blend().blendDstAlpha]).toEqual([THREE.CustomBlending, THREE.SrcAlphaFactor, THREE.OneFactor, THREE.ZeroFactor, THREE.OneFactor]);
    effects.setBackdrop(false);
    expect(blend().blending).toBe(THREE.AdditiveBlending);
    effects.dispose();
  });
});

describe("a still cycle and a frozen moment", () => {
  const frozen = (freezeAt: number | null) => resolveDayNightSettings({ enabled: true, season: "summer", freezeAt });
  it("holds a moment frozen in a day as asked (the season wheel's fixed states), still or not", () => {
    for (const at of [0.3125, 1.3125, 2.3125, 3.3125]) {
      expect(momentOf(frozen(at), 0, true)).toBe(at);
      expect(momentOf(frozen(at), 0, false)).toBe(at);
    }
  });
  it("still wins over a frozen night or dawn: a still scene never shows one", () => {
    expect(momentOf(frozen(1 + DAY_PHASE_AT.night), 0, true)).toBe(DAY_PHASE_AT.day);
    expect(momentOf(frozen(null), 5000, true)).toBe(DAY_PHASE_AT.day);
  });
});
