/** The G4 pause views of Challenge: `spawn_paused() -> bool` and `guardian() -> ContractAddress`, through the codec. */
import { describe, expect, test } from "vitest";
import { createCodecs } from "../src/abis";
import { resolveDeployment } from "../src/deployment";
import { RpcGameViews, ViewError, type CallProvider } from "../src/views";

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
