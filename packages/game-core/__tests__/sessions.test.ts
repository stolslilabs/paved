import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CENTER,
  EngineGame,
  LocalSession,
  OrientationType,
  TRAINING_KEY,
  loadGame,
  openTraining,
  replayTraining,
  type KeyValueStore,
} from "../src";

// Written by the legacy client (app-web, removed in P-70; see git history) before the move (P2), byte for byte: a Training game of 9 builds. A game saved by today's app must resume on the moved sessions.
const OLD_TRAINING_SAVE =
  '{"v":1,"seed":"0x5eed1234abcd","moves":[{"k":"b","o":1,"x":0,"y":1},{"k":"b","o":3,"x":0,"y":-1},{"k":"b","o":2,"x":1,"y":0},{"k":"b","o":1,"x":-1,"y":0},{"k":"b","o":1,"x":0,"y":2},{"k":"b","o":3,"x":-1,"y":1},{"k":"b","o":1,"x":-2,"y":0},{"k":"b","o":1,"x":0,"y":3},{"k":"b","o":1,"x":1,"y":-1}]}';
const OLD_TRAINING_SCORE = 740;

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

});
