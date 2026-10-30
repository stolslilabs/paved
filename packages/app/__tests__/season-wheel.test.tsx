import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_DAYNIGHT_SETTINGS, DAY_PHASE_AT, SEASONS } from "@paved/renderer";
// The cycle's own chunk, from its source: the renderer's barrel does not export its keyframes.
import { DAY_SHARE as RENDERER_DAY_SHARE, KEYFRAMES } from "../../renderer/src/core/daynight";
import { DAY_AT, DAY_SHARE, WHEEL_SEASONS, initialWheelRound, isNight, nextWheelRound, useSeasonWheel, type WheelRound, wheelDayNight } from "../src/data/season-wheel";
import {
  CENTRE_TURNS,
  DECOR,
  DRIFT,
  DRIFT_KEYFRAMES,
  DRIFT_MS,
  DIAL_PX,
  DISC,
  DUSK_BLEND,
  ICON_AT,
  ICON_PX,
  PEBBLE_BAND,
  SEASON_BLEND,
  SEASON_GLYPH,
  SeasonWheel,
  TIME_DISC,
  TIME_GLYPH,
  TIME_ICON_AT,
  TIME_ICON_PX,
  TIME_TURNS_PER_YEAR,
  seasonsSky,
  timeSky,
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

  it("paints the seasons' disc with their day skies, blended over 20° across each start, with no seam line (#930)", () => {
    expect(SEASON_BLEND).toBe(20);
    for (const part of ["top", "bottom"] as const) {
      // Each quarter holds its own sky but for 10° at each end, from summer at the top, clockwise; the gradient starts 10° on.
      expect(seasonsSky(part)).toBe(
        `conic-gradient(from 10deg, var(--sky-summer-day-${part}) 0deg 70deg, var(--sky-autumn-day-${part}) 90deg 160deg, ` +
          `var(--sky-winter-day-${part}) 180deg 250deg, var(--sky-spring-day-${part}) 270deg 340deg, var(--sky-summer-day-${part}))`,
      );
    }
    const { container } = render(<SeasonWheel state="auto" />);
    const sky = container.querySelector<HTMLElement>("[data-dial-disc] [data-sky=seasons]")!;
    // The top at the rim, the bottom (the horizon) at the centre, faded out towards the rim.
    expect(sky.style.background).toContain("--sky-summer-day-top");
    expect((sky.firstElementChild as HTMLElement).style.background).toContain("--sky-summer-day-bottom");
    expect((sky.firstElementChild as HTMLElement).style.maskImage).toBe("radial-gradient(closest-side, black, transparent)");
    expect(sky.style.inset).toBe(`${50 - DISC}%`);
    expect(container.querySelectorAll("line")).toHaveLength(2);
  });

  it("blends the centre's day and night over 30° at dusk and at dawn, through the dusk tones (#930)", () => {
    expect(DUSK_BLEND).toBe(30);
    // Dawn at the top, dusk at `DAY_SHARE` of a turn (225°).
    const mid = "color-mix(in oklab, var(--dial-day-top), var(--dial-night-top))";
    expect(timeSky("bottom")).toBe(
      "conic-gradient(var(--sky-autumn-day-bottom), var(--dial-day-bottom) 15deg 210deg, var(--sky-autumn-day-bottom) 225deg, var(--dial-night-bottom) 240deg 345deg, var(--sky-autumn-day-bottom))",
    );
    expect(timeSky("top")).toContain(`var(--dial-day-top) 15deg 210deg, ${mid} 225deg, var(--dial-night-top) 240deg 345deg`);
    const { container } = render(<SeasonWheel state="auto" />);
    expect(container.querySelector<HTMLElement>("[data-time-disc] [data-sky=time]")!.style.inset).toBe(`${50 - TIME_DISC}%`);
    // The dusk tones from the dial's own tokens: none of their own (the stylesheet's budget).
    for (const name of ["dial-day-top", "dial-day-bottom", "dial-night-top", "dial-night-bottom", "sky-autumn-day-bottom", "dial-star"]) expect(token(name), name).toBeTruthy();
    // The needle in the theme's red (#909's open point 2).
    expect(token("dial-needle")).toBe("var(--destructive)");
  });

  it("sets a ring of 16 small stones between the two discs, in the band's tones, in place of the black line (#930)", () => {
    const { container } = render(<SeasonWheel state="auto" />);
    const pebbles = [...container.querySelectorAll("[data-dial-disc] [data-pebble]")];
    expect(pebbles).toHaveLength(16);
    for (const p of pebbles) expect(["var(--dial-stone)", "var(--dial-stone-alt)"]).toContain(p.getAttribute("fill"));
    expect(PEBBLE_BAND).toEqual([TIME_DISC, 19.5]);
    // Only the rim's ring and the seasons' disc's edge are left fixed.
    expect([...container.querySelectorAll("svg > circle[stroke='var(--dial-ring)']")].map((c) => Number(c.getAttribute("r")))).toEqual([49.25, DISC + 0.5]);
  });

  it("twinkles the stars, drifts the clouds and glides the birds, all still under reduced motion (#930)", () => {
    expect(theme).toMatch(/@utility dial-twinkle \{\s*animation: dial-twinkle [^;]+;\s*@media \(prefers-reduced-motion: reduce\) \{\s*animation: none;/);
    // The drift the geometry test allows for is the keyframes'.
    expect(DRIFT_KEYFRAMES).toEqual([{ translate: "0 0" }, { translate: "4.4% -1.5%" }]);
    expect(DRIFT.x).toBeCloseTo(1.5, 1);
    expect(DRIFT_MS.cloud).toBeGreaterThan(DRIFT_MS.bird);
    const animate = vi.fn(() => ({ cancel: vi.fn() }));
    Element.prototype.animate = animate as unknown as Element["animate"];
    try {
      const { container, unmount } = render(<SeasonWheel state="auto" />);
      const of = (kind: string) => [...container.querySelectorAll(`[data-time-disc] [data-decor=${kind}]`)];
      expect(of("star").length).toBeGreaterThan(2);
      for (const star of of("star")) expect(star).toHaveClass("dial-twinkle");
      expect(of("cloud").length).toBeGreaterThanOrEqual(2);
      expect(of("bird").length).toBeGreaterThanOrEqual(2);
      // The clouds drift as one and the birds as one, each group in the centre disc's box: two animations of an HTML box's
      // translate, which the compositor runs. The stars twinkle in a layer of their own.
      for (const kind of ["cloud", "bird"]) {
        const group = of(kind).map((p) => p.parentElement);
        expect(new Set(group).size, kind).toBe(1);
        expect(group[0]).toHaveAttribute("data-drift", kind);
        expect((group[0]!.parentElement as HTMLElement).style.inset).toBe(`${50 - TIME_DISC}%`);
      }
      expect((of("star")[0]!.parentElement!.parentElement as HTMLElement).style.willChange).toBe("transform");
      expect(animate).toHaveBeenCalledTimes(2);
      const calls = animate.mock.calls as unknown as [Keyframe[], KeyframeAnimationOptions][];
      for (const [frames, options] of calls) {
        expect(frames).toBe(DRIFT_KEYFRAMES);
        expect(options).toMatchObject({ iterations: Infinity, direction: "alternate" });
      }
      expect(calls.map(([, o]) => o.duration)).toEqual([DRIFT_MS.cloud, DRIFT_MS.bird]);
      unmount();
      // Under reduced motion, nothing drifts.
      animate.mockClear();
      const matchMedia = vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
      render(<SeasonWheel state="auto" />);
      expect(animate).not.toHaveBeenCalled();
      matchMedia.mockRestore();
    } finally {
      delete (Element.prototype as Partial<Element>).animate;
    }
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

  // An icon's half in dial units (100 across) on a dial of `dial` px; with its game outline (half the stroke outside each side).
  const half = (px: number, dial: number, outline = true) => ((px * (outline ? 1 + OUTLINE / 512 : 1)) / 2 / dial) * 100;
  const fromCentre = (p: { x: number; y: number }) => Math.hypot(p.x - 50, p.y - 50);

  it("keeps the season icons at least 4 px apart, at each of the dial's sizes", () => {
    for (const dial of DIAL_PX) {
      const px = (s: (typeof WHEEL_SEASONS)[number]) => ({ x: (ICON_AT[s].x / 100) * dial, y: (ICON_AT[s].y / 100) * dial });
      for (let i = 0; i < 4; i++) {
        const a = px(WHEEL_SEASONS[i]!);
        const b = px(WHEEL_SEASONS[(i + 1) % 4]!);
        // Two square icons, upright: apart when the larger of the two axes' distances exceeds an icon by 4 px.
        expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) - ICON_PX[dial] * (1 + OUTLINE / 512), `${dial}`).toBeGreaterThanOrEqual(4);
      }
    }
    expect(DIAL_PX).toEqual([96, 108, 144]);
    expect(ICON_PX).toEqual({ 96: 14, 108: 16, 144: 20 });
  });

  it("keeps 15% of the ring clear on each side of the season icons, and of the centre disc about its icons, at each size (#930)", () => {
    // The seasons' ring is 23 units wide (#930's open point 3): the centre disc at 17.
    expect(TIME_DISC).toBe(17);
    const ring = DISC - TIME_DISC;
    for (const dial of DIAL_PX) {
      for (const s of WHEEL_SEASONS) {
        const r = fromCentre(ICON_AT[s]);
        // The glyph's own box (as #930 counts it) 15% of the ring clear of either disc, its outline clear of the small stones.
        expect(r - half(ICON_PX[dial], dial, false) - TIME_DISC, `${dial} ${s} inside`).toBeGreaterThanOrEqual(0.15 * ring);
        expect(DISC - r - half(ICON_PX[dial], dial, false), `${dial} ${s} outside`).toBeGreaterThanOrEqual(0.15 * ring);
        expect(r - half(ICON_PX[dial], dial) - PEBBLE_BAND[1], `${dial} ${s} stones`).toBeGreaterThan(0);
      }
      for (const turn of CENTRE_TURNS) {
        const icons = TIME_ICON_AT[turn];
        // The same way on the centre disc: 15% of its radius clear of its rim.
        for (const t of ["day", "night"] as const) expect(TIME_DISC - fromCentre(icons[t]) - half(TIME_ICON_PX[dial], dial, false), `${dial} ${turn} ${t}`).toBeGreaterThanOrEqual(0.15 * TIME_DISC);
        // And the two, outlines included, at least 2 px apart (4 px on the 20-unit disc of #909).
        const gap = Math.hypot(icons.day.x - icons.night.x, icons.day.y - icons.night.y);
        expect(((gap - 2 * half(TIME_ICON_PX[dial], dial)) / 100) * dial, `${dial} ${turn}`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("keeps the stars, the clouds and the birds on the centre disc, in their halves, off its icons, as far as they drift (#930)", () => {
    /** Clockwise from the top, in degrees. */
    const bearing = (x: number, y: number) => ((Math.atan2(x - 50, 50 - y) * 180) / Math.PI + 360) % 360;
    for (const d of DECOR) {
      const rad = (d.rot * Math.PI) / 180;
      // A point of the decoration's own frame (about its anchor, turned by `rot`) on the dial, and back.
      const out = (u: number, v: number) => [d.x + u * Math.cos(rad) - v * Math.sin(rad), d.y + u * Math.sin(rad) + v * Math.cos(rad)] as const;
      const back = (x: number, y: number) => [(x - d.x) * Math.cos(rad) + (y - d.y) * Math.sin(rad), -(x - d.x) * Math.sin(rad) + (y - d.y) * Math.cos(rad)] as const;
      const { x0, x1, y0, y1 } = d.box;
      // The clouds and the birds drift on the disc by `DRIFT` and back: swept in tenths.
      const steps = d.kind === "star" ? [0] : Array.from({ length: 11 }, (_, i) => i / 10);
      for (const t of steps) {
        for (const [u, v] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]] as const) {
          const [ox, oy] = out(u, v);
          const [x, y] = [ox + t * DRIFT.x, oy + t * DRIFT.y];
          expect(Math.hypot(x - 50, y - 50), `${d.kind} at ${d.d}`).toBeLessThan(TIME_DISC - 0.2);
          // By day before dusk (225°), by night after it.
          const deg = bearing(x, y);
          expect(d.kind === "star" ? deg > 225 : deg < 225, `${d.kind} at ${d.d}: ${deg}°`).toBe(true);
        }
        // The icons turn upright on the turning disc: each is taken as a round of its half, outline included, at the largest
        // share of the dial (96 px). The "against" layout is the mirror of this one, so the same test holds for it.
        for (const icon of ["day", "night"] as const) {
          // The decoration drifted by t is the icon moved back by t.
          const [u, v] = back(TIME_ICON_AT.with[icon].x - t * DRIFT.x, TIME_ICON_AT.with[icon].y - t * DRIFT.y);
          const gap = Math.hypot(Math.max(x0 - u, 0, u - x1), Math.max(y0 - v, 0, v - y1));
          for (const dial of DIAL_PX) expect(gap, `${d.kind} at ${d.d} drifted ${t}, the ${icon} icon at ${dial}`).toBeGreaterThan(half(TIME_ICON_PX[dial], dial));
        }
      }
    }
    expect(TIME_ICON_AT.against.day).toEqual({ x: 100 - TIME_ICON_AT.with.day.x, y: TIME_ICON_AT.with.day.y });
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
    expect([...container.querySelectorAll("[data-sky]")].map((e) => e.getAttribute("data-sky"))).toEqual(["seasons", "time"]);
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

  it("turned against the seasons (#930, to try), mirrors the centre disc so its day is under the needle exactly while the cycle is in day", () => {
    const { rerender, container } = render(<SeasonWheel state="auto" point={{ season: "summer", position: 0 }} centreTurn="against" />);
    // Turning clockwise, the point under the needle is the drawing's angle -deg; mirrored, that is the "with" drawing's deg.
    const underNeedleAgainst = (deg: number) => ((((deg % 360) + 360) % 360) / 360 < DAY_SHARE ? "day" : "night");
    let last = { seasons: angle(container, "dial-disc"), time: angle(container, "time-disc") };
    for (const season of SEASONS) {
      for (let i = 0; i < 40; i++) {
        const point = { season, position: i / 40 };
        rerender(<SeasonWheel state="auto" point={point} centreTurn="against" />);
        const now = { seasons: angle(container, "dial-disc"), time: angle(container, "time-disc") };
        expect(underNeedleAgainst(now.time), `${season} ${point.position}`).toBe(isNight(point) ? "night" : "day");
        // The seasons' disc still counterclockwise, the centre's clockwise, four times as fast, each only forward.
        expect(now.seasons).toBeLessThanOrEqual(last.seasons);
        expect(now.time).toBeGreaterThanOrEqual(last.time);
        expect(now.time).toBeCloseTo(-4 * now.seasons);
        last = now;
      }
    }
    expect(screen.getByRole("button")).toHaveAttribute("data-centre-turn", "against");
    expect(container.querySelector<HTMLElement>("[data-time-disc] > span")!.style.transform).toBe("scaleX(-1)");
    expect(angle(container, "time-icons")).toBe(angle(container, "time-disc"));
    // A fixed season: the middle of its day under the needle, as turning with the seasons.
    rerender(<SeasonWheel state="autumn" centreTurn="against" />);
    expect(angle(container, "time-disc") % 360).toBe(360 * (DAY_SHARE / 2));
  });

  it("turns the centre disc with the seasons' disc by default, today's way, unmirrored", () => {
    const { container } = render(<SeasonWheel state="autumn" />);
    expect(screen.getByRole("button")).toHaveAttribute("data-centre-turn", "with");
    expect(container.querySelector<HTMLElement>("[data-time-disc] > span")!.style.transform).toBe("");
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
