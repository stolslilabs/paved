import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { BoardTile } from "@paved/chain";
import type { GameCanvasProps } from "@paved/renderer/react";
import { BoardViewport, toChainSlot, toClosedStructures } from "../src/components/containers/board-viewport";

// The closed structures (#722): the board hands the renderer every structure closed so far, each with a stable id and its
// areas on its tiles; the renderer pulses the new ones and shines them all.

const canvas = vi.hoisted(() => ({ props: null as GameCanvasProps | null }));
vi.mock("@paved/renderer/react", () => ({
  GameCanvas: (props: GameCanvasProps) => {
    canvas.props = props;
    return null;
  },
}));

const tile = (gx: number, gy: number, id: number): BoardTile => ({ id, plan: 1, orientation: 1, ...toChainSlot(gx, gy) }) as BoardTile;
const ROAD = [{ tileId: 1, areas: 16 }, { tileId: 2, areas: 64 }];
const CITY = [{ tileId: 2, areas: 2 }];

describe("the closed structures on the board (#722)", () => {
  it("names each structure by its areas, and gives its tiles the board's game", () => {
    expect(toClosedStructures([ROAD, CITY], 7)).toEqual([
      { id: "1:16,2:64", areas: [{ gameId: 7, id: 1, areas: 16 }, { gameId: 7, id: 2, areas: 64 }] },
      { id: "2:2", areas: [{ gameId: 7, id: 2, areas: 2 }] },
    ]);
  });

  it("hands the renderer the same list for a new state of the same structures, a new one when one closes", () => {
    const tiles = [tile(0, 0, 1), tile(1, 0, 2)];
    const { rerender } = render(<BoardViewport tiles={tiles} closed={[ROAD]} />);
    const first = canvas.props?.closedStructures;
    expect(first?.map((c) => c.id)).toEqual(["1:16,2:64"]);
    rerender(<BoardViewport tiles={tiles} closed={[[...ROAD]]} />);
    expect(canvas.props?.closedStructures).toBe(first);
    rerender(<BoardViewport tiles={tiles} closed={[ROAD, CITY]} />);
    expect(canvas.props?.closedStructures?.map((c) => c.id)).toEqual(["1:16,2:64", "2:2"]);
  });

  it("hands none when the page gives none", () => {
    render(<BoardViewport tiles={[tile(0, 0, 1)]} />);
    expect(canvas.props?.closedStructures).toEqual([]);
  });
});
