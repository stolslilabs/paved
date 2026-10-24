import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { LazyMotion, domMax } from "motion/react";
import { describe, expect, it, vi } from "vitest";
import type { GameCanvasProps } from "@paved/renderer/react";
import { boardReveal } from "@paved/renderer";
import { BoardViewport } from "../src/components/containers/board-viewport";
import { VillageViewport } from "../src/components/containers/village-viewport";
import { legalCells, type Village } from "../src/components/containers/village-rules";
import { VillageScene } from "../src/components/scenes/village-scene";
import { REWARD, VILLAGE, VILLAGE_GROWING, VILLAGE_START } from "../src/mocks/village";

// The fog of war in the village and the PvP attack (#648): it lifts around the tiles, as on every board (#739).

const canvas = vi.hoisted(() => ({ props: null as GameCanvasProps | null }));
vi.mock("@paved/renderer/react", () => ({
  GameCanvas: (props: GameCanvasProps) => {
    canvas.props = props;
    return null;
  },
}));

const keys = (cells: ReadonlyArray<{ x: number; y: number }> | undefined) => (cells ?? []).map((c) => `${c.x},${c.y}`).sort();
/** A village cell (x east, y north from its first) in the renderer's grid (y south). */
const grid = (c: { x: number; y: number }) => ({ x: c.x, y: -c.y });
const village: Village = VILLAGE_START;

describe("the village in 3D (#648)", () => {
  it("lifts the fog around the tiles, as on every board (#739: no owned-cells variant), and plates nothing with no tile to place", () => {
    render(<VillageViewport village={village} />);
    expect(keys(canvas.props?.fogReveal?.cells)).toEqual(keys(boardReveal(village.tiles.map(grid))));
    expect(canvas.props?.availableSlots ?? []).toEqual([]);
  });

  it("while a reward's tile is placed, plates its legal cells and a tap on one places it", () => {
    const onPlace = vi.fn();
    // A road: it fits next to the start's road (a tile goes next to a placed one, as `Village.place` rules).
    const plan = 10;
    const legal = legalCells(village, plan);
    render(<VillageViewport village={village} placing={{ plan, orientation: 1, legal }} onPlace={onPlace} />);
    expect(keys(canvas.props?.availableSlots)).toEqual(keys(legal.map(grid)));
    expect(legal.length).toBeGreaterThan(0);
    canvas.props?.onTileClick?.(legal[0]!.x, -legal[0]!.y);
    expect(onPlace).toHaveBeenCalledWith({ x: legal[0]!.x, y: legal[0]!.y });
  });

  it("is the board the village scene draws when the page gives it", () => {
    canvas.props = null;
    render(<VillageScene village={village} renderBoard={(board) => <VillageViewport {...board} />} />);
    expect(canvas.props?.fogReveal?.cells.length).toBeGreaterThan(village.tiles.length);
  });
});

describe("a reward's tile dragged onto the 3D village (#648)", () => {
  it("shows over a lit cell and is placed there on release, through the board's picker", () => {
    const onPlace = vi.fn();
    render(
      <LazyMotion features={domMax}>
        <VillageScene {...VILLAGE.reward} onPlace={onPlace} renderBoard={(board) => <VillageViewport {...board} />} />
      </LazyMotion>,
    );
    const legal = legalCells(VILLAGE_GROWING, REWARD.plans[0]!)[0]!;
    // The renderer's cell under the pointer: the lit one (in its grid, y south).
    act(() => canvas.props?.onReady?.({ gridAt: () => ({ x: legal.x, y: -legal.y }) } as never));
    const tile = within(screen.getByRole("list", { name: "Reward tiles" })).getAllByRole("button")[0]!;
    fireEvent.pointerDown(tile, { button: 0, clientX: 10, clientY: 10 });
    // jsdom lays nothing out: the element under the pointer is the 3D board.
    const original = document.elementFromPoint;
    document.elementFromPoint = () => document.querySelector("[data-cell-picker]");
    try {
      // The first move starts the drag (the cells light up), the next one is over a lit cell.
      fireEvent.pointerMove(window, { clientX: 90, clientY: 90 });
      fireEvent.pointerMove(window, { clientX: 100, clientY: 100 });
      expect(canvas.props?.hover).toMatchObject({ x: legal.x, y: 0 - legal.y, planIndex: REWARD.plans[0] });
      fireEvent.pointerUp(window, { clientX: 100, clientY: 100 });
    } finally {
      document.elementFromPoint = original;
    }
    expect(onPlace).toHaveBeenCalledWith(expect.objectContaining({ plan: REWARD.plans[0], x: legal.x, y: legal.y }));
  });
});

describe("the PvP attack in 3D (#648)", () => {
  it("lifts the fog around the defender's tiles, as on every board", () => {
    const C = 2_147_483_647;
    render(<BoardViewport tiles={[{ id: 1, plan: 9, orientation: 3, x: C, y: C }]} />);
    expect(keys(canvas.props?.fogReveal?.cells)).toEqual(["-1,0", "0,-1", "0,0", "0,1", "1,0"]);
  });
});
