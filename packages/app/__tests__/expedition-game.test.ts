import { describe, expect, it, vi } from "vitest";
import { CENTER, Expedition, OrientationType, expeditionEndsAt, type ExpeditionEntry } from "@paved/game-core";
import { ExpeditionGame } from "../src/data/expedition-game";
import type { ExpeditionBoardRecord, ExpeditionPlay } from "../src/data/expedition-source";

// An Expedition board on the page (`ExpeditionGame`): the hand's pick is the tile the board places; a move is applied at once and sent
// in order; a refusal of the source stops the board.

const WEEK = 403;
const ORIENTATIONS = Object.values(OrientationType);
const record = (log: ExpeditionEntry[] = [{ k: "draw", day: 0 }]): ExpeditionBoardRecord => ({ week: WEEK, player: "0x51a7", seed: "0x7", log, endsAt: expeditionEndsAt(WEEK) });

/** The picked tile's first legal move, as the page sends it (the chain's coordinates). */
function firstMove(game: ExpeditionGame) {
  for (const orientation of [1, 2, 3, 4]) {
    const [slot] = game.slots(orientation);
    if (slot) return { orientation, ...slot };
  }
  return null;
}

describe("an Expedition board on the page", () => {
  it("opens on the record's log: the map's tiles, the hand, the first tile picked", () => {
    const game = ExpeditionGame.open(record(), async () => {});
    const snapshot = game.snapshot;
    expect(snapshot.tiles).toHaveLength(8);
    expect(snapshot.tiles[0]).toMatchObject({ id: 1, x: CENTER, y: CENTER });
    expect(snapshot.hand).toHaveLength(6);
    expect(snapshot).toMatchObject({ selected: snapshot.hand[0]!.card, toCome: 36, score: 0, delta: null, lastDay: 0, sending: 0, refused: null });
    expect(game.bag).toHaveLength(42);
  });

  it("places the tile picked: its slots, its preview, then the move sent with its card", async () => {
    const sent: ExpeditionPlay[] = [];
    const game = ExpeditionGame.open(record(), async (move) => void sent.push(move));
    // A tile of the hand that goes somewhere.
    const card = game.snapshot.hand.find((c) => (game.select(c.card), firstMove(game) !== null))!.card;
    game.select(card);
    expect(game.snapshot.selected).toBe(card);
    const move = firstMove(game)!;
    expect(game.orientationsAt(move)).toContain(move.orientation);
    expect(game.preview(move)).not.toBeNull();
    expect(game.preview({ orientation: 1, x: CENTER + 9, y: CENTER })).toBeNull();
    const listener = vi.fn();
    game.subscribe(listener);
    expect(game.place(move)).toBe(true);
    expect(listener).toHaveBeenCalled();
    expect(game.snapshot.hand.map((c) => c.card)).not.toContain(card);
    expect(game.snapshot.tiles).toHaveLength(9);
    expect(game.snapshot.sending).toBe(1);
    await game.idle();
    expect(game.snapshot.sending).toBe(0);
    expect(sent).toEqual([{ k: "build", card, o: move.orientation, x: move.x - CENTER, y: move.y - CENTER }]);
    // The same board from the engine.
    const engine = Expedition.replay(WEEK, 7n, [{ k: "draw", day: 0 }, sent[0]!]);
    expect(game.snapshot.score).toBe(engine.score);
    expect(ORIENTATIONS[move.orientation]).toBeDefined();
  });

  it("discards the tile picked, and picks the hand's next", async () => {
    const sent: ExpeditionPlay[] = [];
    const game = ExpeditionGame.open(record(), async (move) => void sent.push(move));
    const [first, second] = game.snapshot.hand;
    expect(game.discard()).toBe(true);
    expect(game.snapshot).toMatchObject({ selected: second!.card, delta: -0 });
    expect(game.snapshot.discardedPlans).toEqual([first!.plan]);
    await game.idle();
    expect(sent).toEqual([{ k: "discard", card: first!.card }]);
  });

  it("stops on the source's refusal, and only shows a board with no sender", async () => {
    const game = ExpeditionGame.open(record(), async () => Promise.reject(new Error("Expedition: the week is over")));
    game.discard();
    await game.idle();
    expect(game.snapshot.refused).toBe("Expedition: the week is over");
    expect(game.slots(1)).toEqual([]);
    expect(game.discard()).toBe(false);
    const shown = ExpeditionGame.open(record(), null);
    expect(shown.writable).toBe(false);
    expect(shown.discard()).toBe(false);
    expect([1, 2, 3, 4].flatMap((o) => shown.slots(o))).toEqual([]);
  });
});
