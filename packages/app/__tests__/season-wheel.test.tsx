import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_DAYNIGHT_SETTINGS, DAY_PHASE_AT, SEASONS } from "@paved/renderer";
// The cycle's own chunk, from its source: the renderer's barrel does not export its keyframes.
import { DAY_SHARE as RENDERER_DAY_SHARE, KEYFRAMES } from "../../renderer/src/core/daynight";
import { DAY_AT, DAY_SHARE, WHEEL_SEASONS, initialWheelRound, isNight, nextWheelRound, useSeasonWheel, type WheelRound, wheelDayNight } from "../src/data/season-wheel";
import {
  DIAL_PX,
  ICON_AT,
  ICON_PX,
  SEASON_GLYPH,
  SeasonWheel,
  TIME_DISC,
  TIME_GLYPH,
  TIME_ICON_AT,
  TIME_ICON_PX,
  TIME_TURNS_PER_YEAR,
} from "../src/components/elements/season-wheel";
import { OUTLINE } from "../src/components/elements/game-icon";

/** A game icon's tones: each has its own gradient, its id ending with the tone's name. */
const paletteTones = (svg: Element) => [...svg.querySelectorAll("linearGradient")].map((g) => g.id.match(/[a-z]+$/)![0]);

// The season wheel (#547), a crafted dial since #607, in three layers since #909: its states, what each asks of the renderer,
// its colours, and the element.

describe("the season wheel's states", () => {
  it("repeats the renderer's seasons, day moment and day share", () => {
    expect([...WHEEL_SEASONS]).toEqual([...SEASONS]);
    expect(DAY_AT).toBe(DAY_PHASE_AT.day);
    expect(DAY_SHARE).toBe(RENDERER_DAY_SHARE);
  });

  it("tells the night from the day as the cycle does", () => {
    expect(isNight(null)).toBe(false);
    expect(isNight({ season: "summer", position: 0.62 })).toBe(false);
    expect(isNight({ season: "summer", position: 0.625 })).toBe(true);
  });

  // Six taps from a round, the auto cycle's season given on each tap (only the one from auto uses it).
  const taps = (from: WheelRound, now: (typeof WHEEL_SEASONS)[number] | null) => {
    const seen = [from];
    for (let i = 0; i < 6; i++) seen.push(nextWheelRound(seen.at(-1)!, now));
    return seen.map((r) => r.state);
  };

  it("goes from auto to the season after now, then forward, now's own season last, and back to auto on the fifth tap (#909)", () => {
    const auto = initialWheelRound(true);
    // Six taps: the fifth is auto, the sixth starts a new round from the cycle's season.
    expect(taps(auto, "summer")).toEqual(["auto", "autumn", "winter", "spring", "summer", "auto", "autumn"]);
    expect(taps(auto, "autumn")).toEqual(["auto", "winter", "spring", "summer", "autumn", "auto", "winter"]);
    expect(taps(auto, "winter")).toEqual(["auto", "spring", "summer", "autumn", "winter", "auto", "spring"]);
    expect(taps(auto, "spring")).toEqual(["auto", "summer", "autumn", "winter", "spring", "auto", "summer"]);
    // The cycle not drawn yet: the dial rests on summer's day, so autumn is the next to come.
    expect(taps(auto, null)).toEqual(["auto", "autumn", "winter", "spring", "summer", "auto", "autumn"]);
  });

  it("fixes every season once in a round, whatever the season now (#909: none skipped)", () => {
    for (const now of WHEEL_SEASONS) {
      const fixed = taps(initialWheelRound(true), now).slice(1, 5);
      expect([...fixed].sort(), now).toEqual([...WHEEL_SEASONS].sort());
      expect(fixed.at(-1), now).toBe(now);
    }
  });

  it("reads the cycle's season only on the tap from auto: a round keeps its course whatever the cycle says after", () => {
    let round = nextWheelRound(initialWheelRound(true), "winter");
    expect(round.state).toBe("spring");
    round = nextWheelRound(round, "summer");
    expect(round.state).toBe("summer");
    round = nextWheelRound(round, "spring");
    expect(round.state).toBe("autumn");
    round = nextWheelRound(round, "autumn");
    expect(round.state).toBe("winter");
    expect(nextWheelRound(round, "autumn")).toEqual({ state: "auto", last: null });
  });

  it("starts from the setting: auto when the cycle is on, summer when it is off, whose round ends with spring", () => {
    expect(initialWheelRound(true).state).toBe("auto");
    expect(initialWheelRound(false).state).toBe("summer");
    expect(taps(initialWheelRound(false), "winter")).toEqual(["summer", "autumn", "winter", "spring", "auto", "spring", "summer"]);
  });

  it("asks the renderer to run in auto, to hold a season's day, and for no cycle at all in summer with the setting off", () => {
    expect(wheelDayNight("auto", true)).toEqual({ enabled: true, freezeAt: null });
    expect(wheelDayNight("auto", false)).toEqual({ enabled: true, freezeAt: null });
    expect(wheelDayNight("summer", false)).toEqual({ enabled: false, freezeAt: null });
    expect(wheelDayNight("summer", true)).toEqual({ enabled: true, freezeAt: 0.3125 });
    expect(wheelDayNight("autumn", false)).toEqual({ enabled: true, freezeAt: 1.3125 });
    expect(wheelDayNight("winter", true)).toEqual({ enabled: true, freezeAt: 2.3125 });
    expect(wheelDayNight("spring", true)).toEqual({ enabled: true, freezeAt: 3.3125 });
    expect(DEFAULT_DAYNIGHT_SETTINGS.freezeAt).toBeNull();
  });

  it("is per game: a new game, or a change of the setting, starts again from the setting", () => {
    const { result, rerender } = renderHook(({ on, game }) => useSeasonWheel(on, game), { initialProps: { on: true, game: 1 } });
    act(() => result.current.next("winter"));
    expect(result.current.state).toBe("spring");
    rerender({ on: true, game: 2 });
    expect(result.current.state).toBe("auto");
    act(() => result.current.next());
    rerender({ on: false, game: 2 });
    expect(result.current.state).toBe("summer");
  });
});

