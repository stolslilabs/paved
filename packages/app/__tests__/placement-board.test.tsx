import { act, render, screen, waitFor, within } from "@testing-library/react";
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
import { preloadPages } from "./route-helpers";

// The renderer's canvas as the page drives it (jsdom has no WebGL): the test reads its props and clicks a cell the way
// the renderer reports one.
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
  localStorage.clear();
  resetWelcomedForTests();
  markWelcomed();
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  resetWelcomedForTests();
});

const hand = () => screen.getByRole("region", { name: "Your tile" });
const place = () => within(hand()).getByRole("button", { name: /Place tile/ });
const rotate = () => userEvent.click(within(hand()).getByRole("button", { name: "Rotate tile" }));

/** Chooses, on the canvas, a lit slot where some rotation does not fit, and turns the tile there until it is red. */
async function placeRed(): Promise<{ x: number; y: number }> {
  // The legal plates only: an invalid one (no rotation fits) cannot be chosen.
  for (const slot of canvas.props!.availableSlots!.filter((s) => s.legal !== false)) {
    act(() => canvas.props!.onTileClick!(slot.x, slot.y));
    await waitFor(() => expect(canvas.props!.hover).toMatchObject({ x: slot.x, y: slot.y, placed: true, valid: true }));
    for (let turn = 0; turn < 4; turn++) {
      await rotate();
      if (canvas.props!.hover?.valid === false) return { x: slot.x, y: slot.y };
    }
  }
  throw new Error("every slot fits every rotation");
}

describe("the 3D board's placement (SLOTS, P-68)", () => {
  it("hands the canvas a red placement (valid false) with Confirm disabled; white again once it fits", async () => {
    render(<App router={createTestRouter("/training")} sources={fakeSources({ store: () => memoryStore() }).sources} />);
    await screen.findByTestId("renderer", {}, { timeout: 5000 });
    await act(async () => {});
    const cell = await placeRed();
    expect(canvas.props!.hover).toMatchObject({ ...cell, placed: true, valid: false });
    expect(place()).toBeDisabled();
    for (let turn = 0; turn < 4 && canvas.props!.hover?.valid === false; turn++) await rotate();
    expect(canvas.props!.hover).toMatchObject({ ...cell, placed: true, valid: true });
    expect(place()).toBeEnabled();
  }, 20_000);

  it("Training: flashes green once the session took the move; refused, the tile stays placed and nothing flashes", async () => {
    render(<App router={createTestRouter("/training")} sources={fakeSources({ store: () => memoryStore() }).sources} />);
    await screen.findByTestId("renderer", {}, { timeout: 5000 });
    await act(async () => {});
    const fitting = () => canvas.props!.availableSlots!.filter((s) => s.fits);
    for (let i = 0; i < 4 && fitting().length === 0; i++) await rotate();
    const slot = fitting()[0]!;

    // Refused: no flash, the tile still placed on its slot.
    const refused = vi.spyOn(TrainingGame.prototype, "place").mockResolvedValue(false);
    act(() => canvas.props!.onTileClick!(slot.x, slot.y));
    await waitFor(() => expect(place()).toBeEnabled());
    await userEvent.click(place());
    expect(refused).toHaveBeenCalledOnce();
    expect(canvas.props!.confirmed).toBeNull();
    expect(canvas.props!.hover).toMatchObject({ x: slot.x, y: slot.y, placed: true, valid: true });

    // Accepted: the flash, then the slot goes.
    refused.mockRestore();
    await userEvent.click(place());
    await waitFor(() => expect(canvas.props!.confirmed).toMatchObject({ x: slot.x, y: slot.y }));
    expect(canvas.props!.hover?.placed ?? false).toBe(false);
  }, 20_000);
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
    const fitting = () => canvas.props!.availableSlots!.filter((s) => s.fits);
    for (let i = 0; i < 4 && fitting().length === 0; i++) await rotate();
    const slot = fitting()[0]!;
    act(() => canvas.props!.onTileClick!(slot.x, slot.y));
    await waitFor(() => expect(place()).toBeEnabled());

    // Refused (the session takes nothing): no flash, still placed.
    const refused = vi.spyOn(PredictedSession.prototype, "place").mockResolvedValue(false);
    await userEvent.click(place());
    expect(refused).toHaveBeenCalledOnce();
    expect(canvas.props!.confirmed).toBeNull();
    expect(canvas.props!.hover).toMatchObject({ x: slot.x, y: slot.y, placed: true });

    // Taken by the prediction: the flash at once, though the receipt never comes.
    refused.mockRestore();
    await userEvent.click(place());
    await waitFor(() => expect(canvas.props!.confirmed).toMatchObject({ x: slot.x, y: slot.y }));
  }, 20_000);
});

describe("BoardViewport and the tile preview setting", () => {
  const ghost = { x: CENTER + 1, y: CENTER, plan: 3, orientation: 2 };
  const view = (g: typeof ghost & { placed?: boolean; fits?: boolean }) =>
    render(<BoardViewport tiles={[]} slots={[{ x: g.x, y: g.y, fits: false }]} ghost={g} tilePreview={false} />);

  it("off, hides only the hover preview: a placed tile, white or red, is always drawn", () => {
    view(ghost);
    expect(canvas.props!.hover).toBeNull();
    view({ ...ghost, placed: true, fits: true });
    expect(canvas.props!.hover).toMatchObject({ placed: true, valid: true });
    view({ ...ghost, placed: true, fits: false });
    expect(canvas.props!.hover).toMatchObject({ placed: true, valid: false });
    // The slot's plate still says whether the rotation fits.
    expect(canvas.props!.availableSlots).toEqual([{ x: 1, y: 0, fits: false }]);
  });
});
