// `PredictedSession` on a VRF game (#645, docs/architecture/challenge-vrf.md): the hand and the next two tiles are known,
// a move shows the next tile at once, and the tile two ahead comes with the move's receipt (`Queued`).
import { MAX_UNCONFIRMED, PredictedSession, type Mismatch } from "@paved/game-core";
import { describe, expect, test } from "vitest";
import type { GameKey } from "../src/views";
import { EngineChain, PLAYER, legalMove } from "./engine-chain";

const key: GameKey = { mode: "challenge", gameId: 7 };
const SEED = 0x5eed1234abcdn;

function setup() {
  const chain = new EngineChain(key, SEED, 2 ** 40, true);
  const mismatches: Mismatch[] = [];
  const session = new PredictedSession(chain.views, key, PLAYER, { now: () => 0, onMismatch: (m) => mismatches.push(m) });
  return { chain, session, mismatches, send: chain.senders() };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe("PredictedSession on a VRF game", () => {
  test("opens in step: the hand and the next two are the chain's", async () => {
    const { chain, session, mismatches } = setup();
    for (let i = 0; i < 5; i++) await chain.discard();
    await session.open();
    expect(mismatches).toEqual([]);
    expect(session.state).toMatchObject({ status: "ready", predicting: true, hand: { tileId: chain.view().tileId, plan: chain.view().plan } });
    const draw = await chain.views.draw!(key);
    expect(session.state.queue?.map((t) => t.plan)).toEqual([draw.next, draw.after]);
  });

  test("a move: the next tile comes into the hand at once, the tile two ahead comes with the receipt", async () => {
    const { chain, session, mismatches, send } = setup();
    await session.open();
    const [next, after] = session.state.queue!;
    chain.hold = true;
    const discarding = session.discard(send.discard());
    await settle();
    expect(session.state.hand).toEqual({ tileId: next!.tileId, plan: next!.plan });
    expect(session.state.queue).toEqual([after, { tileId: after!.tileId + 1, plan: null }]);
    chain.release();
    expect(await discarding).toBe(true);
    const draw = await chain.views.draw!(key);
    expect(session.state.queue?.map((t) => t.plan)).toEqual([draw.next, draw.after]);
    expect(mismatches).toEqual([]);
  });

  test("moves ahead of their receipts: the two queued tiles carry the hand, the tiles after them wait for the receipts", async () => {
    const { chain, session, mismatches, send } = setup();
    await session.open();
    const [next, after] = session.state.queue!;
    chain.hold = true;
    const moves = [];
    for (let i = 0; i < MAX_UNCONFIRMED; i++) moves.push(session.discard(send.discard()));
    await settle();
    // Two moves ahead of the chain: the hand is the queue's second tile, both tiles after it not drawn yet
    expect(session.state.hand).toEqual({ tileId: after!.tileId, plan: after!.plan });
    expect(session.state.queue).toEqual([
      { tileId: after!.tileId + 1, plan: null },
      { tileId: after!.tileId + 2, plan: null },
    ]);
    expect(next!.tileId).toBe(after!.tileId - 1);
    // No third move before a receipt
    expect(await session.discard(send.discard())).toBe(false);
    chain.release();
    await settle();
    chain.release();
    expect(await Promise.all(moves)).toEqual([true, true]);
    expect(session.state.hand).toEqual({ tileId: chain.view().tileId, plan: chain.view().plan });
    const draw = await chain.views.draw!(key);
    expect(session.state.queue?.map((t) => t.plan)).toEqual([draw.next, draw.after]);
    expect(mismatches).toEqual([]);
  });

  test("a build plays on to the deck's end in step, the last moves drawing nothing", async () => {
    const { chain, session, mismatches, send } = setup();
    await session.open();
    while (!session.state.game?.over) {
      const move = legalMove(chain.game);
      const ok = move ? await session.place(move, send.build(move)) : await session.discard(send.discard());
      expect(ok).toBe(true);
    }
    expect(session.state.game).toMatchObject({ over: true, score: chain.game.score });
    expect(session.state.queue).toEqual([]);
    expect(mismatches).toEqual([]);
  });
});
