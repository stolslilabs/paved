import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  DAY_SHARE,
  DayNightClock,
  HOLDS,
  KEYFRAMES,
  START_POSITION,
  cycleAt,
  dayNightFrame,
  hexToLinear,
  linearToOklab,
  oklabToLinear,
  pageCycleTime,
  seasonsAt,
  seededSeason,
  startSeason,
  sunAt,
} from "../src/core/daynight";
import { DAY_PHASES, DAY_PHASE_AT, DEFAULT_DAYNIGHT_SETTINGS, SEASONS, resolveDayNightSettings } from "../src/core/daynight-settings";
import { resolveRendererSettings } from "../src/core/settings";

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
    expect(set).toMatchObject({ enabled: true, speed: 10, season: "winter", seed: 3, freezeAt: 1.5, cycleMs: 120_000, brightnessFloor: 0.5 });
    expect(resolveDayNightSettings({ season: "monsoon" as never, reducedMotion: "sometimes" as never })).toMatchObject({ season: "random", reducedMotion: "auto" });
    expect(resolveRendererSettings({ dayNight: { enabled: true } }).dayNight.enabled).toBe(true);
  });
});
