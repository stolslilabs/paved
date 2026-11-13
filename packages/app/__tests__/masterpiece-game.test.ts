import { describe, expect, it, vi } from "vitest";
import { CENTER, Masterpiece, OrientationType, masterpieceCards, masterpieceEndsAt, masterpieceWeekOf, type MasterpieceEntry, type PlaceMove } from "@paved/game-core";
import { masterpieceBoardDay } from "../src/data/masterpiece";
import { MasterpieceGame } from "../src/data/masterpiece-game";
import type { MasterpieceBoardRecord } from "../src/data/masterpiece-source";

// A Masterpiece board on the page (`MasterpieceGame`): the record's log played again, the tile in hand by the day, a move applied at
// once and sent in order, a refusal of the source, and the day that opens the next tiles.

const WEEK = masterpieceWeekOf(Date.parse("2026-11-10T12:00:00Z") / 1000);
const ORIENTATIONS = Object.values(OrientationType);
const record = (log: MasterpieceEntry[] = []): MasterpieceBoardRecord => ({ week: WEEK, player: "0x51a7", seed: "0x7", log, endsAt: masterpieceEndsAt(WEEK) });

/** The first legal move of the game's tile in hand, in the chain's coordinates. */
function firstMove(game: MasterpieceGame): PlaceMove {
  for (const orientation of [1, 2, 3, 4]) {
    const slot = game.slots(orientation)[0];
    if (slot) return { orientation, ...slot };
  }
  throw new Error("no legal move");
}

describe("a Masterpiece board on the page", () => {
  it("shows the tile in hand while the day has tiles waiting, and applies a move at once", async () => {
    const sent: MasterpieceEntry[] = [];
    const game = MasterpieceGame.open(record(), 0, async (move) => void sent.push(move));
    expect(game.snapshot).toMatchObject({ waiting: 12, toCome: 72, played: 0, score: 0, delta: null, piece: null, sending: 0 });
    expect(game.snapshot.hand).not.toBeNull();
    expect(game.snapshot.tiles).toHaveLength(1);
    const move = firstMove(game);
    expect(game.orientationsAt({ x: move.x, y: move.y })).toContain(move.orientation);
    expect(game.preview(move)).not.toBeNull();
    expect(game.place(move)).toBe(true);
    expect(game.snapshot).toMatchObject({ waiting: 11, played: 1, sending: 1 });
    expect(game.snapshot.tiles).toHaveLength(2);
    await game.idle();
    expect(game.snapshot.sending).toBe(0);
    expect(sent).toEqual([{ k: "build", o: move.orientation, x: move.x - CENTER, y: move.y - CENTER }]);
    expect(game.discard()).toBe(true);
    await game.idle();
    expect(sent[1]).toEqual({ k: "discard" });
    expect(game.snapshot).toMatchObject({ played: 2, discards: 1, delta: 0 });
  });

  it("plays the record's log again, and holds no tile once the day's twelve are played", () => {
    const log: MasterpieceEntry[] = Array.from({ length: 12 }, () => ({ k: "discard" }));
    const game = MasterpieceGame.open(record(log), 0, async () => {});
    expect(game.snapshot).toMatchObject({ played: 12, waiting: 0, hand: null, toCome: 72 });
    expect(game.slots(1)).toEqual([]);
    expect(game.discard()).toBe(false);
    const listener = vi.fn();
    game.subscribe(listener);
    // Midnight: the next twelve open by themselves.
    game.setDay(1);
    expect(listener).toHaveBeenCalledOnce();
    expect(game.snapshot).toMatchObject({ waiting: 12, toCome: 60 });
    expect(game.snapshot.hand).not.toBeNull();
    game.setDay(1);
    expect(listener).toHaveBeenCalledOnce();
    // The week over: nothing waits.
    game.setDay(7);
    expect(game.snapshot).toMatchObject({ waiting: 0, toCome: 0, hand: null });
  });

  it("lists the cards of the days opened so far for the deck sheet", () => {
    const game = MasterpieceGame.open(record(), 1, null);
    expect(game.cards()).toEqual([...masterpieceCards(WEEK, 0), ...masterpieceCards(WEEK, 1)]);
    expect(game.writable).toBe(false);
    expect(game.slots(1)).toEqual([]);
  });

  it("stops at the source's refusal: no further move is applied or sent", async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error("Masterpiece: the week is over"));
    const game = MasterpieceGame.open(record(), 0, send);
    game.discard();
    await game.idle();
    expect(game.snapshot).toMatchObject({ refused: "Masterpiece: the week is over", sending: 0 });
    expect(game.discard()).toBe(false);
    expect(send).toHaveBeenCalledOnce();
  });

  it("keeps the engine's refusal of an illegal move on the board", () => {
    const game = MasterpieceGame.open(record(), 0, async () => {});
    expect(game.place({ orientation: 1, x: CENTER + 9, y: CENTER + 9 })).toBe(false);
    expect(game.snapshot).toMatchObject({ writeError: "Tile: no neighbors", played: 0 });
    expect(game.preview({ orientation: 1, x: CENTER + 9, y: CENTER + 9 })).toBeNull();
  });

  it("matches the engine's own board after the same moves", () => {
    const game = MasterpieceGame.open(record(), 6, async () => {});
    const engine = new Masterpiece(WEEK, 7n);
    for (let i = 0; i < 20; i++) {
      const p = engine.legalPlacements()[0];
      if (p) {
        engine.build(p);
        game.place({ orientation: ORIENTATIONS.indexOf(p.orientation), x: CENTER + p.x, y: CENTER + p.y });
      } else {
        engine.discard();
        game.discard();
      }
    }
    expect(game.snapshot).toMatchObject({ played: 20, score: engine.score, discards: engine.discards });
    expect(game.snapshot.tiles).toHaveLength(engine.laid + 1);
  });
});

describe("the day a board is on", () => {
  it("is the week's day, the week over after it, nothing before it", () => {
    const start = masterpieceEndsAt(WEEK - 1);
    expect([masterpieceBoardDay(WEEK, start), masterpieceBoardDay(WEEK, start + 3 * 86_400 + 5), masterpieceBoardDay(WEEK, masterpieceEndsAt(WEEK)), masterpieceBoardDay(WEEK, start - 1)]).toEqual([0, 3, 7, -1]);
  });
});
