import { describe, expect, it } from "vitest";
import {
  CENTER,
  INITIAL_MEAN,
  OrientationType,
  PlanType,
  PredictedSession,
  SeededChallenge,
  dayAdd,
  dayAverage,
  dayMean,
  emaMean,
  emaPush,
  newEma,
  replayVrfChallenge,
  thresholdOfMean,
  type SeededMove,
} from "../src";

// The mock's Challenge game (#927): the VRF's draws taken from a seed kept with the game (open point 3), read in the chain's
// shapes, so the board's session and the over page's replay play it as a game on chain.

const ORIENTATIONS = Object.values(OrientationType);
const PLANS = Object.values(PlanType);
const SEED = 0x5eed_c0ffeen;
const PLAYER = 0x5f1n;

/** The engine the board would open the game with, from its reads (`replayVrfChallenge`): its first legal move, or a discard. */
function nextMove(game: SeededChallenge): SeededMove {
  const view = game.view();
  const engine = replayVrfChallenge(SEED, game.tiles(), { playerId: `0x${PLAYER.toString(16)}`, deckSize: view.deckSize, over: view.over }, game.draw());
  const hand = engine.hand!;
  const [first] = engine.legalPlacements(hand.plan);
  return first ? { kind: "build", orientation: ORIENTATIONS.indexOf(first.orientation), x: CENTER + first.x, y: CENTER + first.y } : { kind: "discard" };
}

/** Plays `game` to its end with `nextMove`; the moves played. */
function playOut(game: SeededChallenge): SeededMove[] {
  const moves: SeededMove[] = [];
  while (!game.over) {
    const move = nextMove(game);
    game.play(move);
    moves.push(move);
  }
  return moves;
}

describe("a seeded Challenge game (#927)", () => {
  it("starts as a VRF game spawns: the starter at the centre, a hand and the two tiles after it", () => {
    const game = new SeededChallenge(SEED, PLAYER);
    const view = game.view();
    expect(view).toMatchObject({ seed: `0x${SEED.toString(16)}`, score: 0, over: false, tileCount: 2, placedCount: 1, discardedCount: 0, tileId: 2 });
    expect(view.plan).toBeGreaterThan(0);
    const tiles = game.tiles();
    expect(tiles[0]).toEqual({ id: 1, status: 1, plan: PLANS.indexOf(PlanType.RFFFRFCFR), orientation: ORIENTATIONS.indexOf(OrientationType.South), x: CENTER, y: CENTER });
    expect(tiles[1]).toMatchObject({ id: 2, status: 3, plan: view.plan });
    const draw = game.draw();
    expect(draw).toMatchObject({ vrf: true, draws: true });
    expect(draw.next).toBeGreaterThan(0);
    expect(draw.after).toBeGreaterThan(0);
  });

  it("plays to the deck's end, and replays the same from its seed and moves: tiles, score and queue", () => {
    const game = new SeededChallenge(SEED, PLAYER);
    const moves = playOut(game);
    const view = game.view();
    expect(view.over).toBe(true);
    expect(view.tileCount).toBe(view.deckSize);
    expect(view.tileId).toBe(0);
    expect(moves.length).toBe(view.deckSize - 1);
    const again = SeededChallenge.replay(SEED, PLAYER, moves);
    expect(again.view()).toEqual(view);
    expect(again.tiles()).toEqual(game.tiles());
    // Another seed is another game.
    expect(new SeededChallenge(SEED + 1n, PLAYER).tiles()).not.toEqual(new SeededChallenge(SEED, PLAYER).tiles());
  });

  it("says what each move did, as the receipt's events: built or discarded tiles, points, the end", () => {
    const game = new SeededChallenge(SEED, PLAYER);
    const hand = game.view();
    const move = nextMove(game);
    const built = game.play(move);
    expect(built).toMatchObject({ kind: move.kind, tileId: hand.tileId, plan: hand.plan, over: false });
    expect(game.tiles().find((t) => t.id === hand.tileId)).toMatchObject({ status: move.kind === "build" ? 1 : 2 });
    const next = game.view().tileId;
    const discarded = game.play({ kind: "discard" });
    expect(discarded).toMatchObject({ kind: "discard", tileId: next, scored: [] });
    expect(game.tiles().find((t) => t.id === next)).toMatchObject({ status: 2, x: 0, y: 0 });
    const kept = game.view().tileId;
    expect(game.play({ kind: "surrender" })).toMatchObject({ kind: "surrender", tileId: kept, over: true });
    // Surrendered: the tile in hand stays held, as on chain; no move is taken any more.
    expect(game.tiles().at(-1)).toMatchObject({ id: kept, status: 3 });
    expect(() => game.play({ kind: "discard" })).toThrow();
  });

  it("refuses a placement the rules refuse, and nothing moves", () => {
    const game = new SeededChallenge(SEED, PLAYER);
    const before = game.tiles();
    expect(() => game.play({ kind: "build", orientation: 1, x: CENTER + 5, y: CENTER + 5 })).toThrow();
    expect(() => game.play({ kind: "build", orientation: 0, x: CENTER + 1, y: CENTER })).toThrow("Orientation: not valid");
    expect(game.tiles()).toEqual(before);
  });

  it("is played by the board's session as a game on chain: each move waits for its receipt, then the reads", async () => {
    const game = new SeededChallenge(SEED, PLAYER);
    const key = { gameId: 7 };
    const views = {
      game: async () => ({ ...game.view(), playerId: "0x5f1", expiresAt: 0 }),
      tiles: async () => game.tiles(),
      initialSeed: async () => `0x${SEED.toString(16)}`,
      draw: async () => game.draw(),
    };
    const session = new PredictedSession(views, key, "0x5f1", { onMismatch: () => {} });
    await session.open();
    expect(session.state).toMatchObject({ status: "ready", readonly: false, predicting: false });
    expect(session.state.hand).toEqual({ tileId: game.view().tileId, plan: game.view().plan });
    expect(session.state.coming).toHaveLength(2);
    for (let i = 0; i < 5; i++) {
      const move = nextMove(game);
      const send = async () => (game.play(move), { events: [] });
      const ok = move.kind === "build" ? await session.place({ orientation: move.orientation, x: move.x, y: move.y }, send) : await session.discard(send);
      expect(ok).toBe(true);
      expect(session.state.game?.score).toBe(game.score);
      expect(session.state.hand?.tileId).toBe(game.view().tileId);
    }
  });
});