describe("the season dial's colours and room (#607)", () => {
  const theme = readFileSync(resolve(import.meta.dirname, "../src/styles/theme.css"), "utf8");
  const token = (name: string) => theme.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1]?.trim();

  it("keeps the sky tokens the 3D cycle's, its keyframes' top and bottom", () => {
    for (const season of SEASONS) {
      for (const phase of ["day", "night"] as const) {
        expect(token(`sky-${season}-${phase}-top`)?.toLowerCase(), `${season} ${phase} top`).toBe(KEYFRAMES[season][phase].top.toLowerCase());
        expect(token(`sky-${season}-${phase}-bottom`)?.toLowerCase(), `${season} ${phase} bottom`).toBe(KEYFRAMES[season][phase].bottom.toLowerCase());
      }
    }
  });

  it("paints each season's quarter with its day sky, the centre's day and night their own skies (#909)", () => {
    const { container } = render(<SeasonWheel state="auto" />);
    const stops = (id: string) => [...container.querySelectorAll(`#${id} stop`)].map((s) => s.getAttribute("stop-color"));
    for (const season of SEASONS) expect(stops(`dial-${season}`)).toEqual([`var(--sky-${season}-day-top)`, `var(--sky-${season}-day-bottom)`]);
    expect(stops("dial-time-day")).toEqual(["var(--dial-day-top)", "var(--dial-day-bottom)"]);
    expect(stops("dial-time-night")).toEqual(["var(--dial-night-top)", "var(--dial-night-bottom)"]);
    for (const name of ["dial-day-top", "dial-day-bottom", "dial-night-top", "dial-night-bottom", "dial-star"]) expect(token(name), name).toBeTruthy();
    // The needle in the theme's red (#909's open point 2).
    expect(token("dial-needle")).toBe("var(--destructive)");
  });

  it("twinkles the stars, still under reduced motion", () => {
    expect(theme).toMatch(/@utility dial-twinkle \{\s*animation: dial-twinkle [^;]+;\s*@media \(prefers-reduced-motion: reduce\) \{\s*animation: none;/);
    const { container } = render(<SeasonWheel state="auto" />);
    const stars = [...container.querySelectorAll("[data-star]")];
    expect(stars.length).toBeGreaterThan(2);
    for (const star of stars) expect(star).toHaveClass("dial-twinkle");
  });

  it("draws each season's icon and the centre's day and night as game icons, in their own tones (#870)", () => {
    const { container } = render(<SeasonWheel state="auto" point={{ season: "summer", position: 0.8 }} />);
    for (const season of SEASONS) {
      const icon = container.querySelector(`[data-season=${season}] [data-slot=game-icon]`);
      expect(icon, season).toHaveAttribute("data-icon", SEASON_GLYPH[season]);
    }
    expect(paletteTones(container.querySelector("[data-season=winter] svg")!)).toEqual(["ice"]);
    expect(paletteTones(container.querySelector("[data-season=autumn] svg")!)).toEqual(["orange"]);
    const time = (t: "day" | "night") => container.querySelector(`[data-time-icon=${t}] [data-slot=game-icon]`)!;
    expect(time("day")).toHaveAttribute("data-icon", "cloud-sun");
    expect(time("night")).toHaveAttribute("data-icon", "moon");
    // The day told apart from summer at a glance: a sun behind a cloud, not summer's lone sun.
    expect(Object.values(SEASON_GLYPH)).not.toContain(TIME_GLYPH.day);
    expect(paletteTones(time("day").querySelector("svg") ?? time("day"))).toEqual(["gold", "light"]);
    expect(paletteTones(time("night").querySelector("svg") ?? time("night"))).toEqual(["silver"]);
  });

  it("tones its gold down into the stones (#634)", () => {
    const share = Number(token("dial-rim")?.match(/^color-mix\(in oklab, var\(--primary\) (\d+)%, var\(--color-charcoal-600\)\)$/)?.[1]);
    expect(share).toBeLessThan(80);
  });

  it("keeps the icons at least 4 px apart on a phone, on a dial of 96 px or more", () => {
    const px = (s: (typeof WHEEL_SEASONS)[number]) => ({ x: (ICON_AT[s].x / 100) * DIAL_PX, y: (ICON_AT[s].y / 100) * DIAL_PX });
    for (let i = 0; i < 4; i++) {
      const a = px(WHEEL_SEASONS[i]!);
      const b = px(WHEEL_SEASONS[(i + 1) % 4]!);
      // Two square icons, upright: apart when the larger of the two axes' distances exceeds an icon, its game outline
      // included (half the stroke outside each side), by 4 px.
      expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) - ICON_PX * (1 + OUTLINE / 512)).toBeGreaterThanOrEqual(4);
    }
    expect(DIAL_PX).toBeGreaterThanOrEqual(96);
  });

  it("keeps the season icons between the two discs, and the centre's two icons inside it, apart", () => {
    const fromCentre = (p: { x: number; y: number }) => Math.hypot(p.x - 50, p.y - 50);
    // An icon's half, its outline included, in dial units (100 across).
    const half = (px: number) => ((px * (1 + OUTLINE / 512)) / 2 / DIAL_PX) * 100;
    for (const s of WHEEL_SEASONS) {
      const r = fromCentre(ICON_AT[s]);
      expect(r - half(ICON_PX), s).toBeGreaterThan(TIME_DISC);
      expect(r + half(ICON_PX), s).toBeLessThan(40);
    }
    for (const t of ["day", "night"] as const) expect(fromCentre(TIME_ICON_AT[t]) + half(TIME_ICON_PX), t).toBeLessThan(TIME_DISC);
    const gap = Math.hypot(TIME_ICON_AT.day.x - TIME_ICON_AT.night.x, TIME_ICON_AT.day.y - TIME_ICON_AT.night.y);
    expect(((gap - 2 * half(TIME_ICON_PX)) / 100) * DIAL_PX).toBeGreaterThanOrEqual(4);
    // 40 % of the dial's radius (#909's open point 1).
    expect(TIME_DISC).toBe(20);
  });
});

