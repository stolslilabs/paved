import { describe, expect, it } from "vitest";
import { DAY_NIGHT_RUNS, DAY_PHASE_AT, SEASONS } from "@paved/renderer";
// The cycle's own chunk, from its source: the renderer's barrel does not export its keyframes.
import { KEYFRAMES, cycleAt } from "../../renderer/src/core/daynight";
import { CYCLE_SEASONS, DAY_AT, DAY_TIME_CHOICES, NIGHT_AT, SEASONS_CHOICES, SUMMER_DAY, cycleDayNight } from "../src/data/day-night";
import { DAY_TIME_OPTIONS, SEASON_OPTIONS } from "../src/components/containers/device-settings-panel";
import { readThemeCss } from "./theme-css";

// SEASONS-SETTINGS (the owner's ask of 2026-11-08): Settings' Seasons and Day and night, each a cycle or one held, in the season
// wheel's place; what each pair asks of the renderer's day and night cycle.

describe("Settings' seasons and day and night", () => {
  it("repeat the renderer's seasons in the cycle's order, summer first, and its day's and night's moments", () => {
    expect([...CYCLE_SEASONS]).toEqual([...SEASONS]);
    expect(DAY_AT).toBe(DAY_PHASE_AT.day);
    expect(NIGHT_AT).toBe(DAY_PHASE_AT.night);
    expect([...SEASONS_CHOICES]).toEqual(["cycle", "summer", "autumn", "winter", "spring"]);
    expect([...DAY_TIME_CHOICES]).toEqual(["cycle", "day", "night"]);
  });

  it("offer every choice in the menus, Cycle first, each with its word and painting", () => {
    expect(SEASON_OPTIONS.map((o) => [o.value, o.label, o.art])).toEqual([
      ["cycle", "Cycle", "rotate"],
      ["summer", "Summer", "summer"],
      ["autumn", "Autumn", "autumn"],
      ["winter", "Winter", "winter"],
      ["spring", "Spring", "spring"],
    ]);
    expect(DAY_TIME_OPTIONS.map((o) => [o.value, o.label, o.art])).toEqual([
      ["cycle", "Cycle", "rotate"],
      ["day", "Day", "sun"],
      ["night", "Night", "moon"],
    ]);
  });

  it("ask the renderer for each pair: the whole cycle, a moment held, a part turning, or the cycle off on Summer and Day", () => {
    expect(cycleDayNight("cycle", "cycle")).toEqual({ enabled: true, freezeAt: null });
    expect(cycleDayNight("summer", "day")).toBe(SUMMER_DAY);
    expect(SUMMER_DAY).toEqual({ enabled: false, freezeAt: null });
    expect(cycleDayNight("winter", "day")).toEqual({ enabled: true, freezeAt: 2 + DAY_AT });
    expect(cycleDayNight("summer", "night")).toEqual({ enabled: true, freezeAt: NIGHT_AT });
    expect(cycleDayNight("winter", "night")).toEqual({ enabled: true, freezeAt: 2 + NIGHT_AT });
    expect(cycleDayNight("autumn", "cycle")).toEqual({ enabled: true, freezeAt: null, runs: "day-night", season: "autumn" });
    expect(cycleDayNight("cycle", "day")).toEqual({ enabled: true, freezeAt: null, runs: "seasons-day" });
    expect(cycleDayNight("cycle", "night")).toEqual({ enabled: true, freezeAt: null, runs: "seasons-night" });
  });

  it("hold the season and the phase chosen: every held pair is that season's day or night as the cycle reads it", () => {
    for (const season of CYCLE_SEASONS) {
      for (const phase of ["day", "night"] as const) {
        const held = cycleDayNight(season, phase);
        if (!held.enabled) continue;
        expect(cycleAt(held.freezeAt!), `${season} ${phase}`).toMatchObject({ season, phase, blend: 0 });
      }
    }
    for (const choice of SEASONS_CHOICES) for (const dayTime of DAY_TIME_CHOICES) {
      const runs = cycleDayNight(choice, dayTime).runs;
      if (runs) expect(DAY_NIGHT_RUNS).toContain(runs);
    }
  });

  it("keep the sky tokens the 3D cycle's, its keyframes' top and bottom", () => {
    const theme = readThemeCss();
    const token = (name: string) => theme.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1]?.trim();
    for (const season of SEASONS) {
      for (const phase of ["day", "night"] as const) {
        expect(token(`sky-${season}-${phase}-top`)?.toLowerCase(), `${season} ${phase} top`).toBe(KEYFRAMES[season][phase].top.toLowerCase());
        expect(token(`sky-${season}-${phase}-bottom`)?.toLowerCase(), `${season} ${phase} bottom`).toBe(KEYFRAMES[season][phase].bottom.toLowerCase());
      }
    }
  });
});
