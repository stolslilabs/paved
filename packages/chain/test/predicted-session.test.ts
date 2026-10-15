// `PredictedSession` (`@paved/game-core`, P5) against the chain's types: the views and the receipts of a Challenge game
// held by `EngineChain`, and the writer's typed errors.
import { CENTER, MAX_UNCONFIRMED, PredictedSession, poseidon, replayChallenge, type Mismatch } from "@paved/game-core";
import { describe, expect, test } from "vitest";
import { TILE_STATUS, type GameKey } from "../src/views";
import { GAME_EXPIRED_TEXT, GameExpiredError, WriteError } from "../src/writer";
import { EngineChain, PLAYER, legalMove } from "./engine-chain";

const key: GameKey = { mode: "challenge", gameId: 7 };
const SEED = 0x5eed1234abcdn;

function setup(options: { expiresAt?: number; now?: number; player?: string | null } = {}) {
  const chain = new EngineChain(key, SEED, options.expiresAt);
  const mismatches: Mismatch[] = [];
  const session = new PredictedSession(chain.views, key, options.player === undefined ? PLAYER : options.player, {
    now: () => options.now ?? 0,
    expiredError: () => new GameExpiredError(),
    onMismatch: (m) => mismatches.push(m),
  });
  return { chain, session, mismatches, send: chain.senders() };
}

/** Plays `n` moves on the chain itself (before the session opens), discarding every third tile. */
async function playOnChain(chain: EngineChain, n: number) {
  for (let i = 0; i < n; i++) {
    const move = legalMove(chain.game);
    if (move && i % 3 !== 2) await chain.build(move);
    else await chain.discard();
  }
}

/** The chain's hand, as the session's `hand`. */
const chainHand = (chain: EngineChain) => ({ tileId: chain.view().tileId, plan: chain.view().plan });

/** Lets the session's queued sends and reads run. */
const settle = () => new Promise((r) => setTimeout(r, 0));

describe("PredictedSession: open", () => {
  test("in step: the initial seed, the tiles and the game read, the replay matches", async () => {
    const { chain, session } = setup();
    await playOnChain(chain, 7);
    await session.open();
    expect(chain.calls.filter((c) => c !== "write")).toEqual(["game 7", "tiles 7", "initial_seed 7"]);
    expect(session.state).toMatchObject({ status: "ready", predicting: true, fallback: null, readonly: false, hand: chainHand(chain) });
    expect(session.state.game).toMatchObject({ score: chain.game.score, placedCount: chain.game.built + 1, discardedCount: chain.game.discarded });
    expect(session.state.tiles.map((t) => t.id)).toEqual(chain.drawn.filter((t) => t.status === TILE_STATUS.placed).map((t) => t.id));
  });

  test("a discard is replayed at its reseed (CENTER, CENTER), not at the (0, 0) that tiles() reports", async () => {
    const { chain } = setup();
    await chain.discard();
    const discarded = chain.drawn.find((t) => t.status === TILE_STATUS.discarded)!;
    expect([discarded.x, discarded.y]).toEqual([0, 0]);
    const engine = replayChallenge(SEED, chain.drawn, chain.view());
    expect(engine.seed).toBe(chain.game.seed);
    expect(engine.hand?.id).toBe(chain.view().tileId);
    // The reported position hashes to another seed than the reseed's.
    expect(poseidon(SEED, 0, 0)).not.toBe(poseidon(SEED, CENTER, CENTER));
  });

  test("the check failing: no prediction, a notice, the hand waits for the chain", async () => {
    const { chain, session, mismatches, send } = setup();
    await playOnChain(chain, 4);
    // Another initial seed than the game's: the replay is not in step.
    chain.views.initialSeed = async () => "0x1234";
    await session.open();
    expect(session.state).toMatchObject({ status: "ready", predicting: false, hand: chainHand(chain) });
    expect(session.state.fallback).toMatch(/Replay|seed|tile/);
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]!.move).toBeNull();

    // The board's slots and preview still come from the chain's board.
    const move = legalMove(chain.game)!;
    expect(session.slots(move.orientation)).toContainEqual({ x: move.x, y: move.y });
    expect(session.preview(move)).not.toBeNull();

    chain.hold = true;
    const placing = session.place(move, send.build(move));
    await settle();
    expect(session.state).toMatchObject({ pending: true, hand: null });
    expect(session.state.tiles.at(-1)).toMatchObject({ pending: true, x: move.x, y: move.y });
    chain.release();
    expect(await placing).toBe(true);
    expect(session.state).toMatchObject({ pending: false, hand: chainHand(chain), predicting: false });
    expect(session.state.game?.score).toBe(chain.game.score);
  });

  test("a missing game is a typed error", async () => {
    const { chain, session } = setup();
    chain.views.game = async () => {
      throw Object.assign(new Error("Game: does not exist"), { kind: "game-not-found" });
    };
    await session.open();
    expect(session.state).toMatchObject({ status: "error", error: "game-not-found" });
  });

  test("without an account the game is read only: no hand, no move", async () => {
    const { chain, session, send } = setup({ player: null });
    await session.open();
    expect(session.state).toMatchObject({ readonly: true, hand: null });
    expect(await session.discard(send.discard())).toBe(false);
    expect(chain.calls).not.toContain("write");
  });
});

