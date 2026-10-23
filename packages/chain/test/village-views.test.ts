/** The village screen's reads and writes (#646 PR 2): `Village`'s and `Rewards`' views through the codec, the fakes, the writes and their typed refusals. */
import { describe, expect, test, vi } from "vitest";
import { createCodecs } from "../src/abis";
import { CONTROLLER_ENTRY_POINTS, controllerPolicies } from "../src/auth/controller";
import { resolveDeployment } from "../src/deployment";
import { PavedClient, type PavedRpc } from "../src/paved-client";
import { FakeGameViews, RpcGameViews, ViewError, type CallProvider } from "../src/views";
import { NO_VILLAGE, hasVillageViews } from "../src/village";
import { vrfSalt } from "../src/vrf";
import { VillageRefusedError, WriteError, type VillageRefusal } from "../src/writer";

const VILLAGE = "0x8";
const REWARDS = "0x9";
const PLAYER = "0x5";
const CENTER = 0x7fffffff;
const hex = (n: number | bigint) => `0x${n.toString(16)}`;
const deployment = resolveDeployment({ network: "devnet", env: { rpcUrl: "http://x", addresses: { Challenge: "0x2", Setup: "0x3", Village: VILLAGE, Rewards: REWARDS } } });
const bare = resolveDeployment({ network: "devnet", env: { rpcUrl: "http://x", addresses: { Challenge: "0x2", Setup: "0x3" } } });
const codecs = createCodecs();

function views(answer: (entrypoint: string, calldata: string[]) => string[], dep = deployment) {
  const calls: Array<{ contractAddress: string; entrypoint: string; calldata: string[] }> = [];
  const provider: CallProvider = {
    callContract: async (call) => {
      calls.push(call);
      return answer(call.entrypoint, call.calldata);
    },
  };
  return { views: new RpcGameViews(provider, dep, codecs), calls };
}

type Receipt = { execution_status?: string; revert_reason?: string; events?: unknown[] };

function writerWith(options: { receipt?: Receipt; dep?: typeof deployment } = {}) {
  const execute = vi.fn(async (_calls: Array<{ contractAddress: string; entrypoint: string; calldata: string[] }>) => ({ transaction_hash: "0x1" }));
  const rpc = {
    callContract: async () => [],
    getEvents: async () => ({ events: [] }),
    waitForTransaction: async () => options.receipt ?? { execution_status: "SUCCEEDED", events: [] },
  } as unknown as PavedRpc;
  const writer = new PavedClient(options.dep ?? deployment, rpc, codecs, new FakeGameViews()).writer({ address: PLAYER, execute });
  return { writer, execute };
}

const sent = (execute: ReturnType<typeof writerWith>["execute"]) => execute.mock.calls[0]![0].map((c) => [BigInt(c.contractAddress), c.entrypoint, c.calldata.map(BigInt)]);

describe("the deployment", () => {
  test("Village and Rewards are optional addresses, from the env or the file", () => {
    expect(deployment.addresses.Village).toBe(VILLAGE);
    expect(deployment.addresses.Rewards).toBe(REWARDS);
    expect(bare.configured).toBe(true);
    expect(bare.addresses.Village).toBe("");
    const file = resolveDeployment({ network: "devnet", file: { contracts: { Challenge: { address: "0x2" }, Village: { address: "0x18" }, Rewards: { address: "0x19" } } } });
    expect([file.addresses.Village, file.addresses.Rewards]).toEqual(["0x18", "0x19"]);
  });

  test("the session signs found, buy_parcel, open_reward and claim_reward where the deployment has them", () => {
    expect(CONTROLLER_ENTRY_POINTS.Village).toEqual(["found", "buy_parcel"]);
    expect(CONTROLLER_ENTRY_POINTS.Rewards).toEqual(["open_reward", "claim_reward"]);
    const methods = (dep: typeof deployment) => controllerPolicies(dep).map((p) => `${BigInt(p.target)}:${p.method}`);
    expect(methods(deployment)).toEqual(expect.arrayContaining(["8:found", "8:buy_parcel", "9:open_reward", "9:claim_reward"]));
    expect(methods(bare).some((m) => m.startsWith("8:") || m.startsWith("9:"))).toBe(false);
  });
});

