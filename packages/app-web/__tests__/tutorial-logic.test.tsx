// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { EngineGame } from "@paved/game-core";
import {
  NOT_A_BUILD,
  NOT_A_DISCARD,
  WRONG_ORIENTATION,
  WRONG_SQUARE,
  attempt,
  back,
  TUTORIAL_STORAGE_KEY,
  finalScore,
  loadMoves,
  replayTutorial as replay,
  saveMoves,
  scriptedMoves,
  tutorialSteps,
  type TutorialMove,
} from "@paved/game-core";

interface Golden {
  name: string;
  moves: Array<{ score: number }>;
  final: { score: number; built: number; discarded: number; tile_count: number; over: boolean };
}
const parity = JSON.parse(readFileSync(resolve(__dirname, "../../game-core/__tests__/fixtures/parity.json"), "utf8")) as { games: Golden[] };
const golden = parity.games.find((g) => g.name === "tutorial_full") as Golden;

describe("the tutorial's steps", () => {
  it("are the 8 stages in order with the burned tile between the seventh and the last", () => {
    const steps = tutorialSteps();
    expect(steps.map((s) => s.kind)).toEqual(["build", "build", "build", "build", "build", "build", "build", "burn", "build"]);
    expect(steps.every((s) => s.text.length > 0)).toBe(true);
  });

  it("each preset move is legal on the engine, and every move's score is the golden's", () => {
    const game = EngineGame.start({ deck: "tutorial", seed: 0n });
    const scores: number[] = [];
    for (const step of tutorialSteps()) {
      if (step.kind === "burn") {
        expect(game.scriptedPlacement()).toBeNull();
        scores.push(game.discard().score);
      } else {
        expect(game.refusal(step.placement!)).toBeNull();
        scores.push(game.build(step.placement!).score);
      }
    }
    expect(scores).toEqual(golden.moves.map((m) => m.score));
  });

  it("the whole tutorial played through the page's logic ends on the tutorial golden", () => {
    let moves: TutorialMove[] = [];
    for (const move of scriptedMoves()) {
      const result = attempt(moves, move);
      expect(result.ok).toBe(true);
      if (result.ok) moves = result.moves;
    }
    const view = replay(moves);
    expect(view.over).toBe(true);
    expect(view.step).toBeNull();
    expect(finalScore(moves)).toBe(golden.final.score);
    expect(view.game.built).toBe(golden.final.built);
    expect(view.game.discarded).toBe(golden.final.discarded);
    expect(view.game.tileCount).toBe(golden.final.tile_count);
  });
});

describe("only the preset move is accepted", () => {
  const first = scriptedMoves()[0] as Extract<TutorialMove, { kind: "build" }>;

  it("refuses another square, another orientation and a discard, and the run is unchanged", () => {
    expect(attempt([], { ...first, x: first.x + 1 })).toEqual({ ok: false, reason: WRONG_SQUARE });
    expect(attempt([], { ...first, orientation: (first.orientation % 4) + 1 })).toEqual({ ok: false, reason: WRONG_ORIENTATION });
    expect(attempt([], { kind: "discard" })).toEqual({ ok: false, reason: NOT_A_DISCARD });
  });

  it("refuses a build on the burn step, and a move after the end", () => {
    const moves = scriptedMoves();
    expect(attempt(moves.slice(0, 7), first)).toEqual({ ok: false, reason: NOT_A_BUILD });
    expect(attempt(moves, { kind: "discard" }).ok).toBe(false);
  });

  it("back drops the last move", () => {
    const moves = scriptedMoves().slice(0, 3);
    expect(back(moves)).toEqual(moves.slice(0, 2));
    expect(back([])).toEqual([]);
  });

  it("a replay of a move that is not the step's throws", () => {
    expect(() => replay([{ ...first, x: first.x + 1 }])).toThrow();
    expect(() => replay([{ kind: "discard" }])).toThrow();
  });
});

describe("local progress", () => {
  const original = Object.getOwnPropertyDescriptor(window, "localStorage");
  afterEach(() => {
    if (original) Object.defineProperty(window, "localStorage", original);
    else Reflect.deleteProperty(window, "localStorage");
    window.localStorage.clear();
  });

  it("saves the moves and loads them back; an empty run clears the entry", () => {
    const moves = scriptedMoves().slice(0, 4);
    saveMoves(moves);
    expect(loadMoves()).toEqual(moves);
    saveMoves([]);
    expect(window.localStorage.getItem(TUTORIAL_STORAGE_KEY)).toBeNull();
    expect(loadMoves()).toEqual([]);
  });

  it("ignores a save that is not JSON, of another version or no longer replays", () => {
    for (const raw of ["{", JSON.stringify({ version: 2, moves: [] }), JSON.stringify({ version: 1, moves: [{ kind: "discard" }] }), JSON.stringify({ version: 1, moves: [1] })]) {
      window.localStorage.setItem(TUTORIAL_STORAGE_KEY, raw);
      expect(loadMoves()).toEqual([]);
    }
  });

  it("works with storage that throws", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    Object.defineProperty(window, "localStorage", { configurable: true, get: () => broken });
    expect(loadMoves()).toEqual([]);
    expect(() => saveMoves(scriptedMoves().slice(0, 2))).not.toThrow();
    expect(() => saveMoves([])).not.toThrow();
  });
});