describe("PredictedSession: moves", () => {
  test("place: the tile, its points and the next tile show before the receipt, then the receipt and one game() read confirm it", async () => {
    const { chain, session, mismatches, send } = setup();
    await session.open();
    const before = chain.game.clone();
    const move = legalMove(chain.game)!;
    const predicted = before.clone().build({ orientation: before.legalPlacements()[0]!.orientation, x: move.x - CENTER, y: move.y - CENTER });
    chain.calls = [];
    chain.hold = true;

    const placing = session.place(move, send.build(move));
    // At once, from the engine: no receipt yet.
    expect(session.state.tiles.at(-1)).toMatchObject({ id: predicted.tileId, x: move.x, y: move.y, pending: true });
    expect(session.state.hand).not.toBeNull();
    expect(session.state.hand!.tileId).toBe(predicted.tileId + 1);
    expect(session.state).toMatchObject({ pending: true, unconfirmed: 1, delta: predicted.points });
    expect(session.state.game?.score).toBe(predicted.score);
    await settle();
    expect(chain.held).toBe(1);

    chain.release();
    expect(await placing).toBe(true);
    // Equal to the prediction: the pending mark goes, nothing else moves.
    expect(session.state).toMatchObject({ pending: false, unconfirmed: 0, resynced: 0, hand: chainHand(chain) });
    expect(session.state.tiles.at(-1)!.pending).toBeUndefined();
    expect(chain.calls).toEqual(["write", "game 7"]);
    expect(mismatches).toEqual([]);
  });

  test("a whole game, with discards and a surrender, predicts every move", async () => {
    const { chain, session, mismatches, send } = setup();
    await session.open();
    for (let i = 0; i < 20 && !chain.game.over; i++) {
      const move = legalMove(chain.game);
      const ok = move && i % 4 !== 3 ? await session.place(move, send.build(move)) : await session.discard(send.discard());
      expect(ok).toBe(true);
      expect(session.state.hand).toEqual(chainHand(chain));
      expect(session.state.game?.score).toBe(chain.game.score);
    }
    expect(await session.surrender(send.surrender())).toBe(true);
    expect(session.state.game?.over).toBe(true);
    expect(chain.game.over).toBe(true);
    expect(session.state.resynced).toBe(0);
    expect(mismatches).toEqual([]);
  });

  test("the queue: at most two unconfirmed moves, sent one after the other", async () => {
    const { chain, session, send } = setup();
    await session.open();
    chain.hold = true;
    const first = session.discard(send.discard());
    const second = session.discard(send.discard());
    expect(session.state.unconfirmed).toBe(MAX_UNCONFIRMED);
    // The third waits: refused at once, nothing queued, the hand unchanged.
    const hand = session.state.hand;
    expect(await session.discard(send.discard())).toBe(false);
    expect(session.state.hand).toEqual(hand);
    await settle();
    // The second is sent only once the first is confirmed.
    expect(chain.calls.filter((c) => c === "write")).toHaveLength(1);
    chain.release();
    expect(await first).toBe(true);
    await settle();
    expect(chain.calls.filter((c) => c === "write")).toHaveLength(2);
    chain.release();
    expect(await second).toBe(true);
    expect(session.state).toMatchObject({ unconfirmed: 0, pending: false, hand: chainHand(chain), resynced: 0 });
    expect(chain.game.discarded).toBe(2);
  });

  test("a refused move rolls the engine back, drops the queued move and shows the error", async () => {
    const { chain, session, send } = setup();
    await session.open();
    const start = session.state;
    chain.hold = true;
    const move = legalMove(chain.game)!;
    chain.refuseNext = new WriteError("Tile: cannot place", "0xbad", true);
    const first = session.place(move, send.build(move));
    const second = session.discard(send.discard());
    expect(session.state.unconfirmed).toBe(2);

    expect(await first).toBe(false);
    expect(await second).toBe(false);
    expect(session.state).toMatchObject({ pending: false, unconfirmed: 0, writeError: "Tile: cannot place", hand: start.hand, lastScored: [] });
    expect(session.state.tiles).toEqual(start.tiles);
    expect(session.state.game).toEqual(start.game);
    // The queued discard was never sent.
    expect(chain.calls.filter((c) => c === "write")).toHaveLength(1);
    expect(chain.game.discarded).toBe(0);

    // The engine plays on from the rolled-back state.
    chain.hold = false;
    expect(await session.place(move, send.build(move))).toBe(true);
    expect(session.state).toMatchObject({ writeError: null, hand: chainHand(chain), resynced: 0 });
  });

  test("a move the engine refuses is never sent", async () => {
    const { chain, session, send } = setup();
    await session.open();
    // The starter's own square.
    const move = { orientation: 1, x: CENTER, y: CENTER };
    expect(await session.place(move, send.build(move))).toBe(false);
    expect(session.state.writeError).toBe("Tile: already exists");
    expect(chain.calls).not.toContain("write");
  });

  test("an accepted move with another result: the chain wins, the session re-opens, the queued move drops, resynced moves", async () => {
    const { chain, session, mismatches, send } = setup();
    await session.open();
    // Another tab of the player discards: the session's hand is stale.
    await chain.outsideDiscard();
    chain.hold = true;
    const first = session.discard(send.discard());
    const second = session.discard(send.discard());
    await settle();
    chain.release();
    expect(await first).toBe(true);
    expect(await second).toBe(false);
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]).toMatchObject({ gameId: 7, move: { kind: "discard" } });
    expect(mismatches[0]!.reason).toMatch(/Discarded/);
    expect(session.state).toMatchObject({ resynced: 1, predicting: true, unconfirmed: 0, hand: chainHand(chain) });
    expect(session.state.game?.discardedCount).toBe(2);
    expect(chain.calls.filter((c) => c === "write")).toHaveLength(2);

    // In step again: the next move is predicted and confirmed.
    chain.hold = false;
    expect(await session.discard(send.discard())).toBe(true);
    expect(session.state).toMatchObject({ resynced: 1, hand: chainHand(chain) });
  });

  test("a receipt that could not be read (a hash, no known revert): rolled back, then re-opened from the chain", async () => {
    const { chain, session, send } = setup();
    await session.open();
    // The discard lands, but its receipt is lost.
    const lost = async () => {
      await chain.discard();
      throw new WriteError("timeout", "0x99");
    };
    expect(await session.discard(lost)).toBe(false);
    expect(session.state).toMatchObject({ writeError: "timeout", hand: chainHand(chain), predicting: true });
    expect(session.state.game?.discardedCount).toBe(1);
    expect(await session.discard(send.discard())).toBe(true);
  });

  test("the discard's next tile is the chain's: its reseed is at (CENTER, CENTER)", async () => {
    const { chain, session, send, mismatches } = setup();
    await session.open();
    chain.hold = true;
    const discarding = session.discard(send.discard());
    const predicted = session.state.hand;
    await settle();
    chain.release();
    expect(await discarding).toBe(true);
    expect(predicted).toEqual(chainHand(chain));
    expect(mismatches).toEqual([]);
  });
});

