import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_DAYNIGHT_SETTINGS, DAY_PHASE_AT, SEASONS } from "@paved/renderer";
// The cycle's own chunk, from its source: the renderer's barrel does not export its keyframes.
import { DAY_SHARE as RENDERER_DAY_SHARE, KEYFRAMES } from "../../renderer/src/core/daynight";
import { DAY_AT, DAY_SHARE, WHEEL_SEASONS, initialWheelRound, isNight, nextWheelRound, useSeasonWheel, type WheelRound, wheelDayNight } from "../src/data/season-wheel";
import { DIAL_PX, ICON_AT, ICON_PX, SEASON_GLYPH, SeasonWheel } from "../src/components/elements/season-wheel";
import { OUTLINE } from "../src/components/elements/game-icon";

/** A game icon's tones: each has its own gradient, its id ending with the tone's name. */
const paletteTones = (svg: Element) => [...svg.querySelectorAll("linearGradient")].map((g) => g.id.match(/[a-z]+$/)![0]);

// The season wheel (#547), a crafted dial since #607: its states, what each asks of the renderer, its colours, and the element.

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

  // Five taps from a round, the auto cycle's season given on each tap (only the first, from auto, uses it).
  const taps = (from: WheelRound, now: (typeof WHEEL_SEASONS)[number] | null) => {
    const seen = [from];
    for (let i = 0; i < 5; i++) seen.push(nextWheelRound(seen.at(-1)!, now));
    return seen.map((r) => r.state);
  };

  it("goes from auto to the next season not yet started, then forward, and back to auto on the fourth tap (#634)", () => {
    const auto = initialWheelRound(true);
    // Five taps: the fourth is auto, the fifth starts a new round from the cycle's season.
    expect(taps(auto, "summer")).toEqual(["auto", "autumn", "winter", "spring", "auto", "autumn"]);
    expect(taps(auto, "autumn")).toEqual(["auto", "winter", "spring", "summer", "auto", "winter"]);
    expect(taps(auto, "winter")).toEqual(["auto", "spring", "summer", "autumn", "auto", "spring"]);
    expect(taps(auto, "spring")).toEqual(["auto", "summer", "autumn", "winter", "auto", "summer"]);
    // The cycle not drawn yet: the dial rests on summer's day, so autumn is the next to come.
    expect(taps(auto, null)).toEqual(["auto", "autumn", "winter", "spring", "auto", "autumn"]);
  });

  it("reads the cycle's season only on the tap from auto: a round keeps its course whatever the cycle says after", () => {
    let round = nextWheelRound(initialWheelRound(true), "winter");
    expect(round.state).toBe("spring");
    round = nextWheelRound(round, "summer");
    expect(round.state).toBe("summer");
    round = nextWheelRound(round, "spring");
    expect(round.state).toBe("autumn");
    expect(nextWheelRound(round, "autumn")).toEqual({ state: "auto", last: null });
  });

  it("starts from the setting: auto when the cycle is on, summer when it is off, whose round ends with spring", () => {
    expect(initialWheelRound(true).state).toBe("auto");
    expect(initialWheelRound(false).state).toBe("summer");
    expect(taps(initialWheelRound(false), "winter")).toEqual(["summer", "autumn", "winter", "spring", "auto", "spring"]);
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

  it("paints each season's day and night with the 3D cycle's sky, its keyframes' top and bottom", () => {
    for (const season of SEASONS) {
      for (const phase of ["day", "night"] as const) {
        expect(token(`sky-${season}-${phase}-top`)?.toLowerCase(), `${season} ${phase} top`).toBe(KEYFRAMES[season][phase].top.toLowerCase());
        expect(token(`sky-${season}-${phase}-bottom`)?.toLowerCase(), `${season} ${phase} bottom`).toBe(KEYFRAMES[season][phase].bottom.toLowerCase());
      }
    }
  });

  it("draws each season's icon and the now badge as game icons, in their own tones (#870)", () => {
    const { container } = render(<SeasonWheel state="auto" point={{ season: "summer", position: 0.8 }} />);
    for (const season of SEASONS) {
      const icon = container.querySelector(`[data-season=${season}] [data-slot=game-icon]`);
      expect(icon, season).toHaveAttribute("data-icon", SEASON_GLYPH[season]);
    }
    expect(container.querySelector("[data-now] [data-slot=game-icon]")).toHaveAttribute("data-icon", "moon");
    expect(paletteTones(container.querySelector("[data-season=winter] svg")!)).toEqual(["ice"]);
    expect(paletteTones(container.querySelector("[data-season=autumn] svg")!)).toEqual(["orange"]);
  });

  it("tones its gold down into the stones, the rim and pointer more than the hub's mark (#634)", () => {
    const share = (name: string) => Number(token(name)?.match(/^color-mix\(in oklab, var\(--primary\) (\d+)%, var\(--color-charcoal-600\)\)$/)?.[1]);
    expect(share("dial-rim")).toBeLessThan(share("dial-mark"));
    expect(share("dial-mark")).toBeLessThan(80);
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

  it("marks auto with a centre marker that a fixed state does not have", () => {
    const { rerender, container } = render(<SeasonWheel state="auto" point={{ season: "autumn", position: 0.3 }} />);
    expect(screen.getByRole("button", { name: /automatic, now autumn day/ })).toBeTruthy();
    expect(container.querySelector("[data-centre=auto]")).not.toBeNull();
    rerender(<SeasonWheel state="summer" />);
    expect(container.querySelector("[data-centre=fixed]")).not.toBeNull();
    expect(container.querySelector("[data-centre=auto]")).toBeNull();
  });

  it("shows the sun by day and the moon by night, a fixed season by day, names both, and writes nothing (#634)", () => {
    const now = (c: HTMLElement) => c.querySelector("[data-now]")?.getAttribute("data-now");
    const { rerender, container } = render(<SeasonWheel state="auto" point={{ season: "spring", position: 0.3 }} />);
    expect(now(container)).toBe("day");
    rerender(<SeasonWheel state="auto" point={{ season: "spring", position: 0.8 }} />);
    expect(now(container)).toBe("night");
    expect(screen.getByRole("button", { name: /now spring night/ })).toBeTruthy();
    expect(container.textContent).toBe("");
    rerender(<SeasonWheel state="winter" />);
    expect(now(container)).toBe("day");
    expect(screen.getByRole("button", { name: /winter day/ })).toBeTruthy();
    expect(container.textContent).toBe("");
  });

  it("splits each season's quarter into its day and its night", () => {
    const { container } = render(<SeasonWheel state="auto" />);
    expect([...container.querySelectorAll("[data-sector]")].map((e) => e.getAttribute("data-sector"))).toEqual(SEASONS.flatMap((s) => [`${s}-day`, `${s}-night`]));
  });

  it("rests a fixed season's day under the pointer, and only ever turns one way", () => {
    const disc = (c: HTMLElement) => c.querySelector<HTMLElement>("[data-dial-disc]")!.style.transform;
    const { rerender, container } = render(<SeasonWheel state="autumn" />);
    expect(disc(container)).toBe("rotate(-118.125deg)");
    rerender(<SeasonWheel state="spring" />);
    expect(disc(container)).toBe("rotate(-298.125deg)");
    rerender(<SeasonWheel state="auto" point={{ season: "summer", position: 0.5 }} />);
    // Summer again is on from spring (a turn past it, half a season in), not a step back.
    expect(disc(container)).toBe("rotate(-405deg)");
    rerender(<SeasonWheel state="auto" point={{ season: "summer", position: 0.75 }} />);
    expect(disc(container)).toBe("rotate(-427.5deg)");
  });
});
