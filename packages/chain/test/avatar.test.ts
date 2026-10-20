/** The avatar on chain (#627): the look's packing, the views of `Avatar` through the codec, its two writes, their typed refusals, the fakes. */
import { describe, expect, test, vi } from "vitest";
import { createCodecs } from "../src/abis";
import { AVATAR_LISTED, AVATAR_WITHDRAWN, canSetLook, isFreeItem, isLayout, isOnSale, lookIds, lookOf, ownsItem, unlistedItem, type AvatarItem } from "../src/avatar";
import { CONTROLLER_ENTRY_POINTS, controllerPolicies } from "../src/auth/controller";
import { resolveDeployment } from "../src/deployment";
import { PavedClient, type PavedRpc } from "../src/paved-client";
import { FakeGameViews, RpcGameViews, ViewError, type CallProvider } from "../src/views";
import { AvatarPriceChangedError, AvatarRefusedError, WriteError, type AvatarRefusal } from "../src/writer";

const AVATAR = "0x7";
const PLAYER = "0x5";
const deployment = resolveDeployment({ network: "devnet", env: { rpcUrl: "http://x", addresses: { Challenge: "0x2", Setup: "0x3", Avatar: AVATAR } } });
const codecs = createCodecs();
/** The tests' layout, as the contract's tests: four categories of 3, 4, 7 and 2 bits. */
const WIDTHS = [3, 4, 7, 2];

const item = (over: Partial<AvatarItem> & { category: number; id: number }): AvatarItem => ({ ...unlistedItem(over.category, over.id), state: AVATAR_LISTED, ...over });

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

const sent = (execute: ReturnType<typeof writerWith>["execute"]) => execute.mock.calls[0][0].map((c) => [BigInt(c.contractAddress), c.entrypoint, c.calldata.map(BigInt)]);

describe("the look", () => {
  test("category 0 in the lowest bits, each id at its offset, as the contract packs it", () => {
    expect(lookOf([1, 0, 0, 0], WIDTHS)).toBe(1n);
    expect(lookOf([0, 1, 0, 0], WIDTHS)).toBe(8n);
    expect(lookOf([0, 0, 1, 0], WIDTHS)).toBe(128n);
    expect(lookOf([0, 0, 0, 1], WIDTHS)).toBe(0x4000n);
    expect(lookOf([7, 15, 127, 3], WIDTHS)).toBe(0xffffn);
    expect(lookIds(0xffffn, WIDTHS)).toEqual([7, 15, 127, 3]);
    expect(lookIds(0x10000n, WIDTHS)).toBeNull();
    // thirty categories of 7 bits: 210 bits
    const wide = new Array(30).fill(7);
    const top = lookOf(new Array(30).fill(127), wide);
    expect(top).toBe(2n ** 210n - 1n);
    expect(lookIds(top, wide)).toEqual(new Array(30).fill(127));
  });

  test("an id wider than its category, or a count that differs, throws", () => {
    expect(() => lookOf([8, 0, 0, 0], WIDTHS)).toThrow(RangeError);
    expect(() => lookOf([0, 0, 0], WIDTHS)).toThrow(RangeError);
    expect(() => lookOf([-1, 0, 0, 0], WIDTHS)).toThrow(RangeError);
  });

  test("the layouts the contract accepts", () => {
    expect(isLayout(WIDTHS)).toBe(true);
    expect(isLayout([])).toBe(false);
    expect(isLayout([0])).toBe(false);
    expect(isLayout([8])).toBe(false);
    expect(isLayout(new Array(31).fill(1))).toBe(false);
  });

  test("canSetLook: 0 always; any other fits the layout and each part is listed and free, or owned", () => {
    const catalogue = new Map<string, AvatarItem>([
      ["0:1", item({ category: 0, id: 1 })],
      ["0:2", item({ category: 0, id: 2, cobbles: 30 })],
      ["0:3", item({ category: 0, id: 3, state: AVATAR_WITHDRAWN })],
    ]);
    const at = (c: number, i: number) => (c === 0 ? catalogue.get(`${c}:${i}`) : item({ category: c, id: i }));
    const none = () => 0n;
    const owns2 = (c: number) => (c === 0 ? 1n << 2n : 0n);
    expect(canSetLook(0n, [], at, none)).toBe(true);
    expect(canSetLook(1n, [], at, none)).toBe(false);
    expect(canSetLook(lookOf([1, 0, 0, 0], WIDTHS), WIDTHS, at, none)).toBe(true);
    expect(canSetLook(lookOf([2, 0, 0, 0], WIDTHS), WIDTHS, at, none)).toBe(false);
    expect(canSetLook(lookOf([2, 0, 0, 0], WIDTHS), WIDTHS, at, owns2)).toBe(true);
    // withdrawn and free is no longer free; never listed is never free
    expect(canSetLook(lookOf([3, 0, 0, 0], WIDTHS), WIDTHS, at, none)).toBe(false);
    expect(canSetLook(lookOf([4, 0, 0, 0], WIDTHS), WIDTHS, at, none)).toBe(false);
    expect(canSetLook(0x10000n, WIDTHS, at, none)).toBe(false);
  });

  test("isFreeItem, isOnSale and ownsItem", () => {
    expect(isFreeItem(item({ category: 0, id: 0 }))).toBe(true);
    expect(isFreeItem(item({ category: 0, id: 0, state: AVATAR_WITHDRAWN }))).toBe(false);
    expect(isOnSale(item({ category: 0, id: 0 }), 0)).toBe(false);
    expect(isOnSale(item({ category: 0, id: 0, cobbles: 50 }), 0)).toBe(true);
    expect(isOnSale(item({ category: 0, id: 0, cobbles: 50, supply: 2, sold: 2 }), 0)).toBe(false);
    expect(isOnSale(item({ category: 0, id: 0, cobbles: 50, until: 1000 }), 999)).toBe(true);
    expect(isOnSale(item({ category: 0, id: 0, cobbles: 50, until: 1000 }), 1000)).toBe(false);
    expect(ownsItem(1n << 127n, 127)).toBe(true);
    expect(ownsItem(1n << 127n, 126)).toBe(false);
  });
});