describe("PredictedSession: expiry", () => {
  test("past expiresAt a build or a discard shows the typed error and sends nothing; a surrender closes the game", async () => {
    const { chain, session, send } = setup({ expiresAt: 100, now: 100 });
    await session.open();
    expect(session.expired).toBe(true);
    expect(session.state.expiresAt).toBe(100);
    const move = legalMove(chain.game)!;
    expect(await session.place(move, send.build(move))).toBe(false);
    expect(session.state.writeError).toBe(GAME_EXPIRED_TEXT);
    expect(await session.discard(send.discard())).toBe(false);
    expect(chain.calls).not.toContain("write");

    expect(await session.surrender(send.surrender())).toBe(true);
    expect(session.state.game?.over).toBe(true);
    expect(session.state.hand).toBeNull();
    expect(session.expired).toBe(false);
  });

  test("before expiresAt moves are accepted", async () => {
    const { session, send } = setup({ expiresAt: 100, now: 99 });
    await session.open();
    expect(session.expired).toBe(false);
    expect(await session.discard(send.discard())).toBe(true);
  });

  test("a 'Game: expired' revert after a race shows the writer's typed error and rolls back", async () => {
    const { chain, session, send } = setup();
    await session.open();
    const hand = session.state.hand;
    chain.refuseNext = new GameExpiredError("0x5");
    expect(await session.discard(send.discard())).toBe(false);
    expect(session.state).toMatchObject({ writeError: GAME_EXPIRED_TEXT, hand });
  });
});
