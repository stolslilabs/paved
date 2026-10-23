import { slow } from "../test-slow";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeGameViews, type GameKey, type GameView, type TileView, type WriteResult } from "@paved/chain";
import { CENTER, EngineGame, PlanType } from "@paved/game-core";
import { App } from "../src/App";
import { planCode } from "../src/components/elements/tile-chip";
import type { GameSigner } from "../src/data";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { fakeSources } from "./data-fakes";
import { preloadPages, discardTile } from "./route-helpers";

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
function sources(options: { signer: boolean; expiresAt?: number; address?: string }) {
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
    address: options.address ?? PLAYER,
    build: vi.fn(async () => ({ transactionHash: "0x2", events: [] })),
    discard,
    surrender: vi.fn(async (): Promise<WriteResult> => {
      const held = views.games.get(`challenge:${GAME_ID}`)!;
      held.game = { ...held.game, over: true };
      return { transactionHash: "0x3", events: [{ name: "GameOver", fields: { gameId: GAME_ID, score: 0 }, fromAddress: "0x2" }] };
    }),
  } as unknown as GameSigner;
  return { ...fakeSources({ views, signer: options.signer ? signer : null }), signer, views };
}

function open(path: string, s: ReturnType<typeof sources>) {
  const router = createTestRouter(path);
  render(<App router={router} sources={s.sources} />);
  return router;
}

const hand = () => screen.queryByRole("region", { name: "Your tile" });
/** The tile in hand on a read-only board's stack ("Deck"), its plan's code: the watcher sees what the player holds (#701). */
const watched = () => {
  const top = screen.getByRole("region", { name: "Deck" }).querySelector<HTMLElement>("[data-stack-top]");
  return top ? within(top).getByRole("img").getAttribute("aria-label")!.toLowerCase().split(",")[0] : null;
};

preloadPages("board", "over");

beforeEach(() => {
  resetWelcomedForTests();
  markWelcomed();
});
afterEach(() => resetWelcomedForTests());

