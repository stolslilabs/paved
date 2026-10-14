import { describe, expect, test, vi } from "vitest";
import { FakeGameViews, type FakeGame, type GameKey } from "../src/views";
import { GameSession } from "../src/session";
import type { DecodedEvent } from "../src/codec";
import { GameExpiredError, GAME_EXPIRED_TEXT } from "../src/writer";

const C = 0x7fffffff;
const PLAYER = "0xabc";
const key: GameKey = { mode: "challenge", gameId: 4 };

function fakeGame(expiresAt = 2 ** 40): FakeGame {
  return {
    game: {
      id: 4, playerId: PLAYER, mode: 1, seed: "0x1", score: 0, over: false, tileCount: 2, placedCount: 1,
      discardedCount: 0, tileId: 2, plan: 7, remainingCount: 36, deckSize: 38, startTime: 1, endTime: 0, dayId: 0, expiresAt,
    },
    tiles: [
      { id: 1, status: 1, plan: 4, orientation: 1, x: C, y: C },
      { id: 2, status: 3, plan: 7, orientation: 0, x: 0, y: 0 },
    ],
    builder: { gameId: 4, playerId: PLAYER, tileId: 2, plan: 7 },
  };
}

function event(name: string, fields: DecodedEvent["fields"]): DecodedEvent {
  return { name, fields: { gameId: 4, ...fields }, fromAddress: "0x2" };
}

