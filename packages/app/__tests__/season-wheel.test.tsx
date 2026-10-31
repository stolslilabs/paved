import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_DAYNIGHT_SETTINGS, DAY_PHASE_AT, SEASONS } from "@paved/renderer";
// The cycle's own chunk, from its source: the renderer's barrel does not export its keyframes.
import { DAY_SHARE as RENDERER_DAY_SHARE, KEYFRAMES } from "../../renderer/src/core/daynight";
import { DAY_AT, DAY_SHARE, WHEEL_SEASONS, initialWheelRound, isNight, nextWheelRound, useSeasonWheel, type WheelRound, wheelDayNight } from "../src/data/season-wheel";
import { CENTRE_TURNS, DIAL_PX, NIGHT_ENDS, RING, SeasonWheel, TIME_DISC, TIME_ICON_AT, TIME_ICON_RADIUS, TIME_ICON_SIZE, TIME_TURNS_PER_YEAR } from "../src/components/elements/season-wheel";

// The season wheel (#547), painted art since V4-WHEEL-ART: its states, what each asks of the renderer, its layers, and the element.

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


describe("the season dial's art (V4-WHEEL-ART)", () => {
  const theme = readFileSync(resolve(import.meta.dirname, "../src/styles/theme.css"), "utf8");
  const token = (name: string) => theme.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1]?.trim();
  const ART = resolve(import.meta.dirname, "../src/assets/season-wheel");

  it("keeps the sky tokens the 3D cycle's, its keyframes' top and bottom", () => {
    for (const season of SEASONS) {
      for (const phase of ["day", "night"] as const) {
        expect(token(`sky-${season}-${phase}-top`)?.toLowerCase(), `${season} ${phase} top`).toBe(KEYFRAMES[season][phase].top.toLowerCase());
        expect(token(`sky-${season}-${phase}-bottom`)?.toLowerCase(), `${season} ${phase} bottom`).toBe(KEYFRAMES[season][phase].bottom.toLowerCase());
      }
    }
    // The drawn dial's tokens left with it: the art carries its own colours.
    expect(theme).not.toMatch(/--dial-|dial-twinkle/);
  });

  it("stacks its layers bottom to top, each a whole canvas from this host, decorative", () => {
    const { container } = render(<SeasonWheel state="auto" />);
    const layers = [...container.querySelectorAll<HTMLImageElement>("img[data-layer]")];
    expect(layers.map((l) => l.dataset.layer)).toEqual(["season-ring", "time-disc", "shade", "inner-bezel", "frame", "pointer", "hub"]);
    for (const img of [...container.querySelectorAll<HTMLImageElement>("img")]) {
      expect(img.getAttribute("src"), img.dataset.layer).not.toMatch(/^(https?:)?\/\//);
      expect(img).toHaveAttribute("alt", "");
      expect(img).toHaveAttribute("draggable", "false");
    }
    for (const l of layers) expect(l).toHaveClass("absolute", "inset-0", "size-full");
  });

  it("ships its art as WebP, light enough for a HUD widget", () => {
    const files = readdirSync(ART).filter((f) => f.endsWith(".webp"));
    expect(files.sort()).toEqual(["frame", "hub", "icon-moon", "icon-sun", "inner-bezel", "pointer", "season-ring", "shade", "time-disc"].map((n) => `${n}.webp`));
    const total = files.reduce((sum, f) => sum + statSync(resolve(ART, f)).size, 0);
    expect(total).toBeLessThan(250 * 1024);
  });

  it("turns only the seasons' ring and the day and night disc; the rest stays still", () => {
    const { container } = render(<SeasonWheel state="auto" point={{ season: "autumn", position: 0.4 }} />);
    expect(container.querySelector("[data-dial-disc] [data-layer=season-ring]")).not.toBeNull();
    expect(container.querySelector("[data-time-disc] [data-layer=time-disc]")).not.toBeNull();
    for (const name of ["shade", "inner-bezel", "frame", "pointer", "hub"]) {
      const layer = container.querySelector<HTMLElement>(`[data-layer=${name}]`)!;
      expect(layer.closest("[data-dial-disc], [data-time-disc], [data-time-icons]"), name).toBeNull();
      expect(layer.style.transform, name).toBe("");
    }
  });

  /** Clockwise from the top, in degrees. */
  const bearing = (p: { x: number; y: number }) => ((Math.atan2(p.x - 50, 50 - p.y) * 180) / Math.PI + 360) % 360;

  it("sets the sun in the middle of the disc's day and the moon in the middle of its night, as painted, each way it turns", () => {
    // Painted to turn clockwise: its night from the top to 135°, its day from there round to the top.
    expect(NIGHT_ENDS).toBe(135);
    expect(bearing(TIME_ICON_AT.against.night)).toBeCloseTo(67.5);
    expect(bearing(TIME_ICON_AT.against.day)).toBeCloseTo(247.5);
    // Mirrored, turning with the ring.
    expect(bearing(TIME_ICON_AT.with.night)).toBeCloseTo(292.5);
    expect(bearing(TIME_ICON_AT.with.day)).toBeCloseTo(112.5);
    // Both round, inside the disc clear of the inner gold ring, clear of the hub (r 4), and apart.
    for (const turn of CENTRE_TURNS) {
      for (const t of ["day", "night"] as const) {
        const p = TIME_ICON_AT[turn][t];
        expect(Math.hypot(p.x - 50, p.y - 50) + TIME_ICON_SIZE / 2, `${turn} ${t}`).toBeLessThan(TIME_DISC);
      }
    }
    expect(TIME_ICON_RADIUS - TIME_ICON_SIZE / 2).toBeGreaterThan(4);
    expect(TIME_ICON_RADIUS * 2).toBeGreaterThan(TIME_ICON_SIZE);
    // The seasons' ring shows between the two gold rings.
    expect(RING[0]).toBeGreaterThan(TIME_DISC);
    expect(RING[1]).toBeLessThanOrEqual(40);
  });
});