// The board's page module brings the renderer (three.js): its first import can take longer than findBy's 1 s in jsdom.
describe("/game/:gameId (P5)", () => {
  it("with no signer: the game read only, with a Connect to play notice; the player's tile shown, nothing to play (#701)", async () => {
    const s = sources({ signer: false });
    open(`/game/${GAME_ID}`, s);
    expect(await screen.findByText("Connect to play", {}, { timeout: slow(5000) })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: `Challenge #${GAME_ID}` })).toBeInTheDocument();
    expect(hand()).not.toBeInTheDocument();
    expect(watched()).toEqual(`tile ${planCode(s.views.games.get(`challenge:${GAME_ID}`)!.game.plan).toLowerCase()}`);
    const deck = screen.getByRole("region", { name: "Deck" });
    expect(within(deck).queryByRole("button", { name: /discard/i })).toBeNull();
    expect(within(deck).queryByTestId("hand-hint")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Slot / })).toBeNull();
    expect(screen.getByLabelText(/^Board of 1 tiles$/)).toBeInTheDocument();
    // The board fills the viewport with nothing after it: no footer, and no Cartridge notice (#536).
    expect(screen.queryByRole("contentinfo")).toBeNull();
    expect(screen.queryByRole("link", { name: "Third-party notices" })).toBeNull();
    expect(screen.getByLabelText(/^Board of 1 tiles$/).closest(".h-dvh")).toHaveClass("overflow-hidden");
  });

  it("another player's game: read only, the player's tile shown (#701)", async () => {
    const s = sources({ signer: true, address: "0x999" });
    open(`/game/${GAME_ID}`, s);
    expect(await screen.findByText("Another player's game", {}, { timeout: slow(5000) })).toBeInTheDocument();
    expect(hand()).not.toBeInTheDocument();
    expect(watched()).toEqual(`tile ${planCode(s.views.games.get(`challenge:${GAME_ID}`)!.game.plan).toLowerCase()}`);
    expect(screen.queryByRole("button", { name: /^Slot / })).toBeNull();
  });

  it("with a signer: playable; a discard shows the next tile from the engine and is sent through the signer", async () => {
    const s = sources({ signer: true });
    open(`/game/${GAME_ID}`, s);
    expect(await screen.findByRole("region", { name: "Your tile" }, {}, { timeout: slow(5000) })).toBeInTheDocument();
    expect(screen.queryByText("Connect to play")).not.toBeInTheDocument();
    const before = within(hand()!).getByRole("img", { name: /^Tile / }).getAttribute("aria-label");

    await discardTile();
    await waitFor(() => expect(s.signer.discard).toHaveBeenCalledWith(key));
    await waitFor(() => expect(within(hand()!).getByRole("img", { name: /^Tile / }).getAttribute("aria-label")).not.toBe(before));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("an expired game: the stack's banner offers only a surrender, and the Surrender dialog opens by itself; once confirmed, the scores", async () => {
    const s = sources({ signer: true, expiresAt: 100 });
    const router = open(`/game/${GAME_ID}`, s);
    const dialog = await screen.findByRole("dialog", {}, { timeout: slow(5000) });
    expect(within(dialog).getByText(/24 hours are over/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Surrender" }));
    await waitFor(() => expect(s.signer.surrender).toHaveBeenCalledWith(key));
    expect(s.signer.discard).not.toHaveBeenCalled();
    // A surrender has no last move to watch: no hold (`useAfterGameOver`'s `hold`, its own test), the scores once confirmed.
    await waitFor(() => expect(router.state.location.pathname).toBe(`/game/${GAME_ID}/over`), { timeout: slow(5000) });
  });

  it("with a signer of another address: read only, with the Another player's game notice", async () => {
    const s = sources({ signer: true, address: "0xdef" });
    open(`/game/${GAME_ID}`, s);
    expect(await screen.findByText("Another player's game", {}, { timeout: slow(5000) })).toBeInTheDocument();
    expect(hand()).not.toBeInTheDocument();
    expect(screen.queryByText("Connect to play")).not.toBeInTheDocument();
  });

  it("a resync whose re-read fails keeps the board with a Retry, which re-reads it", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const s = sources({ signer: true });
    open(`/game/${GAME_ID}`, s);
    expect(await screen.findByRole("region", { name: "Your tile" }, {}, { timeout: slow(5000) })).toBeInTheDocument();
    // Another tab discards: the board's next discard is predicted from a stale hand, and the chain's result differs.
    await s.signer.discard(key);
    const tiles = s.views.tiles.bind(s.views);
    let failures = 1;
    s.views.tiles = async (k) => {
      if (failures-- > 0) throw new Error("rpc: timeout");
      return tiles(k);
    };
    await discardTile();
    expect(await screen.findByText("The board may be out of date")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.queryByText("The board may be out of date")).not.toBeInTheDocument());
    expect(screen.getByText("Board resynced")).toBeInTheDocument();
  });

  it("a game id that is not digits is not a game", async () => {
    open("/game/abc", sources({ signer: false }));
    expect(await screen.findByTestId("page", {}, { timeout: slow(5000) })).toBeInTheDocument();
  });
});