describe("the views follow Avatar.json", () => {
  test("Avatar has the two writes and the views", () => {
    for (const fn of ["buy_avatar_item", "set_avatar", "avatar", "owned", "item", "items", "layout", "price_bounds"]) {
      expect(codecs.Avatar.hasFunction(fn), fn).toBe(true);
    }
  });

  test("layout, price_bounds, item, items, owned and avatar, decoded", async () => {
    const one = ["0x1", "0x1e", "0x2", "0x5", "0x3e8"];
    const { views: v, calls } = views((entrypoint) => {
      switch (entrypoint) {
        case "layout":
          return ["0x4", "0x3", "0x4", "0x7", "0x2"];
        case "price_bounds":
          return ["0x14", "0x64"];
        case "item":
          return one;
        case "items":
          return ["0x2", ...one, "0x0", "0x0", "0x0", "0x0", "0x0"];
        case "owned":
          return [`0x${(1n << 127n).toString(16)}`];
        default:
          return ["0xffff"];
      }
    });
    expect(await v.avatarLayout()).toEqual(WIDTHS);
    expect(await v.avatarPriceBounds()).toEqual([20, 100]);
    expect(await v.avatarItem(0, 2)).toEqual({ category: 0, id: 2, state: 1, cobbles: 30, sold: 2, supply: 5, until: 1000 });
    expect(await v.avatarItems(1)).toEqual([
      { category: 1, id: 0, state: 1, cobbles: 30, sold: 2, supply: 5, until: 1000 },
      unlistedItem(1, 1),
    ]);
    expect(ownsItem(await v.ownedAvatarItems(PLAYER, 2), 127)).toBe(true);
    expect(await v.avatar(PLAYER)).toBe(0xffffn);
    expect(calls.map((c) => [BigInt(c.contractAddress), c.entrypoint, c.calldata.map(Number)])).toEqual([
      [7n, "layout", []],
      [7n, "price_bounds", []],
      [7n, "item", [0, 2]],
      [7n, "items", [1]],
      [7n, "owned", [5, 2]],
      [7n, "avatar", [5]],
    ]);
  });

  test("without an Avatar address every view is not-configured", async () => {
    const none = resolveDeployment({ network: "devnet", env: { rpcUrl: "http://x", addresses: { Challenge: "0x2" } } });
    const { views: v } = views(() => [], none);
    await expect(v.avatar(PLAYER)).rejects.toMatchObject({ kind: "not-configured" });
    await expect(v.avatarLayout()).rejects.toBeInstanceOf(ViewError);
  });
});

