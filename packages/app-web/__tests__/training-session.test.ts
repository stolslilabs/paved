import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { EngineGame } from "@paved/game-core";
import {
  LocalSession,
  TRAINING_KEY,
  loadGame,
  openTraining,
  randomSeed,
  replayTraining as replay,
  saveGame,
  type KeyValueStore,
  type SavedMove,
} from "@paved/game-core";
import { CENTER } from "../src/utils/game-helpers";

const STARK_PRIME = (1n << 251n) + 17n * (1n << 192n) + 1n;

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}
const throwing = (): KeyValueStore => {
  const fail = () => {
    throw new Error("storage blocked");
  };
  return { getItem: fail, setItem: fail, removeItem: fail };
};

const send = () => Promise.reject(new Error("a local session never sends"));

/** The next move of a greedy player on a game: the first legal placement, else a discard. */
function nextMove(game: EngineGame): SavedMove {
  const placement = game.legalPlacements()[0];
  if (!placement) return { k: "d" };
  const orientations = ["", "North", "East", "South", "West"];
  return { k: "b", o: orientations.indexOf(placement.orientation), x: placement.x, y: placement.y };
}

describe("the seed", () => {
  it("is a different felt below the Stark prime for each new game", () => {
    const seeds = Array.from({ length: 20 }, () => randomSeed());
    expect(new Set(seeds).size).toBe(20);
    for (const seed of seeds) {
      expect(seed).toBeGreaterThan(0n);
      expect(seed).toBeLessThan(STARK_PRIME);
    }
  });

  it("makes two Training games with different seeds", () => {
    const a = LocalSession.start(randomSeed(), () => memoryStore());
    const b = LocalSession.start(randomSeed(), () => memoryStore());
    const store = memoryStore();
    openTraining(() => store);
    const first = loadGame(() => store)!.seed;
    store.data.clear();
    openTraining(() => store);
    expect(loadGame(() => store)!.seed).not.toBe(first);
    expect(a.state.tiles).toHaveLength(1);
    expect(b.state.tiles).toHaveLength(1);
  });

  it("never reads the date, and imports nothing but types from the chain package", () => {
    const now = vi.spyOn(Date, "now").mockImplementation(() => {
      throw new Error("the date was read");
    });
    try {
      const session = LocalSession.start(randomSeed(), () => memoryStore());
      expect(session.state.status).toBe("ready");
    } finally {
      now.mockRestore();
    }
    const dir = fileURLToPath(new URL("../src/training/", import.meta.url));
    for (const file of readdirSync(dir)) {
      const source = readFileSync(`${dir}${file}`, "utf8");
      expect(source, file).not.toMatch(/\bDate\b|performance\.now|^import (?!type)[^\n]*"@paved\/chain/m);
    }
  });
});

describe("LocalSession over the engine", () => {
  it("scores like the engine for the same seed and moves", async () => {
    const seed = 0x1234abcdn;
    const session = LocalSession.start(seed, () => memoryStore());
    const mirror = EngineGame.start({ deck: "simple", seed });
    for (let i = 0; i < 12 && !session.state.game!.over; i++) {
      const move = nextMove(mirror);
      const ok =
        move.k === "d"
          ? await session.discard(send)
          : move.k === "b"
            ? await session.place({ orientation: move.o, x: CENTER + move.x, y: CENTER + move.y }, send)
            : false;
      expect(ok).toBe(true);
      const result = move.k === "d" ? mirror.discard() : mirror.build({ orientation: legalOrientation(move), x: (move as { x: number }).x, y: (move as { y: number }).y });
      expect(session.state.game!.score).toBe(mirror.score);
      expect(session.state.lastScored.map((s) => s.points)).toEqual(result.scored.map((s) => s.points));
    }
    expect(session.state.tiles).toHaveLength(mirror.placed().length);
    expect(session.state.game!.discardedCount).toBe(mirror.discarded);
    expect(session.state.game!.placedCount).toBe(mirror.built + 1);
  });

  it("plays to the end: closures with points, discards, a final score equal to a replay", async () => {
    const seed = 0xfeedn;
    const store = memoryStore();
    const session = LocalSession.start(seed, () => store);
    const mirror = EngineGame.start({ deck: "simple", seed });
    let sawClosure = false;
    while (!session.state.game!.over) {
      const move = nextMove(mirror);
      if (move.k === "d") {
        await session.discard(send);
        mirror.discard();
      } else if (move.k === "b") {
        await session.place({ orientation: move.o, x: CENTER + move.x, y: CENTER + move.y }, send);
        mirror.build({ orientation: legalOrientation(move), x: move.x, y: move.y });
      }
      if (session.state.lastScored.some((s) => s.points > 0)) sawClosure = true;
    }
    expect(session.state.hand).toBeNull();
    expect(sawClosure).toBe(true);
    expect(session.state.game!.score).toBe(mirror.score);
    expect(mirror.over).toBe(true);
    // The saved moves replay to the same final state.
    const saved = loadGame(() => store)!;
    const again = replay(BigInt(saved.seed), saved.moves);
    expect(again.score).toBe(mirror.score);
    expect(again.over).toBe(true);
    // A finished game takes no more moves.
    expect(await session.discard(send)).toBe(false);
  });

  it("surrenders with the score so far", async () => {
    const session = LocalSession.start(7n, () => memoryStore());
    expect(await session.surrender(send)).toBe(true);
    expect(session.state.game!.over).toBe(true);
    expect(session.state.hand).toBeNull();
  });

  it("refuses an illegal placement with the engine's message and keeps the game", async () => {
    const session = LocalSession.start(7n, () => memoryStore());
    const before = session.state.tiles.length;
    expect(await session.place({ orientation: 1, x: CENTER + 5, y: CENTER + 5 }, send)).toBe(false);
    expect(session.state.writeError).toBe("Tile: no neighbors");
    expect(session.state.tiles).toHaveLength(before);
  });
});

function legalOrientation(move: SavedMove): never | "North" | "East" | "South" | "West" {
  return (["", "North", "East", "South", "West"] as const)[(move as { o: number }).o] as "North";
}

describe("saving", () => {
  it("resumes the game in progress from its seed and moves", async () => {
    const store = memoryStore();
    const session = LocalSession.start(99n, () => store);
    const mirror = EngineGame.start({ deck: "simple", seed: 99n });
    for (let i = 0; i < 5; i++) {
      const move = nextMove(mirror);
      if (move.k === "b") {
        await session.place({ orientation: move.o, x: CENTER + move.x, y: CENTER + move.y }, send);
        mirror.build({ orientation: legalOrientation(move), x: move.x, y: move.y });
      } else {
        await session.discard(send);
        mirror.discard();
      }
    }
    const raw = JSON.parse(store.data.get(TRAINING_KEY)!);
    expect(raw.seed).toBe("0x63");
    expect(raw.moves).toHaveLength(5);
    const resumed = openTraining(() => store);
    expect({ ...resumed.state, lastScored: [] }).toEqual({ ...session.state, lastScored: [] });
    expect(resumed.state.game!.score).toBe(mirror.score);
  });

  it("starts a new game when the saved value does not replay", () => {
    const store = memoryStore();
    saveGame({ v: 1, seed: "0x5", moves: [{ k: "b", o: 1, x: 40, y: 40 }] }, () => store);
    const session = openTraining(() => store);
    expect(session.state.tiles).toHaveLength(1);
    expect(loadGame(() => store)!.moves).toEqual([]);
    store.data.set(TRAINING_KEY, "{not json");
    expect(loadGame(() => store)).toBeNull();
  });

  it("plays on with storage that throws, and just is not resumable", async () => {
    const session = openTraining(() => throwing());
    expect(session.state.status).toBe("ready");
    expect(await session.discard(send)).toBe(true);
    expect(await session.surrender(send)).toBe(true);
    expect(session.state.game!.over).toBe(true);
    expect(loadGame(() => throwing())).toBeNull();
    expect(openTraining(() => null).state.tiles).toHaveLength(1);
  });
});
