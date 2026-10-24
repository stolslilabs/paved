import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CENTER,
  EngineGame,
  LocalSession,
  OrientationType,
  TRAINING_KEY,
  clearGame,
  startTraining,
  type KeyValueStore,
} from "../src";

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

describe("the old Training save (#718)", () => {
  it("is cleared by clearGame, and the device's other keys stay", () => {
    const store = memoryStore({ [TRAINING_KEY]: '{"v":2,"seed":"0x5eed","moves":[]}', "paved.training-best.v1": "{}" });
    clearGame(() => store);
    expect(store.data.has(TRAINING_KEY)).toBe(false);
    expect(store.data.get("paved.training-best.v1")).toBe("{}");
  });

  it("clearGame passes when storage is off or throws", () => {
    expect(() => clearGame(() => null)).not.toThrow();
    expect(() =>
      clearGame(() => {
        throw new DOMException("denied", "SecurityError");
      }),
    ).not.toThrow();
  });
});

describe("sessions keep their engine between moves", () => {
  it("LocalSession applies each move to its engine: one start, one build per move, no replay", async () => {
    const start = vi.spyOn(EngineGame, "start");
    const build = vi.spyOn(EngineGame.prototype, "build");
    const discard = vi.spyOn(EngineGame.prototype, "discard");
    const session = LocalSession.start(0x1234abcdn);
    const mirror = startTraining(0x1234abcdn);
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
