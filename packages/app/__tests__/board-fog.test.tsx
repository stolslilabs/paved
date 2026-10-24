import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { BoardTile } from "@paved/chain";
import type { GameCanvasProps } from "@paved/renderer/react";
import { BoardViewport, toChainSlot } from "../src/components/containers/board-viewport";

// The fog of war in every mode (#648): the board hands the renderer its clear cells, the tiles and their free slots, a village
// and an attack included (#739).

const canvas = vi.hoisted(() => ({ props: null as GameCanvasProps | null }));
vi.mock("@paved/renderer/react", () => ({
  GameCanvas: (props: GameCanvasProps) => {
    canvas.props = props;
    return null;
  },
}));

const tile = (gx: number, gy: number, id: number): BoardTile => ({ id, plan: 1, orientation: 1, ...toChainSlot(gx, gy) }) as BoardTile;
const keys = (cells: ReadonlyArray<{ x: number; y: number }> | undefined) => (cells ?? []).map((c) => `${c.x},${c.y}`).sort();

describe("the fog of war on the board (#648)", () => {
  it("leaves the tiles and their free slots clear, and lifts from the tile just placed", () => {
    const { rerender } = render(<BoardViewport tiles={[tile(0, 0, 1)]} />);
    expect(keys(canvas.props?.fogReveal?.cells)).toEqual(["-1,0", "0,-1", "0,0", "0,1", "1,0"]);
    expect(canvas.props?.fogReveal?.origin).toEqual([]);
    rerender(<BoardViewport tiles={[tile(0, 0, 1), tile(1, 0, 2)]} />);
    expect(keys(canvas.props?.fogReveal?.cells)).toEqual(["-1,0", "0,-1", "0,0", "0,1", "1,-1", "1,0", "1,1", "2,0"]);
    expect(canvas.props?.fogReveal?.origin).toEqual([{ x: 1, y: 0 }]);
  });

  it("keeps the same reveal for a new array of the same tiles", () => {
    const tiles = [tile(0, 0, 1)];
    const { rerender } = render(<BoardViewport tiles={tiles} />);
    const first = canvas.props?.fogReveal;
    rerender(<BoardViewport tiles={[...tiles]} />);
    expect(canvas.props?.fogReveal).toBe(first);
  });

  it("takes no owned-cells variant any more: every mode lifts the fog around its tiles (#739)", () => {
    render(<BoardViewport tiles={[tile(3, 3, 1)]} />);
    expect(keys(canvas.props?.fogReveal?.cells)).toEqual(["2,3", "3,2", "3,3", "3,4", "4,3"]);
  });
});
