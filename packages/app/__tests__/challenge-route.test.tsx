import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeGameViews, type GameKey, type GameView, type TileView, type WriteResult } from "@paved/chain";
import { CENTER, EngineGame, PlanType } from "@paved/game-core";
import { App } from "../src/App";
import type { GameSigner } from "../src/data";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { fakeSources } from "./data-fakes";

const PLANS = Object.values(PlanType);
const PLAYER = "0xabc";
const GAME_ID = 12;
const SEED = 0x5eed1234abcdn;
const key: GameKey = { mode: "challenge", gameId: GAME_ID };

/** A fresh Challenge game as the views give it: the starter, the tile in hand, the engine's seed after the first draw. */
function freshGame(expiresAt: number) {
  const engine = EngineGame.start({ deck: "simple", seed: SEED, player: BigInt(PLAYER) });
  const hand = engine.hand!;
  const game: GameView = {
    id: GAME_ID, playerId: PLAYER, mode: 1, seed: `0x${engine.seed.toString(16)}`, score: 0, over: false, tileCount: 2,
    placedCount: 1, discardedCount: 0, tileId: hand.id, plan: PLANS.indexOf(hand.plan), remainingCount: 36, deckSize: 38,
    startTime: 1, endTime: 0, dayId: 0, expiresAt,
  };
  const tiles: TileView[] = [
    { id: 1, status: 1, plan: PLANS.indexOf(PlanType.RFFFRFCFR), orientation: 3, x: CENTER, y: CENTER },
    { id: hand.id, status: 3, plan: game.plan, orientation: 0, x: 0, y: 0 },
  ];
  return { engine, game, tiles };
}

/** The sources on `FakeGameViews` holding the fresh game, and a signer whose discard moves it as the contract does. */
function sources(options: { signer: boolean; expiresAt?: number }) {
  const { engine, game, tiles } = freshGame(options.expiresAt ?? 2 ** 40);
  const views = new FakeGameViews();
  views.setGame(key, { game, tiles, builder: { gameId: GAME_ID, playerId: PLAYER, tileId: game.tileId, plan: game.plan }, initialSeed: `0x${SEED.toString(16)}` });
  const discard = vi.fn(async (k: GameKey): Promise<WriteResult> => {
    const hand = engine.hand!;
    const result = engine.discard();
    const next = engine.hand!;
    tiles.find((t) => t.id === hand.id)!.status = 2;
    tiles.push({ id: next.id, status: 3, plan: PLANS.indexOf(next.plan), orientation: 0, x: 0, y: 0 });
    views.setGame(k, {
      game: { ...game, seed: `0x${engine.seed.toString(16)}`, tileCount: engine.tileCount, discardedCount: 1, tileId: next.id, plan: PLANS.indexOf(next.plan) },
      tiles,
      builder: { gameId: GAME_ID, playerId: PLAYER, tileId: next.id, plan: PLANS.indexOf(next.plan) },
      initialSeed: `0x${SEED.toString(16)}`,
    });
    return { transactionHash: "0x1", events: [{ name: "Discarded", fields: { gameId: GAME_ID, tileId: hand.id, plan: PLANS.indexOf(hand.plan), points: result.points }, fromAddress: "0x2" }] };
  });
  const signer: GameSigner = {
    address: PLAYER,
    build: vi.fn(async () => ({ transactionHash: "0x2", events: [] })),
    discard,
    surrender: vi.fn(async (): Promise<WriteResult> => {
      const held = views.games.get(`challenge:${GAME_ID}`)!;
      held.game = { ...held.game, over: true };
      return { transactionHash: "0x3", events: [{ name: "GameOver", fields: { gameId: GAME_ID, score: 0 }, fromAddress: "0x2" }] };
    }),
  } as unknown as GameSigner;
  return { ...fakeSources({ views, signer: options.signer ? signer : null }), signer };
}

function open(path: string, s: ReturnType<typeof sources>) {
  const router = createTestRouter(path);
  render(<App router={router} sources={s.sources} />);
  return router;
}

const hand = () => screen.queryByRole("region", { name: "Your tile" });

beforeEach(() => {
  resetWelcomedForTests();
  markWelcomed();
});
afterEach(() => resetWelcomedForTests());

// The board's page module brings the renderer (three.js): its first import can take longer than findBy's 1 s in jsdom.
describe("/game/:gameId (P5)", { timeout: 15_000 }, () => {
  it("with no signer: the game read only, with a Connect to play notice and no hand", async () => {
    open(`/game/${GAME_ID}`, sources({ signer: false }));
    expect(await screen.findByRole("heading", { level: 1, name: `Challenge #${GAME_ID}` }, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText("Connect to play")).toBeInTheDocument();
    expect(hand()).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Board of 1 tiles$/)).toBeInTheDocument();
  });

  it("with a signer: playable; a discard shows the next tile from the engine and is sent through the signer", async () => {
    const s = sources({ signer: true });
    open(`/game/${GAME_ID}`, s);
    expect(await screen.findByRole("region", { name: "Your tile" }, {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByText("Connect to play")).not.toBeInTheDocument();
    const before = within(hand()!).getByRole("img", { name: /^Tile / }).getAttribute("aria-label");

    await userEvent.click(within(hand()!).getByRole("button", { name: /Discard/ }));
    await waitFor(() => expect(s.signer.discard).toHaveBeenCalledWith(key));
    await waitFor(() => expect(within(hand()!).getByRole("img", { name: /^Tile / }).getAttribute("aria-label")).not.toBe(before));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("an expired game: the hand offers only a surrender, and the Surrender dialog opens by itself", async () => {
    const s = sources({ signer: true, expiresAt: 100 });
    open(`/game/${GAME_ID}`, s);
    const dialog = await screen.findByRole("dialog", {}, { timeout: 5000 });
    expect(within(dialog).getByText(/24 hours are over/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Surrender" }));
    await waitFor(() => expect(s.signer.surrender).toHaveBeenCalledWith(key));
    expect(s.signer.discard).not.toHaveBeenCalled();
  });

  it("a game id that is not digits is not a game", async () => {
    open("/game/abc", sources({ signer: false }));
    expect(await screen.findByTestId("page", {}, { timeout: 5000 })).toBeInTheDocument();
  });
});
