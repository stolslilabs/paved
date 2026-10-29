import { useCallback, useEffect, useState } from "react";
import type { DayNightSettings, Season } from "@paved/renderer";

// The season wheel's state (#547): what the board's day and night cycle shows in this game. Per game, never stored: a new
// game starts from the Day and night setting (auto when it is on, summer when it is off).

/** The seasons in the cycle's order, as `@paved/renderer`'s `SEASONS`, repeated: its barrel pulls three.js (see `settings.ts`). */
export const WHEEL_SEASONS = ["summer", "autumn", "winter", "spring"] as const satisfies readonly Season[];

/** The wheel's states: auto, then the day of each season. */
export const WHEEL_STATES = ["auto", ...WHEEL_SEASONS] as const;
export type WheelState = (typeof WHEEL_STATES)[number];

/** `DAY_PHASE_AT.day` of the renderer: the middle of a season's day, where a fixed state holds the cycle. */
export const DAY_AT = 0.3125;

/** `DAY_SHARE` of the renderer's cycle (its chunk, not its barrel): the share of a season that is day, the rest night. */
export const DAY_SHARE = 0.625;

/** Day or night at a point of the cycle; a fixed state holds a day. */
export const isNight = (point: WheelPoint | null | undefined): boolean => !!point && point.position >= DAY_SHARE;

/** The season after `season` in the cycle. */
export const followingSeason = (season: Season): Season => WHEEL_SEASONS[(WHEEL_SEASONS.indexOf(season as (typeof WHEEL_SEASONS)[number]) + 1) % WHEEL_SEASONS.length]!;

/**
 * Where the wheel is in a round of taps (#634): its state, and `last`, the last season of the round, after which a tap
 * goes back to auto. In auto `last` is none.
 */
export interface WheelRound {
  state: WheelState;
  last: Season | null;
}

/**
 * A tap (#634, every season since #909): from auto, the season after `now` (the auto cycle's season; summer's day, where the
 * dial rests, when the cycle has not drawn yet); then each following season, ending with `now`'s own. The four seasons
 * fixed once each, the fifth tap goes back to auto. The dial only ever turns forward.
 */
export function nextWheelRound(round: WheelRound, now?: Season | null): WheelRound {
  if (round.state === "auto") {
    const from = now ?? "summer";
    return { state: followingSeason(from) as WheelState, last: from };
  }
  if (round.state === round.last) return { state: "auto", last: null };
  return { state: followingSeason(round.state) as WheelState, last: round.last };
}

/** Where a new game starts: auto with the cycle on; summer with it off, as the first of a round that ends in spring. */
export const initialWheelRound = (dayNight: boolean): WheelRound => (dayNight ? { state: "auto", last: null } : { state: "summer", last: "spring" });

/** Where a new game starts: auto with the cycle on in Settings, summer with it off. */
export const initialWheelState = (dayNight: boolean): WheelState => (dayNight ? "auto" : "summer");

/**
 * The renderer's cycle settings for a state. Summer with the setting off is the look's own fixed lights (the cycle's chunk
 * is not loaded); any other state turns the cycle on, held at the day of its season (`freezeAt` none for auto).
 */
export function wheelDayNight(state: WheelState, settingOn: boolean): Pick<DayNightSettings, "enabled" | "freezeAt"> {
  if (state === "auto") return { enabled: true, freezeAt: null };
  if (state === "summer" && !settingOn) return { enabled: false, freezeAt: null };
  return { enabled: true, freezeAt: WHEEL_SEASONS.indexOf(state) + DAY_AT };
}

/**
 * The wheel's state for one game: from the setting at the start (and when the setting changes, which is a new choice of
 * the player's), moved by `next`, which takes the auto cycle's season now (`nextWheelRound`). `resetKey` is the game: a
 * new one starts again from the setting.
 */
export function useSeasonWheel(dayNight: boolean, resetKey?: unknown): { state: WheelState; next: (now?: Season | null) => void } {
  const [round, setRound] = useState<WheelRound>(() => initialWheelRound(dayNight));
  const [seen, setSeen] = useState({ dayNight, resetKey });
  if (seen.dayNight !== dayNight || seen.resetKey !== resetKey) {
    setSeen({ dayNight, resetKey });
    setRound(initialWheelRound(dayNight));
  }
  const next = useCallback((now?: Season | null) => setRound((r) => nextWheelRound(r, now)), []);
  return { state: round.state, next };
}

/** The point of the cycle the wheel shows: the season and how far through its day and night (0 a dawn, 1 the next). */
export interface WheelPoint {
  season: Season;
  position: number;
}

/** The cycle's point on a slow timer (no frame of its own): `read` is `GameScene.getDayNight`, null until the cycle draws. */
export function useWheelPoint(read: (() => WheelPoint | null) | null, active: boolean, everyMs = 1000): WheelPoint | null {
  const [point, setPoint] = useState<WheelPoint | null>(null);
  useEffect(() => {
    if (!read || !active) return;
    const tick = () => {
      const p = read();
      setPoint((old) => (p && old && old.season === p.season && Math.abs(old.position - p.position) < 1e-3 ? old : p && { season: p.season, position: p.position }));
    };
    tick();
    const id = setInterval(tick, everyMs);
    return () => clearInterval(id);
  }, [read, active, everyMs]);
  return point;
}
