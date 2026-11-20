import { describe, expect, it } from "vitest";
import { LocalSession, randomSeed } from "@paved/game-core";
import { boardOf } from "../src/data";

describe("boardOf", () => {
  it("gives the scene's tiles, score, tiles left (discards spent) and hand", async () => {
    const session = LocalSession.start(randomSeed());
    const deck = session.state.game!.deckSize;
    expect(boardOf(session.state)).toMatchObject({ score: 0, remaining: deck - 1, lastScored: [], over: false });
    await session.discard();
    const board = boardOf(session.state);
    expect(board.remaining).toBe(deck - 2);
    expect(board.hand).toEqual({ plan: session.state.hand!.plan });
  });
});
