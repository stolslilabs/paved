import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { LazyMotion, domMax } from "motion/react";
import { describe, expect, it, vi } from "vitest";
import type { GameCanvasProps } from "@paved/renderer/react";
import { PvpAttackBoard } from "../src/components/containers/pvp-attack-board";
import { VillageViewport } from "../src/components/containers/village-viewport";
import { buyableCells, legalCells, type Village } from "../src/components/containers/village-rules";
import { VillageScene } from "../src/components/scenes/village-scene";
import { REWARD, VILLAGE, VILLAGE_GROWING, VILLAGE_START } from "../src/mocks/village";

// The fog of war in the village and the PvP attack (#648): their 3D boards hand the renderer the owned cells and their neighbours.

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
  it("leaves the owned cells and the cells next to them clear of the fog, and plates the parcels", () => {
    render(<VillageViewport village={village} parcels />);
    const clear = [...village.cells, ...buyableCells(village.cells)].map(grid);
    expect(keys(canvas.props?.fogReveal?.cells)).toEqual(keys(clear));
    expect(keys(canvas.props?.availableSlots)).toEqual(keys(buyableCells(village.cells).map(grid)));
    expect(canvas.props?.availableSlots?.some((s) => s.legal === false)).toBe(false);
  });

  it("a tap on a parcel chooses it; while a reward's tile is placed, a tap on a lit cell places it", () => {
    const onParcel = vi.fn();
    const onPlace = vi.fn();
    const { rerender } = render(<VillageViewport village={village} parcels onParcel={onParcel} onPlace={onPlace} />);
    const parcel = buyableCells(village.cells)[0]!;
    canvas.props?.onTileClick?.(parcel.x, -parcel.y);
    expect(onParcel).toHaveBeenCalledWith(parcel);
    const plan = 1;
    const legal = legalCells(village, plan);
    rerender(<VillageViewport village={village} parcels placing={{ plan, orientation: 1, legal, copies: [] }} onParcel={onParcel} onPlace={onPlace} />);
    expect(keys(canvas.props?.availableSlots)).toEqual(keys(legal.map(grid)));
    expect(legal.length).toBeGreaterThan(0);
    canvas.props?.onTileClick?.(legal[0]!.x, -legal[0]!.y);
    expect(onPlace).toHaveBeenCalledWith({ x: legal[0]!.x, y: legal[0]!.y });
    // A parcel is not a target while a tile is placed.
    canvas.props?.onTileClick?.(parcel.x, -parcel.y);
    expect(onParcel).toHaveBeenCalledTimes(1);
  });

  it("is the board the village scene draws when the page gives it", () => {
    canvas.props = null;
    render(<VillageScene village={village} renderBoard={(board) => <VillageViewport {...board} />} />);
    expect(canvas.props?.fogReveal?.cells.length).toBeGreaterThan(village.cells.length);
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
      expect(canvas.props?.hover).toMatchObject({ x: legal.x, y: -legal.y, planIndex: REWARD.plans[0] });
      fireEvent.pointerUp(window, { clientX: 100, clientY: 100 });
    } finally {
      document.elementFromPoint = original;
    }
    expect(onPlace).toHaveBeenCalledWith(expect.objectContaining({ plan: REWARD.plans[0], x: legal.x, y: legal.y }));
  });
});

describe("the PvP attack in 3D (#648)", () => {
  it("leaves the defender's territory and the cells next to it clear of the fog", () => {
    const C = 2_147_483_647;
    const territory = [
      { x: C, y: C },
      { x: C + 1, y: C },
    ];
    render(<PvpAttackBoard territory={territory} tiles={[]} />);
    expect(keys(canvas.props?.fogReveal?.cells)).toEqual(["-1,0", "0,-1", "0,0", "0,1", "1,-1", "1,0", "1,1", "2,0"]);
  });
});
