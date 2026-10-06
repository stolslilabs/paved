import { describe, expect, test } from "vitest";
import { hash } from "starknet";
import { createCodecs } from "../src/abis";
import { resolveDeployment } from "../src/deployment";
import { EventReader, type EventProvider } from "../src/events";

const deployment = resolveDeployment({
  network: "devnet",
  env: { rpcUrl: "http://x", deployedBlock: 7, addresses: { Account: "0x1", Daily: "0x2", Tutorial: "0x3", Token: "0x4" } },
});
const SPAWNED = hash.getSelectorFromName("GameSpawned");

function spawned(gameId: number) {
  return { keys: [SPAWNED, `0x${gameId.toString(16)}`, "0xabc"], data: ["0x1", "0x5", "0x100", "0x0"], from_address: "0x2" };
}

describe("EventReader", () => {
  test("follows continuation tokens from deployed_block and keeps chain order", async () => {
    const filters: unknown[] = [];
    const provider: EventProvider = {
      async getEvents(filter) {
        filters.push(filter);
        if (!filter.continuation_token) return { events: [spawned(1), spawned(2)], continuation_token: "next" };
        return { events: [spawned(3)] };
      },
    };
    const events = await new EventReader(provider, deployment, createCodecs()).read("Daily", "GameSpawned", [null, "0xabc"]);
    expect(events.map((e) => e.fields.gameId)).toEqual([1, 2, 3]);
    expect(filters).toEqual([
      { address: "0x2", from_block: { block_number: 7 }, to_block: "latest", keys: [[SPAWNED], [], ["0xabc"]], chunk_size: 100 },
      { address: "0x2", from_block: { block_number: 7 }, to_block: "latest", keys: [[SPAWNED], [], ["0xabc"]], chunk_size: 100, continuation_token: "next" },
    ]);
  });

  test("reads nothing for a contract with no address", async () => {
    const off = resolveDeployment({ network: "devnet" });
    const provider: EventProvider = { getEvents: async () => { throw new Error("must not be called"); } };
    expect(await new EventReader(provider, off, createCodecs()).read("Daily", "GameSpawned")).toEqual([]);
  });
});