describe("<SeasonWheel>", () => {
  it("names its state and time of day, is the 96 px dial (108 px from 390 px wide), and calls onNext on a click", () => {
    const onNext = vi.fn();
    const { container } = render(<SeasonWheel state="winter" onNext={onNext} />);
    const button = screen.getByRole("button", { name: /winter day/ });
    expect(container.querySelector(".size-24")).not.toBeNull();
    fireEvent.click(button);
    expect(onNext).toHaveBeenCalledOnce();
  });

  it("shows no auto or fixed mark, only the three layers and the red needle (#909)", () => {
    const { rerender, container } = render(<SeasonWheel state="auto" point={{ season: "autumn", position: 0.3 }} />);
    expect(screen.getByRole("button", { name: /automatic, now autumn day/ })).toBeTruthy();
    expect(container.querySelectorAll("[data-quarter]")).toHaveLength(4);
    expect([...container.querySelectorAll("[data-half]")].map((e) => e.getAttribute("data-half"))).toEqual(["day", "night"]);
    expect(container.querySelectorAll("[data-needle]")).toHaveLength(1);
    expect(container.querySelector("[data-centre], [data-now], [data-sector]")).toBeNull();
    // A fixed state draws the same dial: only its name, its state and its angles differ.
    const drawing = () =>
      container.innerHTML
        .replace(/(aria-label|title|data-state)="[^"]*"/g, "")
        .replace(/rotate\([^)]*\)/g, "")
        .replace(/ data-current="true"/g, "");
    const auto = drawing();
    rerender(<SeasonWheel state="autumn" />);
    expect(screen.getByRole("button", { name: "Season: autumn day. Change" })).toBeTruthy();
    expect(drawing()).toBe(auto);
  });

  it("names the time of day, a fixed season by day, and writes nothing (#634)", () => {
    const { rerender, container } = render(<SeasonWheel state="auto" point={{ season: "spring", position: 0.3 }} />);
    expect(screen.getByRole("button", { name: /now spring day/ })).toHaveAttribute("data-time", "day");
    rerender(<SeasonWheel state="auto" point={{ season: "spring", position: 0.8 }} />);
    expect(screen.getByRole("button", { name: /now spring night/ })).toHaveAttribute("data-time", "night");
    expect(container.textContent).toBe("");
    rerender(<SeasonWheel state="winter" />);
    expect(screen.getByRole("button", { name: /winter day/ })).toHaveAttribute("data-time", "day");
    expect(container.textContent).toBe("");
  });

  const angle = (c: HTMLElement, layer: string) => Number(c.querySelector<HTMLElement>(`[data-${layer}]`)!.style.transform.match(/^rotate\((-?[\d.]+)deg\)$/)![1]);
  /** Which half of the centre disc is under the needle at the top, from its angle (its day from 0 to `DAY_SHARE` of a turn). */
  const underNeedle = (deg: number) => ((((-deg % 360) + 360) % 360) / 360 < DAY_SHARE ? "day" : "night");

  it("turns the centre disc four times for one turn of the seasons' disc, the icons riding along", () => {
    expect(TIME_TURNS_PER_YEAR).toBe(4);
    const { rerender, container } = render(<SeasonWheel state="auto" point={{ season: "summer", position: 0.1 }} />);
    const start = { seasons: angle(container, "dial-disc"), time: angle(container, "time-disc") };
    rerender(<SeasonWheel state="auto" point={{ season: "autumn", position: 0.6 }} />);
    const seasons = angle(container, "dial-disc") - start.seasons;
    const time = angle(container, "time-disc") - start.time;
    expect(seasons).toBeCloseTo(-135);
    expect(time).toBeCloseTo(4 * seasons);
    expect(angle(container, "dial-icons")).toBe(angle(container, "dial-disc"));
    expect(angle(container, "time-icons")).toBe(angle(container, "time-disc"));
  });

  it("holds the centre disc's day under the needle exactly while the cycle is in day", () => {
    const { rerender, container } = render(<SeasonWheel state="auto" point={{ season: "summer", position: 0 }} />);
    for (const season of SEASONS) {
      for (let i = 0; i < 40; i++) {
        const point = { season, position: i / 40 };
        rerender(<SeasonWheel state="auto" point={point} />);
        expect(underNeedle(angle(container, "time-disc")), `${season} ${point.position}`).toBe(isNight(point) ? "night" : "day");
      }
    }
  });

  it("rests a fixed season under the needle in the middle of its day, and only ever turns one way", () => {
    const { rerender, container } = render(<SeasonWheel state="autumn" />);
    expect(angle(container, "dial-disc")).toBe(-118.125);
    // The middle of the centre disc's day half, under the needle.
    expect(angle(container, "time-disc")).toBe(-472.5);
    expect((-angle(container, "time-disc") % 360) / 360).toBe(DAY_SHARE / 2);
    rerender(<SeasonWheel state="spring" />);
    expect(angle(container, "dial-disc")).toBe(-298.125);
    rerender(<SeasonWheel state="auto" point={{ season: "summer", position: 0.5 }} />);
    // Summer again is on from spring (a turn past it, half a season in), not a step back.
    expect(angle(container, "dial-disc")).toBe(-405);
    rerender(<SeasonWheel state="auto" point={{ season: "summer", position: 0.75 }} />);
    expect(angle(container, "dial-disc")).toBe(-427.5);
    expect(angle(container, "time-disc")).toBe(-1710);
  });

  it("turns both discs forward through a whole tap round, from the last fixed season on to auto", () => {
    let round = initialWheelRound(true);
    const point = { season: "autumn" as const, position: 0.8 };
    const { rerender, container } = render(<SeasonWheel state={round.state} point={point} />);
    let last = { seasons: angle(container, "dial-disc"), time: angle(container, "time-disc") };
    for (let i = 0; i < 5; i++) {
      round = nextWheelRound(round, point.season);
      rerender(<SeasonWheel state={round.state} point={point} />);
      const now = { seasons: angle(container, "dial-disc"), time: angle(container, "time-disc") };
      expect(now.seasons, round.state).toBeLessThanOrEqual(last.seasons);
      expect(now.time, round.state).toBeLessThanOrEqual(last.time);
      last = now;
    }
    // Back on auto, a full year on from where it started.
    expect(round.state).toBe("auto");
    expect(last.seasons).toBeCloseTo(-1.8 * 90 - 360);
  });
});
