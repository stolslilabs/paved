/** Fixes from the review of #202 (P-10, part a), tested in part b. */
import { describe, expect, test, vi } from "vitest";
import { hash } from "starknet";
import { ABIS, createCodecs } from "../src/abis";
import { controllerPolicies } from "../src/auth/controller";
import { AbiCodec, AbiMismatchError, type DecodedEvent } from "../src/codec";
import { resolveDeployment } from "../src/deployment";
import { EventReader } from "../src/events";
import { PavedClient, createPavedClient, type PavedRpc } from "../src/paved-client";
import { FakeGameViews, RpcGameViews, ViewError } from "../src/views";
import { WriteError, type WriteAccount } from "../src/writer";

const codecs = createCodecs();
const deployment = resolveDeployment({
  network: "devnet",
  env: { rpcUrl: "http://x", addresses: { Account: "0x1", Daily: "0x2", Tutorial: "0x3", Token: "0x4" } },
});
const off = resolveDeployment({ network: "devnet" });

/** `n` tile views of 6 felts, length-prefixed; `extra` felts appended to each (a grown struct). */
function tilesFelts(from: number, n: number, extra = 0): string[] {
  const out = [`0x${n.toString(16)}`];
  for (let i = 0; i < n; i++) out.push(`0x${(from + i + 1).toString(16)}`, "0x1", "0x4", "0x1", "0x7fffffff", "0x7fffffff", ...Array(extra).fill("0x9"));
  return out;
}

describe("decodeResult refuses a layout the ABI does not describe", () => {
  test("felts left over after a struct", () => {
    const game = Array(16).fill("0x1");
    expect(() => codecs.Daily.decodeResult("game", [...game, "0x2"])).toThrow(AbiMismatchError);
    expect(() => codecs.Daily.decodeResult("game", game)).not.toThrow();
  });

  test("an upgraded contract with one more felt per tile fails as abi-mismatch, not misaligned", async () => {
    const provider = { callContract: async () => tilesFelts(0, 3, 1) };
    const error = await new RpcGameViews(provider, deployment, codecs).tiles({ mode: "daily", gameId: 1 }).catch((e) => e);
    expect(error).toBeInstanceOf(ViewError);
    expect(error.kind).toBe("abi-mismatch");
  });
});

describe("encodeCall checks integer ranges", () => {
  test("u32 and u8 out of range, negative, felt over the prime", () => {
    expect(() => codecs.Daily.encodeCall("discard", [2 ** 32])).toThrow(RangeError);
    expect(() => codecs.Daily.encodeCall("discard", [-1])).toThrow(RangeError);
    expect(() => codecs.Daily.encodeCall("claim", [1, 256])).toThrow(RangeError);
    expect(() => codecs.Daily.encodeCall("builder", [1, 1n << 252n])).toThrow(RangeError);
    expect(codecs.Daily.encodeCall("discard", [2 ** 32 - 1])).toEqual(["0xffffffff"]);
    // A felt is in [0, P): P - 1 is the largest.
    const P = (1n << 251n) + 17n * (1n << 192n) + 1n;
    expect(codecs.Daily.encodeCall("builder", [1, P - 1n])[1]).toBe("0x" + (P - 1n).toString(16));
    expect(() => codecs.Daily.encodeCall("builder", [1, P])).toThrow(RangeError);
  });
});

describe("role codes added later (P4) do not break decoding", () => {
  // CharacterView: role, placed, tile_id, x, y, spot; four roles added after Pilgrim.
  const character = (role: number) => [role, 1, 7, 0x7fffffff, 0x7fffffff, 3].map((n) => `0x${n.toString(16)}`);

  test("a character with an unknown role code decodes as its number", () => {
    const felts = ["0x2", ...character(5), ...character(9)];
    const out = codecs.Daily.decodeResult("characters", felts) as Array<{ role: number; placed: boolean }>;
    expect(out.map((c) => c.role)).toEqual([5, 9]);
    expect(out[1].placed).toBe(true);
  });

  test("an enum code the ABI does not list is kept as its number, not thrown", () => {
    const grown = new AbiCodec([
      ...ABIS.Daily,
      { type: "function", name: "which_role", inputs: [], outputs: [{ type: "paved::types::role::Role" }] },
    ]);
    expect(grown.decodeResult("which_role", ["0x3"])).toBe(3);
    expect(grown.decodeResult("which_role", ["0x63"])).toBe(99);
  });
});

describe("tiles pages by 64", () => {
  test("a game of 67 tiles: one page of 64, then one of 3", async () => {
    const asked: string[][] = [];
    const provider = {
      callContract: async (call: { calldata: string[] }) => {
        asked.push(call.calldata);
        const from = Number(call.calldata[1]);
        return tilesFelts(from, Math.min(64, 67 - from));
      },
    };
    const tiles = await new RpcGameViews(provider, deployment, codecs).tiles({ mode: "daily", gameId: 5 });
    expect(tiles.map((t) => t.id)).toEqual(Array.from({ length: 67 }, (_, i) => i + 1));
    expect(asked).toEqual([
      ["0x5", "0x0", "0x40"],
      ["0x5", "0x40", "0x40"],
    ]);
  });
});

function client(waitForTransaction: () => Promise<unknown> = async () => ({ execution_status: "SUCCEEDED", events: [] })) {
  const rpc = { callContract: async () => [], getEvents: async () => ({ events: [] }), waitForTransaction } as unknown as PavedRpc;
  return new PavedClient(deployment, rpc);
}

