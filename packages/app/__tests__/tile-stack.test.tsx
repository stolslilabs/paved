import { act, cleanup, render, screen } from "@testing-library/react";
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

// #645: the tile to place, and the two coming tiles smaller beside it, read only.
describe("the coming tiles", () => {
  const queue = (props: Partial<Parameters<typeof TileStack>[0]> = {}) =>
    render(wrap(<TileStack tile={{ plan: 1, orientation: 2 }} state="placing" remaining={20} {...props} />));
  const slots = () => [...(screen.queryByTestId("coming-tiles")?.querySelectorAll("li") ?? [])];

  it("shows the next two in draw order, the next first, as tiles only (nothing to press)", () => {
    queue({ coming: [{ plan: 3 }, { plan: 7 }] });
    expect(screen.getByRole("list", { name: "Coming tiles" })).toBeTruthy();
    expect(slots().map((li) => li.getAttribute("data-coming"))).toEqual(["1", "2"]);
    expect(slots()[0]!.textContent).toContain("Next");
    expect(slots().flatMap((li) => [...li.querySelectorAll("button")])).toEqual([]);
    // The tile to place keeps its rotation; the coming ones are drawn unturned.
    const turns = screen.getAllByRole("img").map((i) => i.getAttribute("aria-label")!.split(", ")[1]);
    expect(turns).toEqual(["north", "north", "east"]);
  });

  it("nothing beside the stack when no tile is known after the one to place", () => {
    queue();
    expect(screen.queryByTestId("coming-tiles")).toBeNull();
  });

  it("the last tiles: one coming, then none", () => {
    queue({ coming: [{ plan: 3 }] });
    expect(slots()).toHaveLength(1);
  });

  it("the chain drawing: the known tiles, then a waiting slot; never more than two", () => {
    queue({ state: "pending", coming: [{ plan: 3 }], drawing: true });
    expect(slots().map((li) => li.getAttribute("data-coming"))).toEqual(["1", "drawing"]);
    expect(screen.getByRole("img", { name: "The chain draws this tile" })).toBeTruthy();
    cleanup();
    queue({ coming: [{ plan: 3 }, { plan: 7 }], drawing: true });
    expect(slots().map((li) => li.getAttribute("data-coming"))).toEqual(["1", "2"]);
  });
});
