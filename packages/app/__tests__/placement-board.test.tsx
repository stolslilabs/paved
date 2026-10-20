import { useEffect } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CENTER, EngineGame, PlanType, PredictedSession } from "@paved/game-core";
import { FakeGameViews, type GameKey, type GameView, type TileView } from "@paved/chain";
import type { GameCanvasProps } from "@paved/renderer/react";
import { App } from "../src/App";
import { BoardViewport } from "../src/components/containers/board-viewport";
import type { GameSigner } from "../src/data";
import { TrainingGame } from "../src/data/training";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { fakeSources, memoryStore } from "./data-fakes";
import { holdToPlace, preloadPages, validateButton } from "./route-helpers";
import { HOLD_MS } from "../src/lib/use-hold";

// The renderer's canvas as the page drives it (jsdom has no WebGL): the test reads its props and clicks a cell the way
// the renderer reports one.
const canvas = vi.hoisted(() => ({
  props: null as GameCanvasProps | null,
  // The voxel drop (#568): every drop asked for, and the cells whose drop was prepared at pre-validation.
  drops: [] as { worldX: number; worldZ: number }[],
  prepared: [] as { x: number; y: number }[],
}));
vi.mock("@paved/renderer/react", () => ({
  GameCanvas: (props: GameCanvasProps) => {
    canvas.props = props;
    // The scene the bubble follows: a fixed corner, no camera moves; a drop that plays and ends at once.
    useEffect(
      () =>
        props.onReady?.({
          projectCell: () => ({ x: 200, y: 300, visible: true }),
          onCameraChange: () => () => {},
          prepareDropAt: async (state: { x: number; y: number }) => (canvas.prepared.push({ x: state.x, y: state.y }), true),
          dropTile: async (tile: { worldX: number; worldZ: number }) => {
            canvas.drops.push({ worldX: tile.worldX, worldZ: tile.worldZ });
            return { status: "started", info: {}, finished: Promise.resolve() };
          },
        } as never),
      [],
    );
    return <canvas data-testid="renderer" />;
  },
}));
vi.mock("../src/components/containers/tile-view", async (original) => ({
  ...(await original<typeof import("../src/components/containers/tile-view")>()),
  hasWebGL: () => true,
}));

// A fixed Training seed (GUARDS, P-71): the first tile of a random seed fits every rotation at every lit slot about one
// time in eleven (180 of 2000 seeds), and the search for a red rotation then finds none. Seed 1 deals a first tile that
// fits two rotations of four at each slot.
vi.mock("@paved/game-core", async (original) => ({
  ...(await original<typeof import("@paved/game-core")>()),
  randomSeed: () => 1n,
}));

preloadPages("board");

beforeEach(() => {
  canvas.props = null;
  canvas.drops = [];
  canvas.prepared = [];
  localStorage.clear();
  resetWelcomedForTests();
  markWelcomed();
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  resetWelcomedForTests();
});

const bubble = () => screen.findByRole("toolbar", { name: "Tile" });
const rotate = async () => userEvent.click(await screen.findByRole("button", { name: "Rotate tile" }));
/** A plate the tile can take in some rotation, as the canvas lights it. */
const legalSlots = () => canvas.props!.availableSlots!.filter((s) => s.legal !== false);

