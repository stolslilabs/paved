import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BoardViewportProps } from "../src/components/containers/board-viewport";
import { useGameBoard, type GameBoardPlacement } from "../src/routes/game-board";

// BOARD-MODULE (#772): the one board of every game. Which pieces it gives the board scene with WebGL and without, what the
// canvas and the stack are given, and that no route draws the board or the stack itself.

const gl = vi.hoisted(() => ({ on: true }));
vi.mock("../src/components/containers/tile-view", async (actual) => ({
  ...(await actual<object>()),
  hasWebGL: () => gl.on,
}));
vi.mock("../src/components/containers/stack-view", async (actual) => ({
  ...(await actual<object>()),
  canDrawStack: () => gl.on,
}));
afterEach(() => {
  gl.on = true;
});

const STARTER = { id: 1, plan: 0, orientation: 1, x: 2_147_483_647, y: 2_147_483_647 };
const SLOT = { x: 2_147_483_648, y: 2_147_483_647 };
const SKINS = { ccccccccc: 1 };
const placement: GameBoardPlacement = { plan: 3, slotsAt: () => [SLOT], orientationsAt: () => [1, 2], version: 0, resetKey: 0 };

describe("useGameBoard", () => {
  it("gives the scene the 3D board, the 3D stack, the dial and the placement, from one set of inputs", () => {
    const { result } = renderHook(() => useGameBoard({ skins: SKINS, placement }));
    const scene = result.current.scene({ tiles: [STARTER], gameId: 7, bubble: null });
    expect(scene.tiles).toEqual([STARTER]);
    expect(scene.skins).toBe(SKINS);
    expect(scene.seasonWheel).toBeDefined();
    expect(scene.renderHandStack).toBeTypeOf("function");
    expect(scene.slots).toEqual([{ ...SLOT, fits: true }]);
    // The canvas gets the same tiles, skins, slots and taps as the plan view would.
    const canvas = (scene.canvas as { props: BoardViewportProps }).props;
    expect(canvas.tiles).toEqual([STARTER]);
    expect(canvas.gameId).toBe(7);
    expect(canvas.skins).toBe(SKINS);
    expect(canvas.slots).toBe(scene.slots);
    expect(canvas.onCellClick).toBe(scene.onSlotClick);
    expect(canvas.onCellPress).toBe(scene.onSlotClick);
    expect(canvas.settings).toBeDefined();
  });

  it("chooses a slot through the placement it holds: the ghost and the bubble's rotations follow", () => {
    const { result } = renderHook(() => useGameBoard({ placement }));
    act(() => result.current.scene({ tiles: [STARTER], bubble: null }).onSlotClick?.(SLOT));
    expect(result.current.placement.chosen).toEqual(SLOT);
    expect(result.current.placement.rotations).toEqual([1, 2]);
    expect(result.current.scene({ tiles: [STARTER], bubble: null }).ghost).toMatchObject({ ...SLOT, plan: 3, placed: true });
  });

  it("falls back to the plan view and the CSS pile once the renderer cannot start", () => {
    const { result } = renderHook(() => useGameBoard({ placement }));
    const canvas = result.current.scene({ tiles: [STARTER], bubble: null }).canvas as { props: BoardViewportProps };
    act(() => canvas.props.onError?.(new Error("no model")));
    const scene = result.current.scene({ tiles: [STARTER], bubble: null });
    expect(scene.canvas).toBeUndefined();
    expect(scene.renderHandStack).toBeUndefined();
    expect(scene.seasonWheel).toBeDefined();
  });

  it("starts on the plan view and the CSS pile without WebGL", () => {
    gl.on = false;
    const { result } = renderHook(() => useGameBoard({ placement }));
    const scene = result.current.scene({ tiles: [STARTER], bubble: null });
    expect(scene.canvas).toBeUndefined();
    expect(scene.renderHandStack).toBeUndefined();
  });

  it("draws the stack's tiles in the board's skins", () => {
    const { result } = renderHook(() => useGameBoard({ skins: SKINS, placement }));
    const stack = result.current.scene({ tiles: [STARTER], bubble: null }).renderHandStack!({ tiles: [], enterLift: 1, target: [0, 0, 0], heightPx: 100, unitPx: 10 });
    expect((stack as { props: { skins?: unknown } }).props.skins).toBe(SKINS);
  });
});

describe("the routes", () => {
  const ROOT = join(import.meta.dirname, "..");
  const MODULE = "src/routes/game-board.tsx";
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : []));

  it("draw the board and the stack only through the board module", () => {
    const drawing = files(join(ROOT, "src/routes"))
      .map((f) => relative(ROOT, f))
      .filter((f) => f !== MODULE && /<(BoardViewport|StackView)\b/.test(readFileSync(join(ROOT, f), "utf8")));
    expect(drawing).toEqual([]);
    expect(readFileSync(join(ROOT, MODULE), "utf8")).toMatch(/<BoardViewport\b[\s\S]*<StackView\b|<StackView\b[\s\S]*<BoardViewport\b/);
  });
});
