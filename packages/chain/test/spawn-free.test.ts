/** Play free (`Challenge.spawn_free`): the call, the game id of the receipt, the typed refusals. */
import { hash } from "starknet";
import { describe, expect, test, vi } from "vitest";
import { createCodecs } from "../src/abis";
import { resolveDeployment } from "../src/deployment";
import { NO_CREDIT_TEXT, NoCreditError, SPAWN_PAUSED_TEXT, SpawnPausedError, WriteError } from "../src/index";
import { PavedClient, type PavedRpc } from "../src/paved-client";
import { FakeGameViews } from "../src/views";

const PLAYER = "0x5";
const deployment = resolveDeployment({ network: "devnet", env: { rpcUrl: "http://x", addresses: { Challenge: "0x2", Setup: "0x3" } } });
const SPAWNED = hash.getSelectorFromName("GameSpawned");

type Receipt = { execution_status?: string; revert_reason?: string; events?: unknown[] };

/** A free game's `GameSpawned`: price 0. */
const freeSpawn = (gameId: number) => ({ keys: [SPAWNED, `0x${gameId.toString(16)}`, PLAYER], data: ["0x1", "0x5", "0x100", "0x0"], from_address: "0x2" });

function writerWith(options: { receipt?: Receipt; execute?: () => Promise<{ transaction_hash: string }> } = {}) {
  const execute = vi.fn(async (_calls: Array<{ contractAddress: string; entrypoint: string; calldata: string[] }>) => (options.execute ? options.execute() : { transaction_hash: "0x1" }));
  const rpc = {
    callContract: async () => [],
    getEvents: async () => ({ events: [] }),
    waitForTransaction: async () => options.receipt ?? { execution_status: "SUCCEEDED", events: [freeSpawn(42)] },
  } as unknown as PavedRpc;
  return { writer: new PavedClient(deployment, rpc, createCodecs(), new FakeGameViews()).writer({ address: PLAYER, execute }), execute };
}

describe("spawnFree", () => {
  test("is one call to Challenge.spawn_free with no argument, and returns the game of GameSpawned", async () => {
    const { writer, execute } = writerWith();
    const result = await writer.spawnFree();
    expect(execute.mock.calls[0][0].map((c) => [BigInt(c.contractAddress), c.entrypoint, c.calldata])).toEqual([[2n, "spawn_free", []]]);
    expect(result.gameId).toBe(42);
    expect(result.transactionHash).toBe("0x1");
    // A free game: price 0.
    expect(result.events.find((e) => e.name === "GameSpawned")?.fields).toMatchObject({ gameId: 42, mode: 1 });
    expect(Number(result.events.find((e) => e.name === "GameSpawned")!.fields.price)).toBe(0);
  });

  test.each([
    ["Setup: no credit", NoCreditError, NO_CREDIT_TEXT],
    ["Challenge: spawn paused", SpawnPausedError, SPAWN_PAUSED_TEXT],
  ])("a receipt that reverts with '%s' is a typed error", async (reason, type, text) => {
    const { writer } = writerWith({ receipt: { execution_status: "REVERTED", revert_reason: `Error in the called contract: ${reason}` } });
    const error = await writer.spawnFree().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(type);
    expect(error).toBeInstanceOf(WriteError);
    expect(error).toMatchObject({ message: text, transactionHash: "0x1", reverted: true });
  });

  test.each([
    ["Setup: no credit", NoCreditError],
    ["Challenge: spawn paused", SpawnPausedError],
  ])("'%s' found by the fee estimation, before anything is sent, is the same typed error", async (reason, type) => {
    const { writer } = writerWith({ execute: () => Promise.reject(new Error(`Execution failed: ${reason}`)) });
    const error = await writer.spawnFree().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(type);
    expect((error as WriteError).transactionHash).toBeUndefined();
  });

  test("the revert reason as the hex of a short string is read too", async () => {
    const { shortString } = await import("starknet");
    const { writer } = writerWith({ receipt: { execution_status: "REVERTED", revert_reason: `0x${BigInt(shortString.encodeShortString("Setup: no credit")).toString(16)}` } });
    await expect(writer.spawnFree()).rejects.toBeInstanceOf(NoCreditError);
  });

  test("any other revert is left as it is", async () => {
    const { writer } = writerWith({ receipt: { execution_status: "REVERTED", revert_reason: "Challenge: collection not set" } });
    const error = await writer.spawnFree().catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(NoCreditError);
    expect(error).not.toBeInstanceOf(SpawnPausedError);
    expect(error).toMatchObject({ name: "WriteError", message: "Challenge: collection not set", reverted: true });
  });

  test("a receipt without GameSpawned is an unknown outcome that names the transaction", async () => {
    const { writer } = writerWith({ receipt: { execution_status: "SUCCEEDED", events: [] } });
    await expect(writer.spawnFree()).rejects.toMatchObject({ name: "WriteError", transactionHash: "0x1", reverted: false });
  });

  test("a second write while one is pending is refused", async () => {
    let release!: () => void;
    const { writer } = writerWith({ execute: () => new Promise((resolve) => (release = () => resolve({ transaction_hash: "0x1" }))) });
    const first = writer.spawnFree();
    await expect(writer.spawnFree()).rejects.toThrow(/pending/);
    release();
    await first;
  });
});
