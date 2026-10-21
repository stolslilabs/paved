// The Challenge on the VRF (#645, docs/architecture/challenge-vrf.md): what the writer sends for a drawing write, and the
// `draw` view's decoding.

import type { Call } from "starknet";
import { describe, expect, test } from "vitest";
import { createCodecs } from "../src/abis";
import { CARTRIDGE_VRF_PROVIDER, resolveDeployment } from "../src/deployment";
import { PavedClient, type PavedRpc } from "../src/paved-client";
import { FakeGameViews, RpcGameViews, ViewError, toViewError, type DrawView, type FakeGame } from "../src/views";
import { WriteError } from "../src/writer";

const PLAYER = "0xc";
const KEY = { mode: "challenge", gameId: 1 } as const;
const sepolia = resolveDeployment({ network: "sepolia", env: { rpcUrl: "http://s/rpc", addresses: { Challenge: "0x2" } } });
/** A devnet without the mock in its file: no provider, so no request. */
const bare = resolveDeployment({ network: "devnet", env: { rpcUrl: "http://d/rpc", addresses: { Challenge: "0x2" } } });

function writerOn(deployment: typeof sepolia, draw: DrawView | Error) {
  const sent: Call[][] = [];
  const account = { address: PLAYER, execute: async (calls: Call[]) => (sent.push([...calls]), { transaction_hash: "0x1" }) };
  const rpc = { callContract: async () => [], waitForTransaction: async () => ({ execution_status: "SUCCEEDED", events: [] }) } as unknown as PavedRpc;
  const views = new FakeGameViews();
  if (draw instanceof Error) views.draw = async () => Promise.reject(draw);
  else views.setGame(KEY, { game: { id: 1, playerId: PLAYER } as FakeGame["game"], tiles: [], builder: { gameId: 1, playerId: PLAYER, tileId: 2, plan: 1 }, draw });
  views.spawnSalts.set(BigInt(PLAYER).toString(), "0x77");
  return { writer: new PavedClient(deployment, rpc, createCodecs(), views).writer(account), sent, views };
}

const drawing: DrawView = { gameId: 1, next: 4, after: 9, tiles: 0n, vrf: true, draws: true, salt: "0x5a17" };

describe("a drawing write requests its draw first", () => {
  test("a move that draws: request_random(Challenge, Salt(salt)) on Cartridge's provider, then the move", async () => {
    const { writer, sent } = writerOn(sepolia, drawing);
    await writer.discard(KEY);
    expect(sent).toHaveLength(1);
    const [request, discard] = sent[0]!;
    expect([BigInt(request!.contractAddress), request!.entrypoint, (request!.calldata as string[]).map(BigInt)]).toEqual([
      BigInt(CARTRIDGE_VRF_PROVIDER),
      "request_random",
      [2n, 1n, 0x5a17n],
    ]);
    expect(discard!.entrypoint).toBe("discard");
  });

  test("a move that draws nothing (the deck's end): the move alone, or Cartridge's wrapper would revert in assert_consumed", async () => {
    const { writer, sent } = writerOn(sepolia, { ...drawing, draws: false, salt: "0x0" });
    await writer.build(KEY, { orientation: 1, x: 2, y: 3 });
    expect(sent[0]!.map((c) => c.entrypoint)).toEqual(["build"]);
  });

  test("a free spawn: always, with the player's spawn salt", async () => {
    const { writer, sent } = writerOn(sepolia, drawing);
    await writer.spawnFree().catch(() => undefined);
    expect(sent[0]!.map((c) => c.entrypoint)).toEqual(["request_random", "spawn_free"]);
    expect(BigInt((sent[0]![0]!.calldata as string[])[2]!)).toBe(0x77n);
  });

  test("a draw that cannot be read sends nothing", async () => {
    const { writer, sent } = writerOn(sepolia, new Error("node down"));
    await expect(writer.discard(KEY)).rejects.toBeInstanceOf(WriteError);
    expect(sent).toEqual([]);
  });

  test("without a provider (a devnet file without the mock) the write goes alone and reads no draw", async () => {
    const { writer, sent, views } = writerOn(bare, drawing);
    await writer.discard(KEY);
    expect(sent[0]!.map((c) => c.entrypoint)).toEqual(["discard"]);
    expect(views.calls.filter((c) => c.startsWith("draw"))).toEqual([]);
  });
});

describe("a deployed class from before #645 (no draw, no spawn_salt): the writes go as before", () => {
  // The node's answer for an entry point the class lacks (Sepolia's Challenge before #645, RPC error 21)
  const missing = () => toViewError(new Error("RPC: starknet_call with params {...} 21: Requested entrypoint does not exist"));

  test("the node's error reads as not-available", () => {
    expect(missing()).toBeInstanceOf(ViewError);
    expect(missing().kind).toBe("not-available");
  });

  test("a move goes alone, and the writer reads no draw again", async () => {
    const { writer, sent, views } = writerOn(sepolia, drawing);
    views.draw = async () => Promise.reject(missing());
    await writer.discard(KEY);
    await writer.build(KEY, { orientation: 1, x: 2, y: 3 });
    expect(sent.map((calls) => calls.map((c) => c.entrypoint))).toEqual([["discard"], ["build"]]);
  });

  test("a spawn goes alone", async () => {
    const { writer, sent, views } = writerOn(sepolia, drawing);
    views.spawnSalt = async () => Promise.reject(missing());
    await writer.spawnFree().catch(() => undefined);
    expect(sent[0]!.map((c) => c.entrypoint)).toEqual(["spawn_free"]);
  });

  test("another failure of the read still sends nothing", async () => {
    const { writer, sent, views } = writerOn(sepolia, drawing);
    views.spawnSalt = async () => Promise.reject(toViewError(new Error("timeout")));
    await expect(writer.spawnFree()).rejects.toBeInstanceOf(WriteError);
    expect(sent).toEqual([]);
  });
});

describe("the draw view", () => {
  test("decodes Challenge.draw in the ABI's order, the bitmap as a bigint", async () => {
    const provider = {
      callContract: async (call: { entrypoint: string; calldata: string[] }) => {
        expect(call.entrypoint).toBe("draw");
        expect(call.calldata.map(BigInt)).toEqual([7n]);
        return ["0x7", "0x5", "0x0", "0x123", "0x1", "0x0", "0xabc"];
      },
    };
    const views = new RpcGameViews(provider, sepolia, createCodecs());
    expect(await views.draw({ mode: "challenge", gameId: 7 })).toEqual({ gameId: 7, next: 5, after: 0, tiles: 0x123n, vrf: true, draws: false, salt: "0xabc" });
  });
});
