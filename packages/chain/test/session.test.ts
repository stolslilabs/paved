import { describe, expect, test } from "vitest";
import { FakeGameViews, type FakeGame, type GameKey } from "../src/views";
import { GameSession } from "../src/session";
import type { DecodedEvent } from "../src/codec";

const C = 0x7fffffff;
const PLAYER = "0xabc";
const key: GameKey = { mode: "daily", gameId: 4 };

function fakeGame(): FakeGame {
  return {
    game: {
      id: 4, playerId: PLAYER, mode: 1, seed: "0x1", score: 0, over: false, tileCount: 2, placedCount: 1,
      discardedCount: 0, tileId: 2, plan: 7, remainingCount: 36, deckSize: 38, startTime: 1, endTime: 0, tournamentId: 0,
    },
    tiles: [
      { id: 1, status: 1, plan: 4, orientation: 1, x: C, y: C },
      { id: 2, status: 3, plan: 7, orientation: 0, x: 0, y: 0 },
    ],
    builder: { gameId: 4, playerId: PLAYER, tileId: 2, plan: 7, placedCount: 0, availableCount: 5 },
    characters: [1, 2, 3, 4, 5].map((role) => ({ role, placed: false, tileId: 0, x: 0, y: 0, spot: 0 })),
  };
}

function event(name: string, fields: DecodedEvent["fields"]): DecodedEvent {
  return { name, fields: { gameId: 4, ...fields }, fromAddress: "0x2" };
}

describe("GameSession", () => {
  test("loads the board, the hand and the characters with four reads", async () => {
    const views = new FakeGameViews();
    views.setGame(key, fakeGame());
    const session = new GameSession(views, key, PLAYER);
    await session.load();
    expect(session.state).toMatchObject({ status: "ready", readonly: false, hand: { tileId: 2, plan: 7 }, packedCharacters: 0 });
    expect(session.state.tiles.map((t) => t.id)).toEqual([1]);
    expect(views.calls).toEqual(["game daily:4", "tiles daily:4", "builder daily:4", "characters daily:4"]);
  });

  test("another player's game is read only, with no builder read", async () => {
    const views = new FakeGameViews();
    views.setGame(key, fakeGame());
    const session = new GameSession(views, key, "0xdef");
    await session.load();
    expect(session.state).toMatchObject({ status: "ready", readonly: true, hand: null });
    expect(views.calls).toEqual(["game daily:4", "tiles daily:4"]);
  });

  test("a missing game is a typed error", async () => {
    const session = new GameSession(new FakeGameViews(), key, PLAYER);
    await session.load();
    expect(session.state).toMatchObject({ status: "error", error: "game-not-found" });
  });

  test("a placement: pending at once, the receipt confirms it, one reconcile read, no board read", async () => {
    const views = new FakeGameViews();
    views.setGame(key, fakeGame());
    const session = new GameSession(views, key, PLAYER);
    await session.load();
    views.calls = [];

    let release!: () => void;
    const sent = new Promise<void>((r) => (release = r));
    const placing = session.place({ orientation: 2, x: C + 1, y: C, role: 3, spot: 5 }, async () => {
      await sent;
      // The chain moved on: the contract's state after the build.
      const next = fakeGame();
      next.game = { ...next.game, score: 4, tileCount: 3, placedCount: 2, tileId: 3, plan: 9 };
      next.builder = { ...next.builder, tileId: 3, plan: 9, placedCount: 1, availableCount: 4 };
      next.characters[2] = { role: 3, placed: true, tileId: 2, x: C + 1, y: C, spot: 5 };
      views.setGame(key, next);
      return {
        transactionHash: "0x1",
        events: [
          event("Built", { playerId: PLAYER, tileId: 2, plan: 7, orientation: 2, x: C + 1, y: C, role: 3, spot: 5 }),
          event("Scored", { playerId: PLAYER, category: 2, size: 2, points: 4 }),
        ],
      };
    });

    expect(session.state).toMatchObject({ pending: true, hand: null });
    expect(session.state.tiles.at(-1)).toMatchObject({ id: 2, pending: true });
    expect(session.state.characters).toEqual([expect.objectContaining({ role: 3, pending: true })]);

    release();
    expect(await placing).toBe(true);
    expect(session.state).toMatchObject({ pending: false, hand: { tileId: 3, plan: 9 }, packedCharacters: 1 << 3 });
    expect(session.state.game?.score).toBe(4);
    expect(session.state.tiles.map((t) => [t.id, t.pending ?? false])).toEqual([[1, false], [2, false]]);
    expect(views.calls).toEqual(["game daily:4", "builder daily:4", "characters daily:4"]);
  });

  test("a failed write takes the pending tile back and gives the hand back", async () => {
    const views = new FakeGameViews();
    views.setGame(key, fakeGame());
    const session = new GameSession(views, key, PLAYER);
    await session.load();
    const ok = await session.place({ orientation: 1, x: C, y: C + 1, role: 0, spot: 0 }, async () => {
      throw new Error("Tile: not compatible");
    });
    expect(ok).toBe(false);
    expect(session.state).toMatchObject({ pending: false, hand: { tileId: 2 }, writeError: "Tile: not compatible" });
    expect(session.state.tiles.map((t) => t.id)).toEqual([1]);
  });

  test("GameOver ends the game from the receipt", async () => {
    const views = new FakeGameViews();
    views.setGame(key, fakeGame());
    const session = new GameSession(views, key, PLAYER);
    await session.load();
    const scores: number[] = [];
    session.subscribe((s) => s.game && scores.push(s.game.score));
    await session.surrender(async () => {
      const over = fakeGame();
      over.game = { ...over.game, over: true, score: 0, tileId: 0, plan: 0 };
      views.setGame(key, over);
      return { transactionHash: "0x2", events: [event("GameOver", { playerId: PLAYER, tournamentId: 0, mode: 1, score: 0, startTime: 1, endTime: 0 })] };
    });
    expect(session.state).toMatchObject({ hand: null, game: { over: true } });
  });

  test("no write in read-only mode", async () => {
    const views = new FakeGameViews();
    views.setGame(key, fakeGame());
    const session = new GameSession(views, key, null);
    await session.load();
    expect(await session.discard(async () => { throw new Error("must not be sent"); })).toBe(false);
  });
});