describe("GameSession", () => {
  test("loads the board and the hand with two reads", async () => {
    const views = new FakeGameViews();
    views.setGame(key, fakeGame());
    const session = new GameSession(views, key, PLAYER);
    await session.load();
    expect(session.state).toMatchObject({ status: "ready", readonly: false, hand: { tileId: 2, plan: 7 }, lastScored: [] });
    expect(session.state.tiles.map((t) => t.id)).toEqual([1]);
    expect(views.calls).toEqual(["game challenge:4", "tiles challenge:4"]);
  });

  test("another player's game is read only, with no builder read", async () => {
    const views = new FakeGameViews();
    views.setGame(key, fakeGame());
    const session = new GameSession(views, key, "0xdef");
    await session.load();
    expect(session.state).toMatchObject({ status: "ready", readonly: true, hand: null });
    expect(views.calls).toEqual(["game challenge:4", "tiles challenge:4"]);
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
    const placing = session.place({ orientation: 2, x: C + 1, y: C }, async () => {
      await sent;
      // The chain moved on: the contract's state after the build.
      const next = fakeGame();
      next.game = { ...next.game, score: 4, tileCount: 3, placedCount: 2, tileId: 3, plan: 9 };
      views.setGame(key, next);
      return {
        transactionHash: "0x1",
        events: [
          event("Built", { playerId: PLAYER, tileId: 2, plan: 7, orientation: 2, x: C + 1, y: C }),
          event("Scored", { playerId: PLAYER, category: 2, size: 2, points: 4 }),
        ],
      };
    });

    expect(session.state).toMatchObject({ pending: true, hand: null });
    expect(session.state.tiles.at(-1)).toMatchObject({ id: 2, pending: true });

    release();
    expect(await placing).toBe(true);
    expect(session.state).toMatchObject({ pending: false, hand: { tileId: 3, plan: 9 } });
    expect(session.state.game?.score).toBe(4);
    expect(session.state.tiles.map((t) => [t.id, t.pending ?? false])).toEqual([[1, false], [2, false]]);
    expect(views.calls).toEqual(["game challenge:4"]);
  });

  test("a failed write takes the pending tile back and gives the hand back", async () => {
    const views = new FakeGameViews();
    views.setGame(key, fakeGame());
    const session = new GameSession(views, key, PLAYER);
    await session.load();
    const ok = await session.place({ orientation: 1, x: C, y: C + 1 }, async () => {
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
      return { transactionHash: "0x2", events: [event("GameOver", { playerId: PLAYER, dayId: 0, mode: 1, score: 0, startTime: 1, endTime: 0 })] };
    });
    expect(session.state).toMatchObject({ hand: null, game: { over: true } });
  });

  test("a failed read after a successful write is a read error, not a write error", async () => {
    const views = new FakeGameViews();
    views.setGame(key, fakeGame());
    const session = new GameSession(views, key, PLAYER);
    await session.load();
    const ok = await session.place({ orientation: 2, x: C + 1, y: C }, async () => {
      views.games.clear(); // the node fails the next read
      return {
        transactionHash: "0x1",
        events: [event("Built", { playerId: PLAYER, tileId: 2, plan: 7, orientation: 2, x: C + 1, y: C })],
      };
    });
    expect(ok).toBe(true);
    expect(session.state).toMatchObject({ writeError: null, readError: "Game: does not exist", pending: false });
    expect(session.state.tiles.map((t) => [t.id, t.pending ?? false])).toEqual([[1, false], [2, false]]);
  });

  describe("lastScored", () => {
    const loaded = async () => {
      const views = new FakeGameViews();
      views.setGame(key, fakeGame());
      const session = new GameSession(views, key, PLAYER);
      await session.load();
      return session;
    };
    const built = event("Built", { playerId: PLAYER, tileId: 2, plan: 7, orientation: 2, x: C + 1, y: C });
    const scored = (category: number, size: number, points: number) => event("Scored", { playerId: PLAYER, category, size, points });

    test("holds one entry per Scored event of the receipt, in order", async () => {
      const session = await loaded();
      expect(session.state.lastScored).toEqual([]);
      await session.place({ orientation: 2, x: C + 1, y: C }, async () => ({
        transactionHash: "0x1",
        events: [built, scored(2, 3, 6), scored(3, 4, 8)],
      }));
      expect(session.state.lastScored).toEqual([
        { category: 2, size: 3, points: 6 },
        { category: 3, size: 4, points: 8 },
      ]);
    });

    test("a forest closed at 0 points is still an entry", async () => {
      const session = await loaded();
      await session.place({ orientation: 2, x: C + 1, y: C }, async () => ({
        transactionHash: "0x1",
        events: [built, scored(1, 2, 0)],
      }));
      expect(session.state.lastScored).toEqual([{ category: 1, size: 2, points: 0 }]);
    });

    test("a move that closes nothing leaves it empty, and the next write clears the last one", async () => {
      const session = await loaded();
      await session.place({ orientation: 2, x: C + 1, y: C }, async () => ({ transactionHash: "0x1", events: [built, scored(2, 3, 6)] }));
      expect(session.state.lastScored).toHaveLength(1);

      let during: unknown;
      await session.discard(async () => {
        during = session.state.lastScored;
        return { transactionHash: "0x2", events: [event("Discarded", { playerId: PLAYER, tileId: 3, plan: 9, points: 0 })] };
      });
      expect(during).toEqual([]);
      expect(session.state.lastScored).toEqual([]);
    });

    test("a failed write leaves it empty", async () => {
      const session = await loaded();
      await session.place({ orientation: 2, x: C + 1, y: C }, async () => ({ transactionHash: "0x1", events: [built, scored(2, 3, 6)] }));
      expect(session.state.lastScored).toHaveLength(1);
      await session.place({ orientation: 2, x: C + 2, y: C }, async () => {
        throw new Error("Tile: not compatible");
      });
      expect(session.state.lastScored).toEqual([]);
    });

  });

  test("no write in read-only mode", async () => {
    const views = new FakeGameViews();
    views.setGame(key, fakeGame());
    const session = new GameSession(views, key, null);
    await session.load();
    expect(await session.discard(async () => { throw new Error("must not be sent"); })).toBe(false);
  });

  describe("the 24 h expiry (S1)", () => {
    const EXPIRES = 86401;
    const ok = async () => ({ transactionHash: "0x2", events: [] });

    async function loaded(now: number) {
      const views = new FakeGameViews();
      views.setGame(key, fakeGame(EXPIRES));
      const session = new GameSession(views, key, PLAYER, () => now);
      await session.load();
      return { views, session };
    }

    test("before the boundary second a move is sent", async () => {
      const { session } = await loaded(EXPIRES - 1);
      const send = vi.fn(ok);
      expect(await session.discard(send)).toBe(true);
      expect(send).toHaveBeenCalledTimes(1);
    });

    test("from the boundary second, build and discard send nothing and say why", async () => {
      for (const now of [EXPIRES, EXPIRES + 5000]) {
        const { session } = await loaded(now);
        const send = vi.fn(ok);
        expect(await session.place({ orientation: 0, x: C + 1, y: C }, send)).toBe(false);
        expect(session.state.writeError).toBe(GAME_EXPIRED_TEXT);
        expect(await session.discard(send)).toBe(false);
        expect(send).not.toHaveBeenCalled();
        expect(session.state).toMatchObject({ pending: false, hand: { tileId: 2, plan: 7 } });
        expect(session.state.tiles.map((t) => t.id)).toEqual([1]);
      }
    });

    test("surrender is never blocked by the pre-check", async () => {
      const { session } = await loaded(EXPIRES + 1);
      const send = vi.fn(ok);
      expect(await session.surrender(send)).toBe(true);
      expect(send).toHaveBeenCalledTimes(1);
    });

    test("a revert after a race: the move is undone, the error shown", async () => {
      const { session } = await loaded(EXPIRES - 1);
      const raced = vi.fn(async () => {
        throw new GameExpiredError("0x9");
      });
      expect(await session.place({ orientation: 0, x: C + 1, y: C }, raced)).toBe(false);
      expect(session.state).toMatchObject({ pending: false, writeError: GAME_EXPIRED_TEXT, hand: { tileId: 2, plan: 7 } });
      expect(session.state.tiles.map((t) => t.id)).toEqual([1]);
    });
  });
});
