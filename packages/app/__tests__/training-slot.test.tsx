import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CENTER, OrientationType, TRAINING_KEY, loadGame, replayTraining } from "@paved/game-core";
import type { GameCanvasProps } from "@paved/renderer/react";
import { App } from "../src/App";
import { toChainSlot, toGridSlot, toRenderTiles } from "../src/components/containers/board-viewport";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed } from "../src/routes/welcomed";
import { fakeSources, memoryStore } from "./data-fakes";
import { preloadPages } from "./route-helpers";

// The renderer's canvas, as the page drives it: the test reads what it is given (the lit slots, the ghost, the tiles)
// and clicks a cell the way the renderer reports one (`onTileClick(gridX, gridY)`). jsdom has no WebGL.
const canvas = vi.hoisted(() => ({ props: null as GameCanvasProps | null }));
vi.mock("@paved/renderer/react", () => ({
  GameCanvas: (props: GameCanvasProps) => {
    canvas.props = props;
    return <canvas data-testid="renderer" />;
  },
}));
vi.mock("../src/components/containers/tile-view", async (original) => ({
  ...(await original<typeof import("../src/components/containers/tile-view")>()),
  hasWebGL: () => true,
}));

const ORIENTATIONS = Object.values(OrientationType);
const SEED = 0x5eed1234abcdn;

preloadPages("board");

beforeEach(() => {
  canvas.props = null;
  markWelcomed();
});

describe("the move sent is the slot the player sees (D1, #379)", () => {
  it("converts a renderer grid slot (x east, y south) to the contracts' x and y (y north), and back", () => {
    expect(toChainSlot(0, 0)).toEqual({ x: 2_147_483_647, y: 2_147_483_647 });
    expect(toChainSlot(1, 0)).toEqual({ x: 2_147_483_648, y: 2_147_483_647 });
    // One cell south on screen is one less on the contracts' y.
    expect(toChainSlot(0, 1)).toEqual({ x: 2_147_483_647, y: 2_147_483_646 });
    expect(toChainSlot(-3, -2)).toEqual({ x: 2_147_483_644, y: 2_147_483_649 });
    expect(toGridSlot(2_147_483_644, 2_147_483_649)).toEqual({ x: -3, y: -2 });
    for (const [x, y] of [[0, 0], [5, -7], [-12, 4]] as const) expect(toGridSlot(toChainSlot(x, y).x, toChainSlot(x, y).y)).toEqual({ x, y });
    // A tile is drawn where its slot is shown.
    const [tile] = toRenderTiles([{ id: 2, plan: 1, orientation: 1, ...toChainSlot(4, -1) }], 0);
    expect({ x: tile!.worldX, y: tile!.worldZ }).toEqual({ x: 4, y: -1 });
  });

  it("round trip: the slot the renderer lights and the player clicks is the move saved, and the tile is drawn there", async () => {
    const store = memoryStore({ [TRAINING_KEY]: JSON.stringify({ v: 1, seed: `0x${SEED.toString(16)}`, moves: [] }) });
    render(<App router={createTestRouter("/training")} sources={fakeSources({ store: () => store }).sources} />);
    await screen.findByTestId("renderer", {}, { timeout: 5000 });
    // The canvas is found on the commit, before the page's mount effect (it resets the chosen slot and the orientation for a
    // new game) has run; a click made in that gap, as this test can with no rotation to await, is wiped by the effect.
    await act(async () => {});

    // The lit slots are the engine's legal placements at the hand's orientation, in the renderer's grid.
    const engine = replayTraining(SEED, []);
    // The hand starts North: the plates' `fits` are those of that rotation.
    const orientation = 1;
    const legal = engine.legalPlacements().filter((p) => p.orientation === ORIENTATIONS[orientation]);
    const plates = canvas.props!.availableSlots!;
    const lit = plates.filter((s) => s.legal !== false);
    // Every legal cell in any rotation is a plate (PLATES); `fits` marks those of the hand's rotation; every other free
    // cell next to a tile is an invalid plate (`legal` false). `0 - y`, not `-y`: the grid's y is +0 on the starter's row,
    // never -0.
    const cells = (list: { x: number; y: number }[]) => [...new Set(list.map((c) => `${c.x},${c.y}`))].sort();
    expect(cells(lit)).toEqual(cells(engine.legalPlacements().map((p) => ({ x: p.x, y: 0 - p.y }))));
    expect(lit.filter((s) => s.fits).map(({ x, y }) => ({ x, y }))).toEqual(legal.map((p) => ({ x: p.x, y: 0 - p.y })));
    expect(plates.filter((s) => s.legal === false).every((s) => !s.fits)).toBe(true);

    // The player clicks the last lit slot, as the renderer reports it; the tile is placed on that cell in the first
    // rotation that fits there (the current one when it does), never in one that does not.
    const cell = { x: lit[lit.length - 1]!.x, y: lit[lit.length - 1]!.y };
    const turns = engine.legalPlacements().filter((p) => p.x === cell.x && 0 - p.y === cell.y).map((p) => ORIENTATIONS.indexOf(p.orientation));
    const chosen = turns.includes(orientation) ? orientation : Math.min(...turns);
    act(() => canvas.props!.onTileClick!(cell.x, cell.y));
    await waitFor(() => expect(canvas.props!.hover).toMatchObject({ x: cell.x, y: cell.y, orientation: chosen, placed: true, valid: true }));

    await userEvent.click(within(screen.getByRole("region", { name: "Your tile" })).getByRole("button", { name: /Place tile/ }));
    // The move saved is that cell in the engine's coordinates (y north), and the renderer now draws a tile on it.
    expect(loadGame(() => store)!.moves).toEqual([{ k: "b", o: chosen, x: cell.x, y: 0 - cell.y }]);
    await waitFor(() => expect(canvas.props!.tiles).toHaveLength(2));
    const placed = canvas.props!.tiles!.find((t) => t.id !== 1)!;
    expect({ x: placed.worldX, y: placed.worldZ }).toEqual(cell);
    expect({ x: placed.x, y: placed.y }).toEqual({ x: CENTER + cell.x, y: CENTER - cell.y });
  });
});
