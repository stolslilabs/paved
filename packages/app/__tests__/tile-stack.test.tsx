import { act, render, screen } from "@testing-library/react";
import { LazyMotion, domMax } from "motion/react";
import { StrictMode, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HINT_IDLE_MS, TileStack } from "../src/components/containers/tile-stack";

// BUBBLE-DISCARD (issue 606): the hint shows at the start and after a while without a move, never for good.
const wrap = (ui: ReactNode) => (
  <StrictMode>
    <LazyMotion features={domMax}>{ui}</LazyMotion>
  </StrictMode>
);
const stack = (remaining: number, cellChosen = false) => wrap(<TileStack tile={{ plan: 1, orientation: 1 }} state="placing" remaining={remaining} cellChosen={cellChosen} />);
const hint = () => screen.queryByTestId("hand-hint");

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("the tile stack's hint", () => {
  it("shows at the start (StrictMode's second effect run included), hides after a move, and comes back after HINT_IDLE_MS", () => {
    const { rerender } = render(stack(38));
    expect(hint()).toHaveTextContent("Tap a lit slot on the board.");
    rerender(stack(37));
    expect(hint()).toBeNull();
    act(() => vi.advanceTimersByTime(HINT_IDLE_MS - 1));
    expect(hint()).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(hint()).toHaveTextContent("Tap a lit slot on the board.");
  });

  it("hides while a cell is chosen, and does not come back meanwhile", () => {
    const { rerender } = render(stack(38));
    rerender(stack(38, true));
    expect(hint()).toBeNull();
    act(() => vi.advanceTimersByTime(HINT_IDLE_MS * 2));
    expect(hint()).toBeNull();
  });
});