describe("RpcGameViews' village reads", () => {
  test("village, cells, tiles and max_cells on Village, decoded relative to the starter", async () => {
    const { views: v, calls } = views((entrypoint) => {
      switch (entrypoint) {
        case "village":
          return ["0x3", "0xa", "0x1", "0x1b6", "0x2", "0x14", "0x2"];
        case "cells":
          return ["0x2", hex(CENTER), hex(CENTER), hex(CENTER + 2), hex(CENTER - 1)];
        case "tiles":
          return ["0x2", "0x1", "0x9", "0x3", hex(CENTER), hex(CENTER), "0x2", "0xa", "0x1", hex(CENTER + 1), hex(CENTER)];
        case "max_cells":
          return ["0x26"];
        default:
          throw new Error(entrypoint);
      }
    });
    expect(await v.village(PLAYER)).toEqual({ gameId: 3, cells: 10, tiles: 1, score: 438, nextParcel: 2, nextPrice: 20, nextLevel: 2 });
    expect(await v.villageCells(PLAYER)).toEqual([
      { x: 0, y: 0 },
      { x: 2, y: -1 },
    ]);
    expect(await v.villageTiles(PLAYER)).toEqual([
      { id: 1, plan: 9, orientation: 3, x: 0, y: 0 },
      { id: 2, plan: 10, orientation: 1, x: 1, y: 0 },
    ]);
    expect(await v.villageMaxCells()).toBe(38);
    expect(calls.map((c) => [c.contractAddress, c.entrypoint, c.calldata])).toEqual([
      [VILLAGE, "village", ["0x5"]],
      [VILLAGE, "cells", ["0x5"]],
      [VILLAGE, "tiles", ["0x5"]],
      [VILLAGE, "max_cells", []],
    ]);
  });

  test("grants, offer and copies on Rewards; the skins' tiers on Setup", async () => {
    const { views: v, calls } = views((entrypoint, calldata) => {
      switch (entrypoint) {
        case "grants":
          return ["0x4e20", "0x2", "0x1", "0x3"];
        case "offer":
          return ["0x3", "0xa", "0x9", "0x12"];
        case "copies":
          return ["0x13", ...Array.from({ length: 19 }, (_, i) => hex(i === 9 ? 4 : 0))];
        case "skin_tier":
          return [calldata[1] === "0x12" ? "0x2" : "0x0"];
        default:
          throw new Error(entrypoint);
      }
    });
    expect(await v.rewardGrants(PLAYER)).toEqual({ day: 20_000, today: 2, pending: 1, opened: 3 });
    expect(await v.rewardOffer(PLAYER)).toEqual({ index: 3, plans: [10, 9, 18] });
    const copies = await v.planCopies(PLAYER);
    expect(copies).toHaveLength(19);
    expect(copies[9]).toBe(4);
    const tiers = await v.skinTiers(1);
    expect(tiers[17]).toBe(2);
    expect(tiers.filter((t) => t > 0)).toHaveLength(1);
    expect(calls.slice(0, 3).map((c) => [c.contractAddress, c.entrypoint])).toEqual([
      [REWARDS, "grants"],
      [REWARDS, "offer"],
      [REWARDS, "copies"],
    ]);
    expect(calls.filter((c) => c.entrypoint === "skin_tier").every((c) => c.contractAddress === "0x3")).toBe(true);
  });

  test("copies of another length than the 19 plans is the ABI's mismatch", async () => {
    const { views: v } = views(() => ["0x2", "0x1", "0x1"]);
    await expect(v.planCopies(PLAYER)).rejects.toMatchObject({ kind: "abi-mismatch" });
  });

  test("a deployment without Village or Rewards reads not-configured", async () => {
    const { views: v, calls } = views(() => [], bare);
    await expect(v.village(PLAYER)).rejects.toMatchObject({ kind: "not-configured" });
    await expect(v.rewardOffer(PLAYER)).rejects.toMatchObject({ kind: "not-configured" });
    expect(calls).toEqual([]);
  });
});

describe("FakeGameViews' village", () => {
  test("a player not listed has founded nothing and has no reward; a test edits the player in place", async () => {
    const fake = new FakeGameViews();
    expect(hasVillageViews(fake)).toBe(true);
    expect(await fake.village(PLAYER)).toEqual(NO_VILLAGE);
    expect(await fake.villageCells(PLAYER)).toEqual([]);
    expect(await fake.rewardOffer(PLAYER)).toEqual({ index: 0, plans: [0, 0, 0] });
    expect(await fake.planCopies(PLAYER)).toEqual(new Array(19).fill(0));
    const player = fake.villagePlayer(PLAYER);
    player.offer = { index: 1, plans: [3, 4, 5] };
    player.copies[2] = 2;
    fake.skinTierTable.set("1:3", 1);
    expect(await fake.rewardOffer("0x05")).toEqual({ index: 1, plans: [3, 4, 5] });
    expect((await fake.planCopies(PLAYER))[2]).toBe(2);
    expect((await fake.skinTiers(1))[2]).toBe(1);
    expect(await fake.villageMaxCells()).toBe(38);
    fake.villageFail = new ViewError("rpc", "down");
    await expect(fake.village(PLAYER)).rejects.toThrow("down");
  });
});