describe("the 3D board's placement (SLOTS, P-68)", () => {
  it("never hands the canvas a red placement: a chosen slot gets a rotation that fits, Rotate keeps to them, Close puts the tile back", async () => {
    render(<App router={createTestRouter("/training")} sources={fakeSources({ store: () => memoryStore() }).sources} />);
    await screen.findByTestId("renderer", {}, { timeout: 5000 });
    await act(async () => {});
    let rotated = 0;
    for (const slot of legalSlots()) {
      act(() => canvas.props!.onTileClick!(slot.x, slot.y));
      await waitFor(() => expect(canvas.props!.hover).toMatchObject({ x: slot.x, y: slot.y, placed: true, valid: true }));
      await bubble();
      expect(validateButton()).toBeEnabled();
      const seen = new Set<number>([canvas.props!.hover!.orientation!]);
      while (screen.queryByRole("button", { name: "Rotate tile" }) && seen.size < 4) {
        await rotate();
        rotated++;
        expect(canvas.props!.hover).toMatchObject({ x: slot.x, y: slot.y, placed: true, valid: true });
        expect(validateButton()).toBeEnabled();
        const before = seen.size;
        seen.add(canvas.props!.hover!.orientation!);
        if (seen.size === before) break;
      }
      await userEvent.click(screen.getByRole("button", { name: "Cancel placement" }));
      expect(canvas.props!.hover).toBeNull();
      expect(validateButton()).toBeNull();
    }
    // This seed deals a tile that fits two rotations at some slots: Rotate was offered.
    expect(rotated).toBeGreaterThan(0);
  }, 30_000);

  it("Escape cancels and R rotates, from the keyboard", async () => {
    render(<App router={createTestRouter("/training")} sources={fakeSources({ store: () => memoryStore() }).sources} />);
    await screen.findByTestId("renderer", {}, { timeout: 5000 });
    await act(async () => {});
    const slot = legalSlots()[0]!;
    act(() => canvas.props!.onTileClick!(slot.x, slot.y));
    await bubble();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(canvas.props!.hover).toBeNull());
    expect(validateButton()).toBeNull();
  });

  it("Training: prepares the drop once placed, drops the tile once the session took it, then flashes green; refused, nothing plays", async () => {
    render(<App router={createTestRouter("/training")} sources={fakeSources({ store: () => memoryStore() }).sources} />);
    await screen.findByTestId("renderer", {}, { timeout: 5000 });
    await act(async () => {});
    const slot = legalSlots()[0]!;

    // Refused: no flash, the tile still placed on its slot.
    const refused = vi.spyOn(TrainingGame.prototype, "place").mockResolvedValue(false);
    act(() => canvas.props!.onTileClick!(slot.x, slot.y));
    await waitFor(() => expect(validateButton()).toBeEnabled());
    // Pre-validated: the drop of the tile at its cell is prepared, before anything is sent.
    await waitFor(() => expect(canvas.prepared).toContainEqual({ x: slot.x, y: slot.y }));
    // A tap does not place.
    await userEvent.click(validateButton()!);
    expect(refused).not.toHaveBeenCalled();
    await holdToPlace();
    expect(refused).toHaveBeenCalledOnce();
    expect(canvas.drops).toEqual([]);
    expect(canvas.props!.confirmed).toBeNull();
    expect(canvas.props!.hover).toMatchObject({ x: slot.x, y: slot.y, placed: true, valid: true });

    // Accepted: the drop of the landed tile, then the green, and the slot goes.
    refused.mockRestore();
    await holdToPlace();
    await waitFor(() => expect(canvas.props!.confirmed).toMatchObject({ x: slot.x, y: slot.y }));
    expect(canvas.drops).toEqual([{ worldX: slot.x, worldZ: slot.y }]);
    expect(canvas.props!.hover?.placed ?? false).toBe(false);
  }, 20_000);
});

describe("holding the placed tile (TILE-HOLD, #630)", () => {
  /** The Training board with its first legal slot chosen: the tile placed there, the bubble up, Validate enabled. */
  async function placed() {
    render(<App router={createTestRouter("/training")} sources={fakeSources({ store: () => memoryStore() }).sources} />);
    await screen.findByTestId("renderer", {}, { timeout: 5000 });
    await act(async () => {});
    const slot = legalSlots()[0]!;
    act(() => canvas.props!.onTileClick!(slot.x, slot.y));
    await waitFor(() => expect(validateButton()).toBeEnabled());
    return slot;
  }
  const press = (x: number, y: number, phase: "down" | "released" | "cancelled") => {
    let acted: boolean | void = undefined;
    act(() => void (acted = canvas.props!.onTilePress!(x, y, phase)));
    return acted;
  };
  const ring = () => validateButton()!.getAttribute("data-state");

  it("a press on the tile fills Validate's ring; held to the end it places once, and its let go clicks nothing", async () => {
    const slot = await placed();
    const place = vi.spyOn(TrainingGame.prototype, "place").mockResolvedValue(false);
    press(slot.x, slot.y, "down");
    expect(ring()).toBe("holding");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, HOLD_MS + 50));
    });
    expect(place).toHaveBeenCalledOnce();
    expect(ring()).toBe("done");
    // The renderer keeps the click that would follow the let go.
    expect(press(slot.x, slot.y, "released")).toBe(true);
    expect(ring()).toBe("idle");
    expect(place).toHaveBeenCalledOnce();
  }, 20_000);

  it("let go early, or cancelled by a pan or a second finger, it places nothing and the ring rewinds; a short tap clicks as before", async () => {
    const slot = await placed();
    const place = vi.spyOn(TrainingGame.prototype, "place").mockResolvedValue(false);
    press(slot.x, slot.y, "down");
    expect(ring()).toBe("holding");
    expect(press(slot.x, slot.y, "released")).toBe(false);
    expect(ring()).toBe("idle");
    press(slot.x, slot.y, "down");
    press(slot.x, slot.y, "cancelled");
    expect(ring()).toBe("idle");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, HOLD_MS + 50));
    });
    expect(place).not.toHaveBeenCalled();
  }, 20_000);

  it("a press on another cell holds nothing: no hold to let go, the tap is the click it was", async () => {
    const slot = await placed();
    press(slot.x + 5, slot.y + 5, "down");
    expect(ring()).toBe("idle");
    expect(press(slot.x + 5, slot.y + 5, "released")).toBeUndefined();
  }, 20_000);

  it("Validate disabled (a rotation that does not fit) or busy (the move on its way): a press on the tile holds nothing", async () => {
    const cell = { x: CENTER + 1, y: CENTER };
    const grid = { x: 1, y: 0 };
    const bubbleOf = (b: { canConfirm?: boolean; busy?: boolean }) => ({ cell, rotations: 1, onRotate: () => {}, onClose: () => {}, onConfirm: vi.fn(), ...b });
    const view = render(<BoardViewport tiles={[]} ghost={{ ...cell, plan: 3, orientation: 1, placed: true, fits: false }} bubble={bubbleOf({ canConfirm: false })} />);
    await screen.findByRole("toolbar", { name: "Tile" });
    press(grid.x, grid.y, "down");
    expect(ring()).toBe("idle");
    expect(press(grid.x, grid.y, "released")).toBeUndefined();
    view.rerender(<BoardViewport tiles={[]} ghost={{ ...cell, plan: 3, orientation: 1, placed: true }} bubble={bubbleOf({ busy: true })} />);
    press(grid.x, grid.y, "down");
    expect(ring()).toBe("idle");
    view.rerender(<BoardViewport tiles={[]} ghost={{ ...cell, plan: 3, orientation: 1, placed: true }} bubble={bubbleOf({})} />);
    press(grid.x, grid.y, "down");
    expect(ring()).toBe("holding");
    press(grid.x, grid.y, "cancelled");
    expect(ring()).toBe("idle");
  });
});

