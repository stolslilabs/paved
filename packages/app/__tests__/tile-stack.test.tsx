import { act, cleanup, render, screen } from "@testing-library/react";
import { LazyMotion, domMax } from "motion/react";
import { StrictMode, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HINT_IDLE_MS, PILE_CAP, TileStack, type StackFrame } from "../src/components/containers/tile-stack";
import type { StackTile } from "../src/components/containers/stack-view";
import { TILT, TURN } from "../src/components/elements/tile-slab";
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

  it("draws each coming tile's top-down render, unturned, in the base models without a skin, filling its slab", () => {
    queue();
    for (const [n, key] of [[1, key3], [2, key7]] as const) {
      const frame = slot(n).querySelector('[data-view="render"]')!;
      expect(frame.getAttribute("data-theme")).toBe("0");
      expect(frame.className).toContain("size-full");
      const img = frame.querySelector("img")!;
      expect(img.getAttribute("src")).toBe(`/r/${key}-top.0.webp`);
      expect(img.getAttribute("style")).toBeNull();
    }
    // The chip's name on the slot (what the Training e2e reads), the image itself decorative.
    expect(slot(1).querySelector('[role="img"]')!.getAttribute("aria-label")).toBe(`Tile ${key3}, north`);
    expect(slot(1).querySelector("img")!.getAttribute("alt")).toBe("");
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

// After Dorfromantik's: the pile is a layer per tile left, up to PILE_CAP, so it sinks as the game goes.
describe("the pile", () => {
  const pile = () => Number(document.querySelector("[data-stack-pile]")!.getAttribute("data-stack-pile"));

  it("is as high as the tiles left, up to PILE_CAP; the badge says the true count", () => {
    const { rerender } = render(stack(PILE_CAP - 2));
    expect(pile()).toBe(PILE_CAP - 2);
    rerender(stack(PILE_CAP + 30));
    expect(pile()).toBe(PILE_CAP);
    expect(screen.getByTestId("tiles-left")).toHaveTextContent(String(PILE_CAP + 30));
  });

  it("a tap on the stack takes its outline, not its box: the deck button is clipped to it", () => {
    render(stack(20));
    expect(screen.getByRole("button", { name: "Tiles left: 20. Show the deck" }).style.clipPath).toMatch(/^polygon\(/);
  });
});

// With the renderer (`renderStack`): the tiles are the 3D view's, by draw order; their names stay for screen readers.
describe("the 3D view", () => {
  const frames: StackFrame[] = [];
  const renderStack = (v: StackFrame) => {
    frames.push(v);
    return <span data-testid="stack-3d" />;
  };
  const queue = (props: Partial<Parameters<typeof TileStack>[0]> = {}) =>
    render(wrap(<TileStack tile={{ plan: 1, orientation: 2 }} state="placing" remaining={20} coming={[{ plan: 3 }, { plan: 7 }]} renderStack={renderStack} {...props} />));
  beforeEach(() => {
    frames.length = 0;
  });

  it("hands it the tile in hand and the coming ones, bottom up, the hand larger; no CSS slab for them", () => {
    queue();
    expect(screen.getByTestId("stack-3d")).toBeTruthy();
    const tiles = frames.at(-1)!.tiles.filter((t) => t.thickness === undefined);
    expect(tiles.map((t) => [t.plan, t.orientation])).toEqual([[3, 1], [7, 1], [1, 2]]);
    const [next, then, hand] = tiles as [StackTile, StackTile, StackTile];
    expect(then.lift).toBeLessThan(next.lift);
    expect(next.lift).toBeLessThan(hand.lift);
    expect(hand.scale).toBeGreaterThan(next.scale);
    expect(screen.getByTestId("coming-tiles").querySelectorAll("[data-view]")).toHaveLength(0);
    expect(screen.getByRole("img", { name: /, east$/ }).closest("[data-stack-top]")).toBeTruthy();
  });

  it("the pile: a real tile of the deck per layer, squashed, under the coming tiles, the same draw each render", () => {
    const pile = () => frames.at(-1)!.tiles.filter((t) => t.thickness !== undefined);
    const { rerender } = queue({ remaining: 4, pilePlans: [5, 9] });
    const first = pile();
    expect(first).toHaveLength(4);
    expect(first.every((t) => [5, 9].includes(t.plan) && t.orientation >= 1 && t.orientation <= 4)).toBe(true);
    expect(first.every((t) => Math.abs(t.yaw ?? 0) <= (7 * Math.PI) / 180)).toBe(true);
    const lowest = Math.min(...frames.at(-1)!.tiles.filter((t) => t.thickness === undefined).map((t) => t.lift));
    expect(Math.max(...first.map((t) => t.lift))).toBeLessThan(lowest);
    // A tile drawn: the pile loses its top layer, the others stay as they were.
    rerender(wrap(<TileStack tile={{ plan: 3, orientation: 1 }} state="placing" remaining={3} coming={[{ plan: 7 }]} renderStack={renderStack} pilePlans={[5, 9]} />));
    expect(pile()).toEqual(first.slice(0, 3));
    cleanup();
    queue({ remaining: PILE_CAP + 30 });
    expect(pile()).toHaveLength(PILE_CAP);
  });

  it("leans toward the view by steps (after Dorfromantik's), each in the stack's angle: the tile in hand to within 10 degrees of straight above, the next halfway, the one after it as the pile", () => {
    queue();
    const [next, then, hand] = frames.at(-1)!.tiles.filter((t) => t.thickness === undefined) as [StackTile, StackTile, StackTile];
    const top = ((TILT - 10) * Math.PI) / 180;
    expect(hand.lean!.angle).toBeCloseTo(top);
    expect(hand.lean!.toward).toBeCloseTo((TURN * Math.PI) / 180);
    expect(next.lean!.angle).toBeCloseTo(top / 2);
    expect(then.lean).toBeUndefined();
    expect([hand.yaw, next.yaw, then.yaw]).toEqual([undefined, undefined, undefined]);
  });

  it("falls back to the CSS slabs when the 3D view cannot start, and stays there", () => {
    const { rerender } = queue();
    expect(screen.getByTestId("stack-3d")).toBeTruthy();
    act(() => frames.at(-1)!.onError());
    expect(screen.queryByTestId("stack-3d")).toBeNull();
    expect(screen.getByTestId("coming-tiles").querySelectorAll('[data-coming="1"] [role="img"]')).toHaveLength(1);
    rerender(wrap(<TileStack tile={{ plan: 1, orientation: 2 }} state="placing" remaining={19} coming={[{ plan: 7 }]} renderStack={renderStack} />));
    expect(screen.queryByTestId("stack-3d")).toBeNull();
  });

  it("the next keeps its id as it becomes the tile in hand, so it glides up", () => {
    const { rerender } = queue();
    const next = frames.at(-1)!.tiles.find((t) => t.plan === 3)!;
    rerender(wrap(<TileStack tile={{ plan: 3, orientation: 1 }} state="placing" remaining={19} coming={[{ plan: 7 }]} renderStack={renderStack} />));
    const hand = frames.at(-1)!.tiles.at(-1)!;
    expect(hand.id).toBe(next.id);
    expect(hand.plan).toBe(3);
  });

  it("the tile in hand is see-through while it is on a cell or its move is on its way; the coming tiles stay as they are", () => {
    const faded = () => frames.at(-1)!.tiles.filter((t) => t.thickness === undefined).map((t) => !!t.faded);
    queue();
    expect(faded()).toEqual([false, false, false]);
    cleanup();
    queue({ cellChosen: true });
    expect(faded()).toEqual([false, false, true]);
    cleanup();
    queue({ state: "pending" });
    expect(faded()).toEqual([false, false, true]);
  });
});

// STACK-ZERO (#699): a stack of N tiles shows N tiles, none at 0; the badge keeps its place at 12, 1 and 0.
describe("the stack at the last tiles", () => {
  const drawn = () => document.querySelectorAll("[data-stack-pile] g").length;
  const badge = () => {
    const { left, top } = screen.getByTestId("tiles-left").style;
    return { left, top };
  };
  const box = () => screen.getByTestId("tile-stack").style.width;
  const px = (calc: string) => parseFloat(calc.match(/calc\(([\d.-]+)px/)![1]!);

  it.each([
    [12, PILE_CAP],
    [1, 1],
    [0, 0],
  ])("draws the right number of tiles for %i left", (remaining, layers) => {
    render(stack(remaining));
    expect(drawn()).toBe(layers);
  });

  it("draws no tile at 0 without the tile in hand either, only the pile's shadow", () => {
    render(wrap(<TileStack tile={null} state="empty" remaining={0} />));
    expect(drawn()).toBe(0);
    expect(document.querySelector("[data-stack-pile]")).not.toBeNull();
  });

  it("anchors the badge to the stack's frame: the same place at 12, 1 and 0, in one or two digits", () => {
    const places = [12, 1, 0, 9].map((n) => {
      cleanup();
      render(stack(n));
      const height = px(screen.getByTestId("tile-stack").style.height);
      // The box is bottom-anchored: the badge's place is its distance from the box's foot.
      return { left: badge().left, box: box(), fromFoot: +(height - px(badge().top)).toFixed(2) };
    });
    for (const key of ["left", "box", "fromFoot"] as const) expect(new Set(places.map((p) => p[key])).size).toBe(1);
  });

  it("keeps the badge when the last tile leaves the hand", () => {
    render(stack(0));
    const before = badge();
    const width = box();
    cleanup();
    render(wrap(<TileStack tile={null} state="empty" remaining={0} />));
    expect(badge().left).toBe(before.left);
    expect(box()).toBe(width);
  });
});