describe("the writes", () => {
  test("buyAvatarItem reads the price again, then sends buy_avatar_item(category, id)", async () => {
    const { writer, execute } = writerWith();
    const read = vi.fn(async (category: number, id: number) => item({ category, id, cobbles: 30 }));
    await writer.buyAvatarItem({ category: 2, id: 127, confirmedPrice: 30 }, { avatarItem: read });
    expect(read).toHaveBeenCalledWith(2, 127);
    expect(sent(execute)).toEqual([[7n, "buy_avatar_item", [2n, 127n]]]);
  });

  test("a price changed, or withdrawn, at send sends nothing", async () => {
    const { writer, execute } = writerWith();
    await expect(
      writer.buyAvatarItem({ category: 0, id: 2, confirmedPrice: 30 }, { avatarItem: async () => item({ category: 0, id: 2, cobbles: 40 }) }),
    ).rejects.toBeInstanceOf(AvatarPriceChangedError);
    await expect(
      writer.buyAvatarItem({ category: 0, id: 2, confirmedPrice: 30 }, { avatarItem: async () => item({ category: 0, id: 2, cobbles: 30, state: AVATAR_WITHDRAWN }) }),
    ).rejects.toMatchObject({ current: 0 });
    expect(execute).not.toHaveBeenCalled();
  });

  test("refused before sending: no Avatar, an id out of range, no confirmed price", async () => {
    const none = resolveDeployment({ network: "devnet", env: { rpcUrl: "http://x", addresses: { Challenge: "0x2" } } });
    const views = { avatarItem: async () => item({ category: 0, id: 0, cobbles: 30 }) };
    await expect(writerWith({ dep: none }).writer.buyAvatarItem({ category: 0, id: 0, confirmedPrice: 30 }, views)).rejects.toThrow(/No Avatar/);
    await expect(writerWith({ dep: none }).writer.setAvatar(1n)).rejects.toThrow(/No Avatar/);
    const { writer, execute } = writerWith();
    await expect(writer.buyAvatarItem({ category: 30, id: 0, confirmedPrice: 30 }, views)).rejects.toBeInstanceOf(AvatarRefusedError);
    await expect(writer.buyAvatarItem({ category: 0, id: 128, confirmedPrice: 30 }, views)).rejects.toBeInstanceOf(AvatarRefusedError);
    await expect(writer.buyAvatarItem({ category: 0, id: 1, confirmedPrice: 0 }, views)).rejects.toBeInstanceOf(WriteError);
    await expect(writer.setAvatar(2n ** 251n)).rejects.toMatchObject({ reason: "invalid-look" });
    expect(execute).not.toHaveBeenCalled();
  });

  test("setAvatar sends set_avatar(look); 0n clears it", async () => {
    const { writer, execute } = writerWith();
    await writer.setAvatar(lookOf([1, 2, 3, 0], WIDTHS));
    expect(sent(execute)).toEqual([[7n, "set_avatar", [lookOf([1, 2, 3, 0], WIDTHS)]]]);
    const clear = writerWith();
    await clear.writer.setAvatar(0n);
    expect(sent(clear.execute)).toEqual([[7n, "set_avatar", [0n]]]);
  });

  test("each revert is its typed refusal", async () => {
    const reverts: Array<[string, AvatarRefusal]> = [
      ["Avatar: item not owned", "not-owned"],
      ["Avatar: item owned", "owned"],
      ["Avatar: item not for sale", "not-for-sale"],
      ["Avatar: item sold out", "sold-out"],
      ["Avatar: sale ended", "sale-ended"],
      ["Setup: not enough cobbles", "not-enough-cobbles"],
      ["Avatar: invalid look", "invalid-look"],
    ];
    for (const [reason, refusal] of reverts) {
      const { writer } = writerWith({ receipt: { execution_status: "REVERTED", revert_reason: reason } });
      await expect(writer.setAvatar(1n), reason).rejects.toMatchObject({ name: "AvatarRefusedError", reason: refusal });
    }
  });
});

describe("the session and the fakes", () => {
  test("the two writes are session policies where the deployment has an Avatar", () => {
    expect(CONTROLLER_ENTRY_POINTS.Avatar).toEqual(["buy_avatar_item", "set_avatar"]);
    const methods = controllerPolicies(deployment).filter((p) => BigInt(p.target) === BigInt(AVATAR)).map((p) => p.method);
    expect(methods).toEqual(["buy_avatar_item", "set_avatar"]);
    const none = resolveDeployment({ network: "devnet", env: { rpcUrl: "http://x", addresses: { Challenge: "0x2", Setup: "0x3" } } });
    expect(controllerPolicies(none).map((p) => p.method)).not.toContain("set_avatar");
  });

  test("FakeGameViews answers the avatar in memory", async () => {
    const fake = new FakeGameViews();
    fake.avatars.layout = [...WIDTHS];
    fake.avatars.bounds = [20, 100];
    fake.listAvatarItem({ category: 0, id: 2, cobbles: 30 });
    fake.avatarPlayer(PLAYER).look = 9n;
    fake.avatarPlayer(PLAYER).owned.set(0, 4n);
    expect(await fake.avatarLayout()).toEqual(WIDTHS);
    expect(await fake.avatarPriceBounds()).toEqual([20, 100]);
    expect(await fake.avatarItem(0, 2)).toMatchObject({ state: 1, cobbles: 30 });
    expect(await fake.avatarItem(0, 3)).toEqual(unlistedItem(0, 3));
    expect((await fake.avatarItems(0)).map((i) => i.cobbles)).toEqual([0, 0, 30, 0, 0, 0, 0, 0]);
    await expect(fake.avatarItems(4)).rejects.toBeInstanceOf(ViewError);
    expect(await fake.avatar(PLAYER)).toBe(9n);
    expect(await fake.ownedAvatarItems(PLAYER, 0)).toBe(4n);
    expect(await fake.avatar("0x99")).toBe(0n);
    fake.avatarFail = new Error("down");
    await expect(fake.avatar(PLAYER)).rejects.toThrow("down");
  });
});