describe("writer", () => {
  test("a rejected execute (fee estimation, contract assert) is a WriteError", async () => {
    const account: WriteAccount = { address: "0x5", execute: async () => { throw new Error("Tile: not compatible"); } };
    const error = await client().writer(account).discard({ mode: "daily", gameId: 1 }).catch((e) => e);
    expect(error).toBeInstanceOf(WriteError);
    expect(error.message).toBe("Tile: not compatible");
  });

  test("a second write while one is pending is refused: one transaction per double click", async () => {
    let release!: () => void;
    const receipt = new Promise((r) => (release = () => r({ execution_status: "SUCCEEDED", events: [] })));
    const execute = vi.fn(async () => ({ transaction_hash: "0x1" }));
    const writer = client(() => receipt).writer({ address: "0x5", execute });
    const first = writer.build({ mode: "daily", gameId: 1 }, { orientation: 1, x: 1, y: 1, role: 0, spot: 0 });
    await expect(writer.build({ mode: "daily", gameId: 1 }, { orientation: 1, x: 1, y: 1, role: 0, spot: 0 })).rejects.toThrow(
      "Another write is pending",
    );
    release();
    await first;
    expect(execute).toHaveBeenCalledTimes(1);
    // Free again once the receipt is in.
    await expect(writer.discard({ mode: "daily", gameId: 1 })).resolves.toBeTruthy();
  });

  test("a name is 1 to 31 ASCII characters", async () => {
    const writer = client().writer({ address: "0x5", execute: async () => ({ transaction_hash: "0x1" }) });
    await expect(writer.createPlayer("x".repeat(32))).rejects.toThrow(WriteError);
    await expect(writer.createPlayer("")).rejects.toThrow(WriteError);
  });
});

describe("Daily spawn approves what entry_price names (O-23)", () => {
  test("token and amount from the view, approve before spawn, in one multicall", async () => {
    const views = new FakeGameViews();
    views.price = { token: "0x77", amount: 5n };
    const rpc = {
      callContract: async () => [],
      getEvents: async () => ({ events: [] }),
      waitForTransaction: async () => ({
        execution_status: "SUCCEEDED",
        events: [{ from_address: "0x2", keys: [hash.getSelectorFromName("GameSpawned"), "0x9", "0x5"], data: ["0x1", "0x0", "0x1", "0x5"] }],
      }),
    } as unknown as PavedRpc;
    const execute = vi.fn(async () => ({ transaction_hash: "0x1" }));
    const result = await new PavedClient(deployment, rpc, codecs, views).writer({ address: "0x5", execute }).spawn("daily");
    expect(result.gameId).toBe(9);
    const calls = (execute.mock.calls[0] as unknown as [Array<{ contractAddress: string; entrypoint: string; calldata: string[] }>])[0];
    expect(calls.map((c) => [c.contractAddress, c.entrypoint])).toEqual([["0x77", "approve"], ["0x2", "spawn"]]);
    expect(calls[0].calldata).toEqual(["0x2", "0x5", "0x0"]);
  });

  test("a free entry sends no approve; a failed price read sends nothing", async () => {
    const views = new FakeGameViews();
    views.price = { token: "0x77", amount: 0n };
    const execute = vi.fn(async () => ({ transaction_hash: "0x1" }));
    const rpc = { callContract: async () => [], getEvents: async () => ({ events: [] }), waitForTransaction: async () => ({ events: [] }) } as unknown as PavedRpc;
    await new PavedClient(deployment, rpc, codecs, views).writer({ address: "0x5", execute }).spawn("daily").catch(() => undefined);
    expect((execute.mock.calls[0] as unknown as [Array<{ entrypoint: string }>])[0].map((c) => c.entrypoint)).toEqual(["spawn"]);

    views.entryPrice = async () => { throw new Error("fetch failed"); };
    execute.mockClear();
    await expect(new PavedClient(deployment, rpc, codecs, views).writer({ address: "0x5", execute }).spawn("daily")).rejects.toThrow(/entry price/);
    expect(execute).not.toHaveBeenCalled();
  });
});

describe("own receipts in the lists", () => {
  test("a game spawned by this client is listed even before the node's latest block has it", async () => {
    const reader = new EventReader({ getEvents: async () => ({ events: [] }) }, deployment, codecs);
    const spawned: DecodedEvent = {
      name: "GameSpawned",
      fields: { gameId: 7, playerId: "0xabc", mode: 1, tournamentId: 20000, startTime: 100, price: "0x0" },
      fromAddress: "0x2",
    };
    reader.remember("Daily", [spawned]);
    expect(await reader.playerGames("0xabc")).toEqual([
      expect.objectContaining({ mode: "daily", gameId: 7, over: false, tournamentId: 20000 }),
    ]);
    expect(await reader.playerGames("0xdef")).toEqual([]);
  });

  test("not twice when the node has it too", async () => {
    const selector = hash.getSelectorFromName("GameSpawned");
    const raw = { keys: [selector, "0x7", "0xabc"], data: ["0x1", "0x4e20", "0x64", "0x0"], from_address: "0x2" };
    const reader = new EventReader({ getEvents: async (f) => ({ events: f.address === "0x2" && f.keys[0][0] === selector ? [raw] : [] }) }, deployment, codecs);
    reader.remember("Daily", [codecs.Daily.decodeEvent(raw)!]);
    expect(await reader.playerGames("0xabc")).toHaveLength(1);
  });
});

describe("nothing is built on a deployment that is not configured", () => {
  test("no RPC client (no fallback to a public node), no controller policy with an empty target", () => {
    expect(() => createPavedClient(off)).toThrow(/Not connected/);
    expect(() => controllerPolicies(off)).toThrow(/Not connected/);
    expect(createPavedClient(deployment)).toBeInstanceOf(PavedClient);
  });
});
