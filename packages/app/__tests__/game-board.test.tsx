import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { act, render, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BoardViewportProps } from "../src/components/containers/board-viewport";
import type { LayoutBoardView } from "../src/components/containers/layout-board";
import { RENDERER_ASSETS } from "../src/data/renderer-manifest";
import type { BoardCanvasProps } from "../src/routes/board-canvas";
import { useGameBoard, type GameBoardPlacement } from "../src/routes/game-board";
import HomeCanvas from "../src/routes/home-canvas";

// BOARD-MODULE (#772): the one board of every game and of the village. Which pieces it gives the board scene with WebGL and
// without, what the canvas and the stack are given, the village on the same canvas, and that no route draws the board or the
// stack itself.

// The renderer's canvas, recorded instead of drawn (jsdom has no WebGL).
const drawn = vi.hoisted(() => ({ board: [] as BoardViewportProps[] }));
vi.mock("../src/components/containers/board-viewport", async (actual) => ({
  ...(await actual<object>()),
  BoardViewport: (props: BoardViewportProps) => {
    drawn.board.push(props);
    return null;
  },
}));
beforeEach(() => {
  drawn.board.length = 0;
});

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
    const canvas = (scene.canvas as { props: BoardCanvasProps }).props;
    expect(canvas.tiles).toEqual([STARTER]);
    expect(canvas.gameId).toBe(7);
    expect(canvas.skins).toBe(SKINS);
    expect(canvas.slots).toBe(scene.slots);
    expect(canvas.onCellClick).toBe(scene.onSlotClick);
    expect(canvas.onCellPress).toBe(scene.onSlotClick);
    expect(canvas.board.renderer).toBeDefined();
    expect(canvas.board.onScene).toBeTypeOf("function");
    // Drawn, it is the renderer's canvas on the app's served models with the board settings.
    render(<>{scene.canvas}</>);
    expect(drawn.board.at(-1)).toMatchObject({ basePath: RENDERER_ASSETS, gameId: 7, skins: SKINS, settings: canvas.board.renderer, tilePreview: canvas.board.tilePreview });
  });

  it("holds summer's day with `summerDay` (the scout, #788): the cycle off whatever the Day and night setting, no season dial", () => {
    const { result } = renderHook(() => useGameBoard({ side: "rival", summerDay: true, placement }));
    const scene = result.current.scene({ tiles: [STARTER], bubble: null });
    expect(scene.seasonWheel).toBeUndefined();
    // The renderer's rule (#770): the cycle off is summer's day, its fixed lights, no night and no chimney smoke.
    expect((scene.canvas as { props: BoardCanvasProps }).props.board.renderer.dayNight).toEqual({ enabled: false, freezeAt: null });
    // Without it, the setting's default (on) runs the cycle, as the attack that follows does.
    const own = renderHook(() => useGameBoard({ side: "rival", placement })).result.current.scene({ tiles: [STARTER], bubble: null });
    expect((own.canvas as { props: BoardCanvasProps }).props.board.renderer.dayNight).toEqual({ enabled: true, freezeAt: null });
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
    const canvas = result.current.scene({ tiles: [STARTER], bubble: null }).canvas as { props: BoardCanvasProps };
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

describe("the village on the board module (open point 3)", () => {
  const VIEW: LayoutBoardView = {
    tiles: [{ id: 1, plan: 0, orientation: 1, x: 0, y: 0 }, { id: 2, plan: 3, orientation: 2, x: 1, y: 0 }],
    plates: [{ x: 0, y: 1 }],
    pending: null,
    editing: true,
    bubble: null,
    onTile: vi.fn(),
    onPlate: vi.fn(),
    onPending: vi.fn(),
  } as unknown as LayoutBoardView;

  it("draws the editor's layout on the boards' canvas: its own plates only, the board settings, the app's models", () => {
    const settings = { quality: "high" } as const;
    const onScene = vi.fn();
    render(<HomeCanvas view={VIEW} settings={settings} skins={SKINS} onScene={onScene} />);
    const drawnBoard = drawn.board.at(-1)!;
    expect(drawnBoard).toMatchObject({ basePath: RENDERER_ASSETS, settings, skins: SKINS, otherPlates: false });
    // The page's scene handle, through the village's ready signal (#761).
    drawnBoard.onScene?.(null);
    expect(onScene).toHaveBeenCalledWith(null);
    // The layout's cells counted from the contracts' centre, as before.
    expect(drawnBoard.tiles.map((t) => [t.x, t.y])).toEqual([
      [2_147_483_647, 2_147_483_647],
      [2_147_483_648, 2_147_483_647],
    ]);
    expect(drawnBoard.slots).toEqual([{ x: 2_147_483_647, y: 2_147_483_648, fits: true }]);
    // The village keeps the switches' defaults (on), as it had them.
    expect(drawnBoard.tilePreview).toBeUndefined();
    expect(drawnBoard.placementHighlight).toBeUndefined();
  });

  it("passes the taps to the editor: a plate places, a placed tile lifts, the starter does not", () => {
    render(<HomeCanvas view={VIEW} />);
    const { onCellClick } = drawn.board.at(-1)!;
    onCellClick?.({ x: 2_147_483_647, y: 2_147_483_648 });
    expect(VIEW.onPlate).toHaveBeenCalledWith({ x: 0, y: 1 });
    onCellClick?.({ x: 2_147_483_648, y: 2_147_483_647 });
    expect(VIEW.onTile).toHaveBeenCalledWith(VIEW.tiles[1]);
    onCellClick?.({ x: 2_147_483_647, y: 2_147_483_647 });
    expect(VIEW.onTile).toHaveBeenCalledTimes(1);
  });
});

describe("the routes", () => {
  const ROOT = join(import.meta.dirname, "..");
  const MODULE = "src/routes/game-board.tsx";
  const CANVAS = "src/routes/board-canvas.tsx";
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : []));

  const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
  // Where the 3D board, the stack and the renderer's manifest may be built: the module's canvas and its hook, nowhere else.
  const builders = (pattern: RegExp) =>
    files(join(ROOT, "src/routes"))
      .map((f) => relative(ROOT, f))
      .filter((f) => pattern.test(read(f)));

  it("draw the board, the village and the stack only through the board module", () => {
    expect(builders(/<BoardViewport\b/)).toEqual([CANVAS]);
    expect(builders(/<StackView\b/)).toEqual([MODULE]);
    expect(builders(/\bprovideManifest\(/)).toEqual([CANVAS]);
    expect(read(MODULE)).toMatch(/<BoardCanvas\b/);
    // The home's village is the module's (open point 3); its editor's mapping draws no canvas of its own.
    expect(read("src/routes/home-canvas.tsx")).toMatch(/<BoardCanvas\b/);
    expect(read("src/components/containers/village-layout-canvas.tsx")).not.toMatch(/<BoardViewport\b/);
    // The attacks, the replay and the scout (#772 PR 2): the module's board, on the rival's side for someone else's village.
    for (const f of ["src/routes/pvp-v2.tsx", "src/routes/pages/pvp.tsx", "src/routes/pages/pvp-replay.tsx", "src/routes/attack-board.ts"]) expect(read(f)).toMatch(/\buseGameBoard\(/);
    expect(read("src/routes/attack-board.ts")).toMatch(/side: "rival"/);
    // A visit to another player's village (open point 5): the scout's board, red.
    expect(read("src/routes/village-visit-board.tsx")).toMatch(/\buseScoutCanvas\(/);
  });
});
