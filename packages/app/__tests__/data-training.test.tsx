import { act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CENTER, EngineGame, LocalSession, OrientationType, TRAINING_KEY, randomSeed, replayTraining } from "@paved/game-core";
import { boardOf, useFinishedTraining, useTrainingSession } from "../src/data";
import { fakeSources, memoryStore, renderData } from "./data-fakes";

const ORIENTATIONS = Object.values(OrientationType);
const SEED = 0x5eed1234abcdn;

// Training draws its seed at each entry (#718): the test's, unless a test sets another.
const seeds = vi.hoisted(() => ({ next: null as bigint | null }));
vi.mock("@paved/game-core", async (original) => {
  const core = await original<typeof import("@paved/game-core")>();
  return { ...core, randomSeed: () => seeds.next ?? core.randomSeed() };
});
afterEach(() => {
  seeds.next = null;
  vi.restoreAllMocks();
});

/** The first legal move of `game`, as the engine places it and in the chain's coordinates the page sends. */
function firstMove(game: EngineGame) {
  const p = game.legalPlacements()[0]!;
  return { placement: p, move: { orientation: ORIENTATIONS.indexOf(p.orientation), x: CENTER + p.x, y: CENTER + p.y } };
}

describe("the board's Training session", () => {
  it("useTrainingSession starts a new game (two engines, one start each), then applies each move without a replay", async () => {
    seeds.next = SEED;
    const mirror = replayTraining(SEED, []);
    const start = vi.spyOn(EngineGame, "start");
    const { result } = renderData(() => useTrainingSession(), fakeSources().sources);
    // The session's engine and the rules engine beside it (slots, preview).
    expect(start).toHaveBeenCalledTimes(2);
    expect(result.current.game.seed).toBe(SEED);
    expect(result.current.board.tiles).toHaveLength(1);

    const first = firstMove(mirror);
    mirror.build(first.placement);
    await act(() => result.current.game.place(first.move));
    const second = firstMove(mirror);
    await act(() => result.current.game.place(second.move));
    expect(start).toHaveBeenCalledTimes(2);
    expect(result.current.board.tiles).toHaveLength(3);
    expect(result.current.board).toEqual(boardOf(result.current.state));
  });

  it("saves nothing, and clears the old save of the device once (#718)", async () => {
    const f = fakeSources({ store: () => store });
    const store = memoryStore({ [TRAINING_KEY]: JSON.stringify({ v: 2, seed: "0x5eed", moves: [] }), "paved.training-best.v1": "{}" });
    const { result } = renderData(() => useTrainingSession(), f.sources);
    expect(store.data.has(TRAINING_KEY)).toBe(false);
    expect(store.data.get("paved.training-best.v1")).toBe("{}");
    await act(() => result.current.game.discard());
    expect([...store.data.keys()]).toEqual(["paved.training-best.v1"]);
  });

  it("every entry is a new game with a new seed; Restart keeps the seed", async () => {
    const f = fakeSources();
    const one = renderData(() => useTrainingSession(), f.sources);
    await act(() => one.result.current.game.discard());
    const seed = one.result.current.game.seed;
    act(() => one.result.current.restart());
    expect(one.result.current.game.seed).toBe(seed);
    expect(one.result.current.board.remaining).toBe(one.result.current.state.game!.deckSize - 1);
    one.unmount();
    const two = renderData(() => useTrainingSession(), f.sources);
    expect(two.result.current.game.seed).not.toBe(seed);
    expect(two.result.current.state.game).toMatchObject({ score: 0, discardedCount: 0 });
  });

  it("useFinishedTraining reads the game the board holds; with none, a new game not yet played", async () => {
    const f = fakeSources();
    expect(renderData(() => useFinishedTraining(), f.sources).result.current.snapshot.state.game?.over).toBe(false);
    const board = renderData(() => useTrainingSession(), f.sources);
    await act(() => board.result.current.game.surrender());
    const over = renderData(() => useFinishedTraining(), f.sources);
    expect(over.result.current.game).toBe(board.result.current.game);
    expect(over.result.current.snapshot.state.game?.over).toBe(true);
  });

  it("boardOf gives the scene's tiles, score, tiles left (discards spent) and hand", async () => {
    const session = LocalSession.start(randomSeed());
    const deck = session.state.game!.deckSize;
    expect(boardOf(session.state)).toMatchObject({ score: 0, remaining: deck - 1, lastScored: [], over: false });
    await session.discard();
    const board = boardOf(session.state);
    expect(board.remaining).toBe(deck - 2);
    expect(board.hand).toEqual({ plan: session.state.hand!.plan });
  });
});
