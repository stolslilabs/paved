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

// CHALLENGE-VRF (#645): the tile to place and, beside it, the next two, in order; one not drawn yet pulses.
describe("the tile stack's next tiles", () => {
  const withNext = (next?: (number | null)[], readOnly = false) =>
    wrap(<TileStack tile={{ plan: 1, orientation: 1 }} next={next} state="placing" remaining={30} readOnly={readOnly} />);

  it("shows the next two in order, the first larger", () => {
    render(withNext([13, 7]));
    const items = screen.getByTestId("next-tiles").querySelectorAll("li");
    expect([...items].map((li) => li.getAttribute("data-next-tile"))).toEqual(["13", "7"]);
    expect(items[0]!.getAttribute("aria-label")).toBe("Next tile 1");
  });

  it("marks a tile not drawn yet", () => {
    render(withNext([7, null]));
    const items = screen.getByTestId("next-tiles").querySelectorAll("li");
    expect(items[1]!.getAttribute("data-next-tile")).toBe("pending");
    expect(items[1]!.getAttribute("aria-label")).toBe("Not drawn yet");
  });

  it("shows none without a queue (Story) or on a board the viewer does not play", () => {
    const { unmount } = render(withNext(undefined));
    expect(screen.queryByTestId("next-tiles")).toBeNull();
    unmount();
    render(withNext([13, 7], true));
    expect(screen.queryByTestId("next-tiles")).toBeNull();
  });
});
