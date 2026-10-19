import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_DAYNIGHT_SETTINGS, DAY_PHASE_AT, SEASONS } from "@paved/renderer";
import { DAY_AT, WHEEL_SEASONS, WHEEL_STATES, initialWheelState, nextWheelState, useSeasonWheel, wheelDayNight } from "../src/data/season-wheel";
import { SeasonWheel } from "../src/components/elements/season-wheel";

// The season wheel (#547): its states, what each asks of the renderer, and the element.

describe("the season wheel's states", () => {
  it("repeats the renderer's seasons and day moment", () => {
    expect([...WHEEL_SEASONS]).toEqual([...SEASONS]);
    expect(DAY_AT).toBe(DAY_PHASE_AT.day);
  });

  it("goes auto, summer, autumn, winter, spring, auto", () => {
    const seen = [WHEEL_STATES[0]!];
    for (let i = 0; i < 5; i++) seen.push(nextWheelState(seen.at(-1)!));
    expect(seen).toEqual(["auto", "summer", "autumn", "winter", "spring", "auto"]);
  });

  it("starts from the setting: auto when the cycle is on, summer when it is off", () => {
    expect(initialWheelState(true)).toBe("auto");
    expect(initialWheelState(false)).toBe("summer");
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
    act(() => result.current.next());
    expect(result.current.state).toBe("summer");
    rerender({ on: true, game: 2 });
    expect(result.current.state).toBe("auto");
    act(() => result.current.next());
    rerender({ on: false, game: 2 });
    expect(result.current.state).toBe("summer");
  });
});

describe("<SeasonWheel>", () => {
  it("names its state, is at least 44 px, and calls onNext on a click", () => {
    const onNext = vi.fn();
    render(<SeasonWheel state="winter" onNext={onNext} />);
    const button = screen.getByRole("button", { name: /winter day/ });
    expect(button.className).toContain("size-11");
    fireEvent.click(button);
    expect(onNext).toHaveBeenCalledOnce();
  });

  it("marks auto with a centre marker that a fixed state does not have", () => {
    const { rerender, container } = render(<SeasonWheel state="auto" point={{ season: "autumn", position: 0.3 }} />);
    expect(screen.getByRole("button", { name: /automatic, now autumn/ })).toBeTruthy();
    expect(container.querySelector("[data-centre=auto]")).not.toBeNull();
    rerender(<SeasonWheel state="summer" />);
    expect(container.querySelector("[data-centre=fixed]")).not.toBeNull();
    expect(container.querySelector("[data-centre=auto]")).toBeNull();
  });

  it("rests the current season at the top, and only ever turns one way", () => {
    const ring = (c: HTMLElement) => c.querySelector<HTMLElement>("[aria-hidden]")!.style.transform;
    const { rerender, container } = render(<SeasonWheel state="autumn" />);
    expect(ring(container)).toBe("rotate(-90deg)");
    rerender(<SeasonWheel state="spring" />);
    expect(ring(container)).toBe("rotate(-270deg)");
    rerender(<SeasonWheel state="auto" point={{ season: "summer", position: 0.5 }} />);
    // Summer again is on from spring (a turn past it, half a season in), not a step back.
    expect(ring(container)).toBe("rotate(-405deg)");
    rerender(<SeasonWheel state="auto" point={{ season: "summer", position: 0.75 }} />);
    expect(ring(container)).toBe("rotate(-427.5deg)");
  });
});