describe("<SeasonWheel>", () => {
  it("names its state and time of day, is the 96 px dial (108 px from 390 px wide), and calls onNext on a click", () => {
    const onNext = vi.fn();
    const { container } = render(<SeasonWheel state="winter" onNext={onNext} />);
    const button = screen.getByRole("button", { name: /winter day/ });
    expect(container.querySelector(".size-24")).not.toBeNull();
    expect(DIAL_PX).toEqual([96, 108, 144]);
    fireEvent.click(button);
    expect(onNext).toHaveBeenCalledOnce();
  });

  it("shows no auto or fixed mark, only its layers and one pointer (#909)", () => {
    const { rerender, container } = render(<SeasonWheel state="auto" point={{ season: "autumn", position: 0.3 }} />);
    expect(screen.getByRole("button", { name: /automatic, now autumn day/ })).toBeTruthy();
    expect(container.querySelectorAll("[data-layer=pointer]")).toHaveLength(1);
    expect(container.querySelector("[data-centre], [data-now], [data-sector]")).toBeNull();
    // A fixed state draws the same dial: only its name, its state and its angles differ.
    const drawing = () => container.innerHTML.replace(/(aria-label|title|data-state)="[^"]*"/g, "").replace(/rotate\([^)]*\)/g, "");
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

  const angle = (el: Element | null) => Number((el as HTMLElement).style.transform.match(/^rotate\((-?[\d.]+)deg\)$/)![1]);
  const layer = (c: HTMLElement, name: string) => angle(c.querySelector(`[data-${name}]`));
  /**
   * What the pointer's inner notch is on: the disc as painted (its night from the top to `NIGHT_ENDS`, clockwise) turned by `deg`;
   * mirrored, when it turns with the ring, the painting's angle under the notch is the other way round. The top itself is dawn,
   * the day's first moment; `NIGHT_ENDS` is dusk, the night's.
   */
  const underNotch = (deg: number, turn: (typeof CENTRE_TURNS)[number] = "against") => {
    const painted = (((turn === "against" ? -deg : deg) % 360) + 360) % 360;
    return painted > 0 && painted <= NIGHT_ENDS ? "night" : "day";
  };

  it("turns the centre disc four times for one turn of the seasons' ring, the other way, the sun and moon upright", () => {
    expect(TIME_TURNS_PER_YEAR).toBe(4);
    const { rerender, container } = render(<SeasonWheel state="auto" point={{ season: "summer", position: 0.1 }} />);
    const start = { seasons: layer(container, "dial-disc"), time: layer(container, "time-disc") };
    rerender(<SeasonWheel state="auto" point={{ season: "autumn", position: 0.6 }} />);
    const seasons = layer(container, "dial-disc") - start.seasons;
    const time = layer(container, "time-disc") - start.time;
    expect(seasons).toBeCloseTo(-135);
    expect(time).toBeCloseTo(-4 * seasons);
    expect(layer(container, "time-icons")).toBe(layer(container, "time-disc"));
    for (const t of ["day", "night"]) expect(angle(container.querySelector(`[data-time-icon=${t}]`)), t).toBe(-layer(container, "time-disc"));
  });

  it("holds the disc's day under the notch exactly while the cycle is in day, both discs only turning forward", () => {
    const { rerender, container } = render(<SeasonWheel state="auto" point={{ season: "summer", position: 0 }} />);
    let last = { seasons: layer(container, "dial-disc"), time: layer(container, "time-disc") };
    for (const season of SEASONS) {
      for (let i = 0; i < 40; i++) {
        const point = { season, position: i / 40 };
        rerender(<SeasonWheel state="auto" point={point} />);
        const now = { seasons: layer(container, "dial-disc"), time: layer(container, "time-disc") };
        expect(underNotch(now.time), `${season} ${point.position}`).toBe(isNight(point) ? "night" : "day");
        // The ring counterclockwise, the disc clockwise, four times as fast, each only forward.
        expect(now.seasons).toBeLessThanOrEqual(last.seasons);
        expect(now.time).toBeGreaterThanOrEqual(last.time);
        expect(now.time).toBeCloseTo(-4 * now.seasons);
        last = now;
      }
    }
    expect(screen.getByRole("button")).toHaveAttribute("data-centre-turn", "against");
    expect(container.querySelector("[data-layer=time-disc]")).not.toHaveClass("-scale-x-100");
  });

  it("turned with the ring, mirrors the disc so its day is under the notch exactly while the cycle is in day", () => {
    const { rerender, container } = render(<SeasonWheel state="auto" point={{ season: "summer", position: 0 }} centreTurn="with" />);
    for (const season of SEASONS) {
      for (let i = 0; i < 40; i++) {
        const point = { season, position: i / 40 };
        rerender(<SeasonWheel state="auto" point={point} centreTurn="with" />);
        expect(underNotch(layer(container, "time-disc"), "with"), `${season} ${point.position}`).toBe(isNight(point) ? "night" : "day");
        expect(layer(container, "time-disc")).toBeCloseTo(4 * layer(container, "dial-disc"));
      }
    }
    expect(screen.getByRole("button")).toHaveAttribute("data-centre-turn", "with");
    expect(container.querySelector("[data-layer=time-disc]")).toHaveClass("-scale-x-100");
  });

  it("rests a fixed season under the pointer in the middle of its day, and only ever turns one way", () => {
    const { rerender, container } = render(<SeasonWheel state="autumn" />);
    expect(layer(container, "dial-disc")).toBe(-118.125);
    // The middle of the disc's day under the notch: the painting's 247.5°.
    expect(layer(container, "time-disc")).toBe(472.5);
    expect((((-layer(container, "time-disc")) % 360) + 360) % 360).toBe((NIGHT_ENDS + 360) / 2);
    rerender(<SeasonWheel state="spring" />);
    expect(layer(container, "dial-disc")).toBe(-298.125);
    rerender(<SeasonWheel state="auto" point={{ season: "summer", position: 0.5 }} />);
    // Summer again is on from spring (a turn past it, half a season in), not a step back.
    expect(layer(container, "dial-disc")).toBe(-405);
    rerender(<SeasonWheel state="auto" point={{ season: "summer", position: 0.75 }} />);
    expect(layer(container, "dial-disc")).toBe(-427.5);
    expect(layer(container, "time-disc")).toBe(1710);
  });

  it("turns both discs forward through a whole tap round, from the last fixed season on to auto", () => {
    let round = initialWheelRound(true);
    const point = { season: "autumn" as const, position: 0.8 };
    const { rerender, container } = render(<SeasonWheel state={round.state} point={point} />);
    let last = { seasons: layer(container, "dial-disc"), time: layer(container, "time-disc") };
    for (let i = 0; i < 5; i++) {
      round = nextWheelRound(round, point.season);
      rerender(<SeasonWheel state={round.state} point={point} />);
      const now = { seasons: layer(container, "dial-disc"), time: layer(container, "time-disc") };
      expect(now.seasons, round.state).toBeLessThanOrEqual(last.seasons);
      expect(now.time, round.state).toBeGreaterThanOrEqual(last.time);
      last = now;
    }
    // Back on auto, a full year on from where it started.
    expect(round.state).toBe("auto");
    expect(last.seasons).toBeCloseTo(-1.8 * 90 - 360);
  });
});