const PLANS = Object.values(PlanType);
const PLAYER = "0xabc";
const GAME_ID = 12;
const SEED = 0x5eed1234abcdn;
const key: GameKey = { mode: "challenge", gameId: GAME_ID };

/** A fresh Challenge game on `FakeGameViews`, a signer whose build never answers (the receipt is not in yet). */
function challengeSources() {
  const engine = EngineGame.start({ deck: "simple", seed: SEED, player: BigInt(PLAYER) });
  const held = engine.hand!;
  const game: GameView = {
    id: GAME_ID, playerId: PLAYER, mode: 1, seed: `0x${engine.seed.toString(16)}`, score: 0, over: false, tileCount: 2,
    placedCount: 1, discardedCount: 0, tileId: held.id, plan: PLANS.indexOf(held.plan), remainingCount: 36, deckSize: 38,
    startTime: 1, endTime: 0, dayId: 0, expiresAt: 2 ** 40,
  };
  const tiles: TileView[] = [
    { id: 1, status: 1, plan: PLANS.indexOf(PlanType.RFFFRFCFR), orientation: 3, x: CENTER, y: CENTER },
    { id: held.id, status: 3, plan: game.plan, orientation: 0, x: 0, y: 0 },
  ];
  const views = new FakeGameViews();
  views.setGame(key, { game, tiles, builder: { gameId: GAME_ID, playerId: PLAYER, tileId: game.tileId, plan: game.plan }, initialSeed: `0x${SEED.toString(16)}` });
  const signer = { address: PLAYER, build: vi.fn(() => new Promise(() => {})), discard: vi.fn(), surrender: vi.fn() } as unknown as GameSigner;
  return fakeSources({ views, signer }).sources;
}

describe("the Challenge board's confirm", () => {
  it("flashes green when the engine's prediction takes the move, before the receipt; refused, the tile stays placed", async () => {
    render(<App router={createTestRouter(`/game/${GAME_ID}`)} sources={challengeSources()} />);
    await screen.findByTestId("renderer", {}, { timeout: 5000 });
    await waitFor(() => expect(canvas.props!.availableSlots!.length).toBeGreaterThan(0));
    const slot = legalSlots()[0]!;
    act(() => canvas.props!.onTileClick!(slot.x, slot.y));
    await waitFor(() => expect(validateButton()).toBeEnabled());

    // Refused (the session takes nothing): no flash, still placed.
    const refused = vi.spyOn(PredictedSession.prototype, "place").mockResolvedValue(false);
    await holdToPlace();
    expect(refused).toHaveBeenCalledOnce();
    expect(canvas.props!.confirmed).toBeNull();
    expect(canvas.props!.hover).toMatchObject({ x: slot.x, y: slot.y, placed: true });

    // Taken by the prediction: the drop and the flash at once, though the receipt never comes.
    refused.mockRestore();
    await holdToPlace();
    await waitFor(() => expect(canvas.props!.confirmed).toMatchObject({ x: slot.x, y: slot.y }));
    expect(canvas.drops).toEqual([{ worldX: slot.x, worldZ: slot.y }]);
  }, 20_000);
});

describe("BoardViewport and the tile preview setting", () => {
  const ghost = { x: CENTER + 1, y: CENTER, plan: 3, orientation: 2 };
  const view = (g: typeof ghost & { placed?: boolean; fits?: boolean }) =>
    render(<BoardViewport tiles={[]} slots={[{ x: g.x, y: g.y, fits: false }]} ghost={g} tilePreview={false} />);

  it("off, hides only the hover preview: a placed tile, yellow or red, is always drawn", () => {
    view(ghost);
    expect(canvas.props!.hover).toBeNull();
    view({ ...ghost, placed: true, fits: true });
    expect(canvas.props!.hover).toMatchObject({ placed: true, valid: true });
    view({ ...ghost, placed: true, fits: false });
    expect(canvas.props!.hover).toMatchObject({ placed: true, valid: false });
    // The slot's plate is playable: one state, whatever the rotation.
    expect(canvas.props!.availableSlots).toEqual([{ x: 1, y: 0 }]);
  });
});