describe("the village's writes", () => {
  test("found sends Village.found", async () => {
    const { writer, execute } = writerWith();
    await writer.foundVillage();
    expect(sent(execute)).toEqual([[8n, "found", []]]);
  });

  test("buy_parcel sends the chain's coordinates after reading the price the sheet showed", async () => {
    const { writer, execute } = writerWith();
    const village = vi.fn(async () => ({ ...NO_VILLAGE, gameId: 1, cells: 9, nextPrice: 10 }));
    await writer.buyParcel({ cell: { x: 2, y: -1 }, confirmedPrice: 10 }, { village });
    expect(village).toHaveBeenCalledWith(PLAYER);
    expect(sent(execute)).toEqual([[8n, "buy_parcel", [BigInt(CENTER + 2), BigInt(CENTER - 1)]]]);
  });

  test("another price at send sends nothing; a failed read sends nothing", async () => {
    const { writer, execute } = writerWith();
    await expect(writer.buyParcel({ cell: { x: 2, y: 0 }, confirmedPrice: 10 }, { village: async () => ({ ...NO_VILLAGE, nextPrice: 20 }) })).rejects.toMatchObject({ reason: "price-changed", reverted: false });
    await expect(writer.buyParcel({ cell: { x: 2, y: 0 }, confirmedPrice: 10 }, { village: async () => Promise.reject(new Error("rpc down")) })).rejects.toThrow("Nothing was sent");
    await expect(writer.buyParcel({ cell: { x: 2, y: 0 }, confirmedPrice: 0 }, { village: async () => NO_VILLAGE })).rejects.toThrow("No confirmed price");
    expect(execute).not.toHaveBeenCalled();
  });

  test("open_reward requests its draw first, with the reward's salt, on a network with a provider", async () => {
    const sepolia = resolveDeployment({ network: "sepolia", env: { rpcUrl: "http://s", addresses: { Challenge: "0x2", Rewards: REWARDS } } });
    const { writer, execute } = writerWith({ dep: sepolia });
    await writer.openReward({ rewardGrants: async () => ({ day: 1, today: 1, pending: 1, opened: 4 }) });
    const calls = sent(execute);
    expect(calls).toHaveLength(2);
    expect(calls[0]![1]).toBe("request_random");
    expect(calls[0]![2]).toEqual([BigInt(REWARDS), 1n, BigInt(vrfSalt("REWARD", PLAYER, 4))]);
    expect(calls[1]).toEqual([9n, "open_reward", []]);
  });

  test("open_reward goes alone without a provider (the devnet's mock)", async () => {
    const { writer, execute } = writerWith();
    const grants = vi.fn();
    await writer.openReward({ rewardGrants: grants });
    expect(sent(execute)).toEqual([[9n, "open_reward", []]]);
    expect(grants).not.toHaveBeenCalled();
  });

  test("claim_reward sends the choice", async () => {
    const { writer, execute } = writerWith();
    await writer.claimReward({ choice: "place", slot: 1, orientation: 2, cell: { x: 1, y: 0 } });
    expect(sent(execute)).toEqual([[9n, "claim_reward", [1n, 1n, 2n, BigInt(CENTER + 1), BigInt(CENTER)]]]);
  });

  test("a deployment without Village or Rewards sends nothing", async () => {
    const { writer, execute } = writerWith({ dep: bare });
    await expect(writer.foundVillage()).rejects.toThrow("No Village contract");
    await expect(writer.buyParcel({ cell: { x: 2, y: 0 }, confirmedPrice: 10 }, { village: async () => NO_VILLAGE })).rejects.toThrow("No Village contract");
    await expect(writer.openReward({ rewardGrants: async () => ({ day: 0, today: 0, pending: 1, opened: 0 }) })).rejects.toThrow("No Rewards contract");
    await expect(writer.claimReward({ choice: "cobbles" })).rejects.toThrow("No Rewards contract");
    expect(execute).not.toHaveBeenCalled();
  });

  test.each<[string, VillageRefusal]>([
    ["Village: already founded", "founded"],
    ["Village: cell not owned", "cell-not-owned"],
    ["Village: cell owned", "cell-owned"],
    ["Village: level too low", "level-too-low"],
    ["Setup: not enough cobbles", "not-enough-cobbles"],
    ["Tile: no neighbors", "no-neighbors"],
    ["Tile: cannot place", "cannot-place"],
    ["Rewards: no offer", "no-offer"],
  ])("the revert %s is the refusal %s", async (reason, refusal) => {
    const { writer } = writerWith({ receipt: { execution_status: "REVERTED", revert_reason: `Failure reason: '${reason}'.` } });
    const error = await writer.claimReward({ choice: "merge", slot: 0 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(VillageRefusedError);
    expect(error).toMatchObject({ reason: refusal, transactionHash: "0x1", reverted: true });
  });

  test("another revert stays the WriteError it was", async () => {
    const { writer } = writerWith({ receipt: { execution_status: "REVERTED", revert_reason: "Out of gas" } });
    const error = await writer.foundVillage().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WriteError);
    expect(error).not.toBeInstanceOf(VillageRefusedError);
  });
});