describe("the contract's mean (mean.cairo)", () => {
  it("starts at the calibration mean, cumulative up to a weight of 1,000, then steps", () => {
    let ema = newEma();
    expect(emaMean(ema)).toBe(INITIAL_MEAN);
    // A score under 100 points is left out.
    expect(emaPush(ema, 99_000, 5)).toEqual(ema);
    ema = emaPush(ema, 2_000_000, 100);
    expect(ema.weight).toBe(200);
    expect(emaMean(ema)).toBe((INITIAL_MEAN * 100 + 2_000_000 * 100) / 200);
    // Clamped at 4 x the mean.
    const clamped = emaPush(newEma(), 100_000_000, 100);
    expect(emaMean(clamped)).toBe((INITIAL_MEAN * 100 + 4 * INITIAL_MEAN * 100) / 200);
    // Past the max weight, a step of `w / W`.
    const full = emaPush(newEma(), INITIAL_MEAN, 900);
    expect(full.weight).toBe(1_000);
    expect(emaMean(emaPush(full, 2 * INITIAL_MEAN, 10))).toBe(INITIAL_MEAN + Math.floor((INITIAL_MEAN * 10) / 1_000));
  });

  it("blends a day's games with its prior at weight 100; the day's average is what the close pushes", () => {
    let day = { prior: INITIAL_MEAN, sum: 0n, weight: 0 };
    expect(dayMean(day)).toBe(INITIAL_MEAN);
    expect(dayAverage(day)).toBe(0);
    day = dayAdd(day, 50, 3);
    expect(day.weight).toBe(0);
    day = dayAdd(day, 2_000, 10);
    expect(dayAverage(day)).toBe(2_000_000);
    expect(dayMean(day)).toBe(Math.floor((100 * INITIAL_MEAN + 10 * 2_000_000) / 110));
    expect(thresholdOfMean(4_000_000, 500)).toBe(4_200_000);
  });
});
