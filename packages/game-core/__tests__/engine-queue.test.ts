// The three-tile queue (#645): the engine's `lookahead`, and Training played with it.
import { describe, expect, it } from "vitest";
import {
  EngineGame,
  LocalSession,
  PlanType,
  TRAINING_LOOKAHEAD,
  replayTraining,
  type Placement,
} from "../src";

const SEED = 0x5eed1234abcdn;
const PLANS = Object.values(PlanType);

/** Plays the first legal placement, or discards; `last` picks the last legal placement instead (another board). */
function play(game: EngineGame, last = false): void {
  const legal = game.legalPlacements();
  const p: Placement | undefined = last ? legal.at(-1) : legal[0];
  if (p) game.build(p);
  else game.discard();
}

/** The hand and the coming tiles as ids and plans. */
const queueOf = (game: EngineGame) => [game.hand, ...game.coming].filter((t) => t !== null).map((t) => [t!.id, t!.plan]);

describe("the engine's queue", () => {
  it("one tile known by default: nothing coming, the draw unchanged", () => {
    const game = EngineGame.start({ deck: "simple", seed: SEED });
    expect(game.coming).toEqual([]);
    expect(game.hand?.id).toBe(2);
    expect(game.tileCount).toBe(2);
  });

  it("the start draws three tiles: the hand and the two next, in draw order", () => {
    const game = EngineGame.start({ deck: "simple", seed: SEED, lookahead: 3 });
    expect(game.hand?.id).toBe(2);
    expect(game.coming.map((t) => t.id)).toEqual([3, 4]);
    expect(game.tileCount).toBe(4);
    // The first tile is the one the one-tile game draws: the queue only draws ahead of it.
    expect(game.hand?.plan).toBe(EngineGame.start({ deck: "simple", seed: SEED }).hand?.plan);
  });

  it("each move takes the hand from the queue and draws one more at its end", () => {
    const game = EngineGame.start({ deck: "simple", seed: SEED, lookahead: 3 });
    for (let i = 0; i < 6; i++) {
      const [, next, after] = queueOf(game);
      play(game);
      const now = queueOf(game);
      expect(now[0]).toEqual(next);
      expect(now[1]).toEqual(after);
      expect(now).toHaveLength(3);
      expect(now[2]![0]).toBe(after![0] as number + 1);
    }
  });

  it("no draw reads a move: two games of one seed played apart draw the same tiles", () => {
    const a = EngineGame.start({ deck: "simple", seed: SEED, lookahead: 3 });
    const b = EngineGame.start({ deck: "simple", seed: SEED, lookahead: 3 });
    const drawn = (game: EngineGame, last: boolean) => {
      const plans: PlanType[] = [];
      for (let i = 0; i < 10; i++) {
        plans.push(game.hand!.plan);
        if (i % 4 === 3) game.discard();
        else play(game, last);
      }
      return plans;
    };
    expect(drawn(a, false)).toEqual(drawn(b, true));
  });

  it("at the deck's end the queue runs short, then the game is over with every tile played", () => {
    const game = EngineGame.start({ deck: "simple", seed: SEED, lookahead: 3 });
    const lengths: number[] = [];
    let moves = 0;
    while (!game.over) {
      lengths.push(queueOf(game).length);
      play(game);
      moves++;
    }
    expect(moves).toBe(game.tileLimit - 1);
    expect(lengths.slice(-3)).toEqual([3, 2, 1]);
    expect(game.hand).toBeNull();
    expect(game.coming).toEqual([]);
    expect(game.built + game.discarded).toBe(game.tileLimit - 1);
  });

  it("a clone keeps its own queue", () => {
    const game = EngineGame.start({ deck: "simple", seed: SEED, lookahead: 3 });
    const copy = game.clone();
    play(copy);
    expect(game.coming.map((t) => t.id)).toEqual([3, 4]);
    expect(copy.coming.map((t) => t.id)).toEqual([4, 5]);
  });

  it("a surrender keeps the hand and the queue, as on chain", () => {
    const game = EngineGame.start({ deck: "simple", seed: SEED, lookahead: 3 });
    game.surrender();
    expect(game.over).toBe(true);
    expect(game.hand?.id).toBe(2);
  });

  it("a queue needs a random deck and a whole count", () => {
    expect(() => EngineGame.start({ deck: "simple", seed: SEED, lookahead: 0 })).toThrow("Game: invalid lookahead");
    expect(() => EngineGame.start({ deck: "tutorial", seed: SEED, lookahead: 3 })).toThrow("Game: a queue needs a random deck");
    expect(() => EngineGame.start({ deck: "story", seed: 0n, sequence: [PlanType.CCCCCFFFC], lookahead: 3 })).toThrow("Game: a queue needs a random deck");
  });
});

describe("Training with the queue", () => {
  it("a new game knows three tiles", () => {
    const session = LocalSession.start(SEED);
    expect(TRAINING_LOOKAHEAD).toBe(3);
    expect(session.state.hand?.tileId).toBe(2);
    expect(session.state.coming?.map((t) => t.tileId)).toEqual([3, 4]);
    const engine = replayTraining(SEED, []);
    expect(session.state.coming?.map((t) => t.plan)).toEqual(engine.coming.map((t) => PLANS.indexOf(t.plan)));
  });

  it("the last tiles: the queue shortens, nothing coming with the last tile", async () => {
    const session = LocalSession.start(SEED);
    while (!session.state.game!.over && (session.state.coming?.length ?? 0) > 0) await session.discard();
    expect(session.state.hand).not.toBeNull();
    expect(session.state.coming).toEqual([]);
    await session.discard();
    expect(session.state).toMatchObject({ hand: null, coming: [] });
    expect(session.state.game?.over).toBe(true);
  });
});