// #645: a game on the VRF. `draw(id)` (the fake of the chain view) gives the queue; the client predicts no draw.
describe("/game/:gameId on the VRF (#645)", () => {
  /** A VRF game held by the fake: the engine's three-tile queue stands in for the chain's; a discard waits for `release`. */
  function vrfSources(options: { signer: boolean } = { signer: true }) {
    const engine = EngineGame.start({ deck: "simple", seed: SEED, player: BigInt(PLAYER), lookahead: 3 });
    const views = new FakeGameViews();
    const tiles: TileView[] = [{ id: 1, status: 1, plan: PLANS.indexOf(PlanType.RFFFRFCFR), orientation: 3, x: CENTER, y: CENTER }];
    const put = () => {
      const hand = engine.hand!;
      if (!tiles.some((t) => t.id === hand.id)) tiles.push({ id: hand.id, status: 3, plan: PLANS.indexOf(hand.plan), orientation: 0, x: 0, y: 0 });
      const [next, after] = engine.coming.map((t) => PLANS.indexOf(t.plan));
      const game: GameView = {
        id: GAME_ID, playerId: PLAYER, mode: 1, seed: "0x1", score: engine.score, over: engine.over, tileCount: engine.tileCount,
        placedCount: engine.built + 1, discardedCount: engine.discarded, tileId: hand.id, plan: PLANS.indexOf(hand.plan),
        remainingCount: 0, deckSize: 38, startTime: 1, endTime: 0, dayId: 0, expiresAt: 2 ** 40,
      };
      const draws = engine.tileCount < engine.tileLimit;
      views.setGame(key, {
        game, tiles, builder: { gameId: GAME_ID, playerId: PLAYER, tileId: hand.id, plan: game.plan },
        draw: { gameId: GAME_ID, next: next ?? 0, after: after ?? 0, tiles: engine.tiles, vrf: true, draws, salt: draws ? "0x5a17" : "0x0" },
      });
    };
    put();
    let release = () => {};
    const discard = vi.fn(async (): Promise<WriteResult> => {
      await new Promise<void>((go) => (release = go));
      const hand = engine.hand!;
      const result = engine.discard();
      tiles.find((t) => t.id === hand.id)!.status = 2;
      put();
      return { transactionHash: "0x1", events: [{ name: "Discarded", fields: { gameId: GAME_ID, tileId: hand.id, plan: PLANS.indexOf(hand.plan), points: result.points }, fromAddress: "0x2" }] };
    });
    const signer = { address: PLAYER, build: vi.fn(), discard, surrender: vi.fn() } as unknown as GameSigner;
    return { ...fakeSources({ views, signer: options.signer ? signer : null }), engine, views, release: () => release() };
  }

  const coming = () => [...(within(hand()!).queryByTestId("coming-tiles")?.querySelectorAll("li") ?? [])].map((li) => li.getAttribute("data-coming"));

  it("read only (no wallet): the player's tile and the two coming tiles on the Deck stack, nothing to play (#701)", async () => {
    const s = vrfSources({ signer: false });
    open(`/game/${GAME_ID}`, s);
    expect(await screen.findByText("Connect to play", {}, { timeout: slow(5000) })).toBeInTheDocument();
    expect(hand()).not.toBeInTheDocument();
    const deck = screen.getByRole("region", { name: "Deck" });
    await waitFor(() => expect([...(within(deck).queryByTestId("coming-tiles")?.querySelectorAll("li") ?? [])].map((li) => li.getAttribute("data-coming"))).toEqual(["1", "2"]));
    expect(watched()).toEqual(`tile ${planCode(PLANS.indexOf(s.engine.hand!.plan)).toLowerCase()}`);
    const names = [...within(deck).getByTestId("coming-tiles").querySelectorAll('[role="img"]')].map((i) => i.getAttribute("aria-label")!.toLowerCase().split(",")[0]);
    expect(names).toEqual(s.engine.coming.map((t) => `tile ${planCode(PLANS.indexOf(t.plan)).toLowerCase()}`));
    expect(within(deck).queryByRole("button", { name: /discard/i })).toBeNull();
  });

  it("shows the tile to place and the two coming tiles; a move keeps the known tiles shown while the chain draws the last", async () => {
    const s = vrfSources();
    open(`/game/${GAME_ID}`, s);
    expect(await screen.findByRole("region", { name: "Your tile" }, {}, { timeout: slow(5000) })).toBeInTheDocument();
    await waitFor(() => expect(coming()).toEqual(["1", "2"]));
    expect(s.views.calls).toContain(`draw challenge:${GAME_ID}`);
    // No replay of the draw: the initial seed is never read.
    expect(s.views.calls).not.toContain(`initial_seed challenge:${GAME_ID}`);
    const next = s.engine.coming[0]!.plan;

    await discardTile();
    // The move on its way: the next tile is the one to place (waiting), the one after it next, the chain's draw last.
    await waitFor(() => expect(coming()).toEqual(["1", "drawing"]));
    expect(within(hand()!).getByText("Placing…")).toBeInTheDocument();
    s.release();
    await waitFor(() => expect(coming()).toEqual(["1", "2"]));
    expect(s.engine.hand!.plan).toBe(next);
  });
});
