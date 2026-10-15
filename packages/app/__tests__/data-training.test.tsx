import { act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CENTER, EngineGame, LocalSession, OrientationType, TRAINING_KEY, replayTraining, type SavedMove } from "@paved/game-core";
import { boardOf, useTrainingSave, useTrainingSession } from "../src/data";
import { dataOf, fakeSources, memoryStore, renderData } from "./data-fakes";

const ORIENTATIONS = Object.values(OrientationType);
const SEED = 0x5eed1234abcdn;
const save = (moves: SavedMove[]) => JSON.stringify({ v: 1, seed: `0x${SEED.toString(16)}`, moves });

/** The first legal move of the game replayed from `moves`, in the chain's coordinates the page sends. */
function firstMove(moves: SavedMove[]) {
  const p = replayTraining(SEED, moves).legalPlacements()[0]!;
  return { saved: { k: "b", o: ORIENTATIONS.indexOf(p.orientation), x: p.x, y: p.y } as SavedMove, move: { orientation: ORIENTATIONS.indexOf(p.orientation), x: CENTER + p.x, y: CENTER + p.y } };
}

describe("the board's Training session", () => {
  it("useTrainingSession resumes the save once, then applies each move without a replay", async () => {
    const first = firstMove([]);
    const second = firstMove([first.saved]);
    const store = memoryStore({ [TRAINING_KEY]: save([first.saved]) });
    const f = fakeSources({ store: () => store });
    const start = vi.spyOn(EngineGame, "start");
    const { result } = renderData(() => useTrainingSession(), f.sources);
    expect(start).toHaveBeenCalledTimes(1);
    expect(result.current.board.tiles).toHaveLength(2);

    await act(() => result.current.session.place(second.move));
    expect(start).toHaveBeenCalledTimes(1);
    expect(result.current.board.tiles).toHaveLength(3);
    expect(result.current.board).toEqual(boardOf(result.current.state));
    expect(JSON.parse(store.data.get(TRAINING_KEY)!).moves).toEqual([first.saved, second.saved]);
    start.mockRestore();
  });

  it("boardOf gives the scene's tiles, score, tiles left (discards spent) and hand", async () => {
    const session = LocalSession.start(SEED, () => memoryStore());
    const deck = session.state.game!.deckSize;
    expect(boardOf(session.state)).toMatchObject({ score: 0, remaining: deck - 1, lastScored: [], over: false });
    await session.discard();
    const board = boardOf(session.state);
    expect(board.remaining).toBe(deck - 2);
    expect(board.hand).toEqual({ plan: session.state.hand!.plan });
  });

  it("useTrainingSave gives the home card the saved game's score and tiles left; null with no save", async () => {
    const first = firstMove([]);
    const f = fakeSources({ store: () => memoryStore({ [TRAINING_KEY]: save([first.saved]) }) });
    const { result } = renderData(() => useTrainingSave(), f.sources);
    const resumed = LocalSession.resume({ v: 1, seed: `0x${SEED.toString(16)}`, moves: [first.saved] }, () => null)!;
    expect(await dataOf(result)).toEqual({ score: resumed.score, remaining: boardOf(resumed.state).remaining });
    const none = renderData(() => useTrainingSave(), fakeSources({ store: () => memoryStore() }).sources);
    expect(await dataOf(none.result)).toBeNull();
  });
});
