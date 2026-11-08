import type { DayNightSettings, Season } from "@paved/renderer";

// The board's seasons and its day and night as Settings choose them (SEASONS-SETTINGS, the owner's ask of 2026-11-08, in the
// place of the board's old dial): each a cycle (the default) or one held. Types and figures only, the renderer a type-only import: the
// shell imports `settings.ts`, which reads this, and the renderer's barrel pulls three.js.

/** The seasons in the cycle's order (`@paved/renderer`'s `SEASONS`, repeated: its barrel pulls three.js), summer first. */
export const CYCLE_SEASONS = ["summer", "autumn", "winter", "spring"] as const satisfies readonly Season[];

/** `DAY_PHASE_AT.day` of the renderer: the middle of a season's day, where a held day stands. */
export const DAY_AT = 0.3125;
/** `DAY_PHASE_AT.night` of the renderer: the middle of a season's night, where a held night stands. */
export const NIGHT_AT = 0.805;

/** Settings' Seasons: the seasons turning ("cycle"), or one season held. */
export const SEASONS_CHOICES = ["cycle", ...CYCLE_SEASONS] as const;
export type SeasonsChoice = (typeof SEASONS_CHOICES)[number];

/** Settings' Day and night: the day and the night turning ("cycle"), or the day or the night held. */
export const DAY_TIME_CHOICES = ["cycle", "day", "night"] as const;
export type DayTimeChoice = (typeof DAY_TIME_CHOICES)[number];

/** The renderer's cycle off: summer's day with its fixed lights, no night and no chimney smoke (the renderer's rule, #770). */
export const SUMMER_DAY = { enabled: false, freezeAt: null } as const;

/** What the board's cycle takes of the two choices: on or off, a moment held, what it turns and from which season. */
export type CycleSettings = Pick<DayNightSettings, "enabled" | "freezeAt"> & Partial<Pick<DayNightSettings, "runs" | "season">>;

/**
 * The renderer's cycle for Settings' two choices. Both cycles: the whole cycle, from the page's season. A season and Day: that
 * season's day held, and Summer and Day the cycle off (`SUMMER_DAY`: the cheap path, the cycle's chunk not loaded). A season and
 * Night: that season's night held. A season and Cycle: its day and night turning, looping. Cycle and Day, Cycle and Night: the
 * seasons turning, each held at its day or its night (`runs`, the renderer's).
 */
export function cycleDayNight(seasons: SeasonsChoice, dayTime: DayTimeChoice): CycleSettings {
  if (seasons === "cycle") {
    if (dayTime === "cycle") return { enabled: true, freezeAt: null };
    return { enabled: true, freezeAt: null, runs: dayTime === "day" ? "seasons-day" : "seasons-night" };
  }
  if (dayTime === "cycle") return { enabled: true, freezeAt: null, runs: "day-night", season: seasons };
  if (seasons === "summer" && dayTime === "day") return SUMMER_DAY;
  return { enabled: true, freezeAt: CYCLE_SEASONS.indexOf(seasons) + (dayTime === "day" ? DAY_AT : NIGHT_AT) };
}
