import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CENTER,
  EngineGame,
  LocalSession,
  OrientationType,
  TRAINING_KEY,
  TUTORIAL_STORAGE_KEY,
  TutorialRun,
  loadGame,
  loadMoves,
  openTraining,
  replayTraining,
  replayTutorial,
  saveMoves,
  scriptedMoves,
  type KeyValueStore,
} from "../src";

// Written by the app-web code before the move (P2), byte for byte: a Training game of 9 builds, and a whole tutorial
// (8 stages and the burned tile). A game saved by today's app must resume on the moved sessions.
const OLD_TRAINING_SAVE =
  '{"v":1,"seed":"0x5eed1234abcd","moves":[{"k":"b","o":1,"x":0,"y":1},{"k":"b","o":3,"x":0,"y":-1},{"k":"b","o":2,"x":1,"y":0},{"k":"b","o":1,"x":-1,"y":0},{"k":"b","o":1,"x":0,"y":2},{"k":"b","o":3,"x":-1,"y":1},{"k":"b","o":1,"x":-2,"y":0},{"k":"b","o":1,"x":0,"y":3},{"k":"b","o":1,"x":1,"y":-1}]}';
const OLD_TRAINING_SCORE = 740;
const OLD_TUTORIAL_SAVE =
  '{"version":1,"moves":[{"kind":"build","orientation":1,"x":-1,"y":0},{"kind":"build","orientation":2,"x":-1,"y":-1},{"kind":"build","orientation":2,"x":-1,"y":-2},{"kind":"build","orientation":4,"x":0,"y":-1},{"kind":"build","orientation":2,"x":0,"y":-2},{"kind":"build","orientation":1,"x":1,"y":-2},{"kind":"build","orientation":2,"x":1,"y":-1},{"kind":"discard"},{"kind":"build","orientation":4,"x":1,"y":0}]}';

const ORIENTATIONS = Object.values(OrientationType);

function memoryStore(initial: Record<string, string> = {}): KeyValueStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

afterEach(() => vi.restoreAllMocks());

describe("saves written before the move", () => {
  it("resume a Training game, and the next save keeps the format byte for byte", async () => {
    const store = memoryStore({ [TRAINING_KEY]: OLD_TRAINING_SAVE });
    const session = openTraining(() => store);
    expect(session.score).toBe(OLD_TRAINING_SCORE);
    expect(session.state.tiles).toHaveLength(10);
    expect(session.state.game?.placedCount).toBe(10);
    expect(loadGame(() => store)).toEqual(JSON.parse(OLD_TRAINING_SAVE));

    // One more move appends to the same JSON: the saved prefix is unchanged.
    const mirror = replayTraining(0x5eed1234abcdn, JSON.parse(OLD_TRAINING_SAVE).moves);
    const legal = mirror.legalPlacements();
    if (legal.length === 0) await session.discard();
    else {
      const p = legal[0]!;
      await session.place({ orientation: ORIENTATIONS.indexOf(p.orientation), x: CENTER + p.x, y: CENTER + p.y });
    }
    const next = store.data.get(TRAINING_KEY)!;
    expect(next.startsWith(OLD_TRAINING_SAVE.slice(0, -2))).toBe(true);
  });

  it("resume a tutorial, and saving the same moves writes the same bytes", () => {
    const store = memoryStore({ [TUTORIAL_STORAGE_KEY]: OLD_TUTORIAL_SAVE });
    const moves = loadMoves(() => store);
    expect(moves).toEqual(scriptedMoves());
    expect(replayTutorial(moves).game.score).toBe(2794);
    const again = memoryStore();
    saveMoves(moves, () => again);
    expect(again.data.get(TUTORIAL_STORAGE_KEY)).toBe(OLD_TUTORIAL_SAVE);
  });
});

describe("sessions keep their engine between moves", () => {
  it("LocalSession applies each move to its engine: one start, one build per move, no replay", async () => {
    const start = vi.spyOn(EngineGame, "start");
    const build = vi.spyOn(EngineGame.prototype, "build");
    const discard = vi.spyOn(EngineGame.prototype, "discard");
    const session = LocalSession.start(0x1234abcdn, () => memoryStore());
    const mirror = EngineGame.start({ deck: "simple", seed: 0x1234abcdn });
    start.mockClear();
    build.mockClear();
    discard.mockClear();
    let moves = 0;
    for (; moves < 12 && !session.state.game!.over; moves++) {
      const legal = mirror.legalPlacements();
      if (legal.length === 0) {
        mirror.discard();
        await session.discard();
      } else {
        const p = legal[0]!;
        mirror.build(p);
        await session.place({ orientation: ORIENTATIONS.indexOf(p.orientation), x: CENTER + p.x, y: CENTER + p.y });
      }
    }
    expect(start).not.toHaveBeenCalled();
    // The mirror's own calls are counted too: one each per move, so the session made exactly one per move.
    expect(build.mock.calls.length + discard.mock.calls.length).toBe(2 * moves);
    expect(session.score).toBe(mirror.score);
  });

  it("the tutorial run plays only the new move, and replays only to resume or go back", () => {
    const moves = scriptedMoves();
    const run = new TutorialRun();
    const build = vi.spyOn(EngineGame.prototype, "build");
    const discard = vi.spyOn(EngineGame.prototype, "discard");
    let previous = run.sync([]);
    for (let i = 1; i <= moves.length; i++) {
      build.mockClear();
      discard.mockClear();
      const view = run.sync(moves.slice(0, i));
      expect(build.mock.calls.length + discard.mock.calls.length).toBe(1);
      expect(view.game).not.toBe(previous.game);
      previous = view;
    }
    // A fresh run starts from the empty run's engine: no replay so far.
    expect(run.replays).toBe(0);
    expect(previous.over).toBe(true);
    expect(previous.game.score).toBe(2794);
    // The same moves again: the same view, nothing played.
    build.mockClear();
    expect(run.sync(moves)).toBe(previous);
    expect(build).not.toHaveBeenCalled();
    // Back: the engine has no undo, so the run replays once.
    const back = run.sync(moves.slice(0, 3));
    expect(run.replays).toBe(1);
    expect(back.game.score).toBe(replayTutorial(moves.slice(0, 3)).game.score);
    // An earlier view is a copy: it did not change.
    expect(previous.game.score).toBe(2794);
  });

  it("a refused move leaves the tutorial run as it was", () => {
    const run = new TutorialRun();
    const view = run.sync([]);
    expect(() => run.sync([{ kind: "discard" }])).toThrow("not a discard step");
    expect(run.sync([])).toBe(view);
  });
});
