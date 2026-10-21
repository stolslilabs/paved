/** The G4 pause views of Challenge: `spawn_paused() -> bool` and `guardian() -> ContractAddress`, through the codec. */
import { describe, expect, test } from "vitest";
import { createCodecs } from "../src/abis";
import { resolveDeployment } from "../src/deployment";
import { FakeGameViews, NOT_AVAILABLE_MESSAGE, RpcGameViews, ViewError, toViewError, type CallProvider } from "../src/views";

const deployment = resolveDeployment({ network: "devnet", env: { rpcUrl: "http://x", addresses: { Challenge: "0x2", Setup: "0x3", Token: "0x4" } } });

function views(answer: (entrypoint: string) => string[]) {
  const calls: Array<{ entrypoint: string; calldata: string[] }> = [];
  const provider: CallProvider = {
    callContract: async (call) => {
      calls.push({ entrypoint: call.entrypoint, calldata: call.calldata });
      return answer(call.entrypoint);
    },
  };
  return { views: new RpcGameViews(provider, deployment, createCodecs()), calls };
}

describe("spawnPaused and guardian", () => {
  test("spawn_paused: one bool felt, no arguments", async () => {
    const paused = views(() => ["0x1"]);
    expect(await paused.views.spawnPaused()).toBe(true);
    expect(paused.calls).toEqual([{ entrypoint: "spawn_paused", calldata: [] }]);
    expect(await views(() => ["0x0"]).views.spawnPaused()).toBe(false);
  });

  test("guardian: one address felt, the zero address for none", async () => {
    expect(await views(() => ["0xabc"]).views.guardian()).toBe("0xabc");
    expect(BigInt(await views(() => ["0x0"]).views.guardian())).toBe(0n);
  });

  test("a failed read is a ViewError", async () => {
    const failing = new RpcGameViews(
      { callContract: async () => { throw new Error("rpc down"); } },
      deployment,
      createCodecs(),
    );
    await expect(failing.spawnPaused()).rejects.toBeInstanceOf(ViewError);
  });
});

// #549: Sepolia runs older classes than the ABIs; a selector the class lacks must not reach the page as the raw RPC dump.
const NO_ENTRYPOINT = `RPC: starknet_call with params {
  "request": { "contract_address": "0x7fee", "entry_point_selector": "0x1b82c7", "calldata": [] },
  "block_id": "latest"
}

      21: Requested entrypoint does not exist in the contract: undefined`;

describe("a view the deployed class does not have", () => {
  test("toViewError: not-available, a clear message, the RPC text kept in the cause", () => {
    const raw = new Error(NO_ENTRYPOINT);
    const error = toViewError(raw);
    expect(error.kind).toBe("not-available");
    expect(error.message).toBe(NOT_AVAILABLE_MESSAGE);
    expect(error.message).not.toContain("starknet_call");
    expect(error.cause).toBe(raw);
  });

  test("the node's ENTRYPOINT_NOT_FOUND code maps the same; another failure stays rpc", () => {
    expect(toViewError(new Error("ENTRYPOINT_NOT_FOUND")).kind).toBe("not-available");
    // A live Sepolia node words it "entry point" (two words); another node "entrypoint".
    expect(toViewError(new Error("21: Requested entry point does not exist in the contract")).kind).toBe("not-available");
    expect(toViewError(new Error("fetch failed")).kind).toBe("rpc");
  });

  test("a read through RpcGameViews rejects with it", async () => {
    const failing = new RpcGameViews({ callContract: async () => { throw new Error(NO_ENTRYPOINT); } }, deployment, createCodecs());
    await expect(failing.spawnPaused()).rejects.toMatchObject({ kind: "not-available", message: NOT_AVAILABLE_MESSAGE });
  });
});

// #645: `Challenge.draw(game_id)`, the game's queue on the VRF. Until its ABI lands, the read is `not-available` and the
// fake carries the shape of the draft PR's `DrawView`.
describe("draw, the queue of a game on the VRF", () => {
  test("RpcGameViews: not-available while the shipped ABI has no draw, with no call sent", async () => {
    const codecs = createCodecs();
    const rpc = views(() => []);
    if (codecs.Challenge.hasFunction("draw")) return; // The ABI landed: the decode is then pinned by VIEW_FIELDS.
    await expect(rpc.views.draw({ mode: "challenge", gameId: 3 })).rejects.toMatchObject({ kind: "not-available", message: NOT_AVAILABLE_MESSAGE });
    expect(rpc.calls).toEqual([]);
  });

  test("FakeGameViews: the game's queue when it has one, not-available for a game before #645", async () => {
    const fake = new FakeGameViews();
    const game = { id: 3, playerId: "0xabc", mode: 1, seed: "0x1", score: 0, over: false, tileCount: 4, placedCount: 1, discardedCount: 0, tileId: 2, plan: 5, remainingCount: 37, deckSize: 38, startTime: 1, endTime: 0, dayId: 0, expiresAt: 0 };
    const draw = { gameId: 3, next: 7, after: 11, tiles: 0b1011n, vrf: true, draws: true, salt: "0x5a17" };
    fake.setGame({ mode: "challenge", gameId: 3 }, { game, tiles: [], builder: { gameId: 3, playerId: "0xabc", tileId: 2, plan: 5 }, draw });
    fake.setGame({ mode: "challenge", gameId: 4 }, { game: { ...game, id: 4 }, tiles: [], builder: { gameId: 4, playerId: "0xabc", tileId: 2, plan: 5 } });
    expect(await fake.draw({ mode: "challenge", gameId: 3 })).toEqual(draw);
    await expect(fake.draw({ mode: "challenge", gameId: 4 })).rejects.toMatchObject({ kind: "not-available" });
    await expect(fake.draw({ mode: "challenge", gameId: 5 })).rejects.toMatchObject({ kind: "game-not-found" });
  });
});
