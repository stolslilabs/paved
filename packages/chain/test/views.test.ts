/** The G4 pause views of Challenge: `spawn_paused() -> bool` and `guardian() -> ContractAddress`, through the codec. */
import { describe, expect, test } from "vitest";
import { createCodecs } from "../src/abis";
import { resolveDeployment } from "../src/deployment";
import { NOT_AVAILABLE_MESSAGE, RpcGameViews, ViewError, toViewError, type CallProvider } from "../src/views";

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
