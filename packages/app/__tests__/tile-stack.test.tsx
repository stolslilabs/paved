import { act, cleanup, render, screen } from "@testing-library/react";
import { LazyMotion, domMax } from "motion/react";
import { StrictMode, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HINT_IDLE_MS, TileStack } from "../src/components/containers/tile-stack";
import { planCode } from "../src/components/elements/tile-chip";
import type { TileRenders } from "../src/components/elements/tile-render";

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

// #679: the coming tiles in the voxel look of the board and the hand, from the build-time top-down renders.
describe("the coming tiles' renders", () => {
  // The fake lists plan 3's top-down render in themes 0 and 1, plan 7's in the base models only, none for the others.
  const key3 = planCode(3).toLowerCase();
  const key7 = planCode(7).toLowerCase();
  const renders: TileRenders = (theme, key) =>
    key === `${key3}-top` && theme <= 1 ? `/r/${key}.${theme}.webp` : key === `${key7}-top` && theme === 0 ? `/r/${key}.0.webp` : null;
  const queue = (props: Partial<Parameters<typeof TileStack>[0]> = {}) =>
    render(wrap(<TileStack tile={{ plan: 1, orientation: 2 }} state="placing" remaining={20} coming={[{ plan: 3 }, { plan: 7 }]} renders={renders} {...props} />));
  const slot = (n: number | string) => screen.getByTestId("coming-tiles").querySelector(`[data-coming="${n}"]`)!;

  it("draws each coming tile's top-down render, unturned, in the base models without a skin, at the chip's size", () => {
    queue();
    for (const [n, key] of [[1, key3], [2, key7]] as const) {
      const frame = slot(n).querySelector('[data-view="render"]')!;
      expect(frame.getAttribute("data-theme")).toBe("0");
      expect(frame.className).toContain("size-14");
      const img = frame.querySelector("img")!;
      expect(img.getAttribute("src")).toBe(`/r/${key}-top.0.webp`);
      expect(img.getAttribute("style")).toBeNull();
    }
    expect(screen.getByRole("img", { name: "Tile 3" })).toBeTruthy();
  });

  it("each plan in the theme the board draws it in; the base models where the skin has no render", () => {
    queue({ skins: { [key3]: 1, [key7]: 1 } });
    expect(slot(1).querySelector("img")!.getAttribute("src")).toBe(`/r/${key3}-top.1.webp`);
    expect(slot(2).querySelector("img")!.getAttribute("src")).toBe(`/r/${key7}-top.0.webp`);
  });

  it("the chip with the board's art where the manifest lists no render, or without renders", () => {
    queue({ coming: [{ plan: 3 }, { plan: 12 }], tileArt: (k) => `/art/${k}.png` });
    expect(slot(1).querySelector('[data-view="render"]')).toBeTruthy();
    expect(slot(2).querySelector('[data-view="art"] img')!.getAttribute("src")).toBe(`/art/${planCode(12).toLowerCase()}.png`);
    cleanup();
    queue({ renders: undefined });
    expect(screen.getByTestId("coming-tiles").querySelectorAll('[data-view="render"]')).toHaveLength(0);
    expect(slot(1).querySelector('[role="img"]')!.getAttribute("aria-label")).toBe(`Tile ${key3}, north`);
  });

  it("the drawing slot and the tile to place are unchanged", () => {
    queue({ state: "pending", coming: [{ plan: 3 }], drawing: true });
    expect(slot("drawing").querySelector('[role="img"]')!.getAttribute("aria-label")).toBe("The chain draws this tile");
    expect(screen.getByRole("img", { name: /, east$/ }).closest("[data-stack-top]")).toBeTruthy();
  });
});
