/** The avatar on chain (#627): the look in AVATAR-LOOK's format, the views of `Avatar` through the codec, its two writes, their typed refusals, the fakes. */
import { describe, expect, test, vi } from "vitest";
import { createCodecs } from "../src/abis";
import { AVATAR_LISTED, AVATAR_WITHDRAWN, canSetLook, isFreeItem, isOnSale, lookIds, lookOf, ownsItem, unlistedItem, type AvatarItem } from "../src/avatar";
import { CONTROLLER_ENTRY_POINTS, controllerPolicies } from "../src/auth/controller";
import { resolveDeployment } from "../src/deployment";
import { PavedClient, type PavedRpc } from "../src/paved-client";
import { FakeGameViews, RpcGameViews, ViewError, type CallProvider } from "../src/views";
import { AvatarPriceChangedError, AvatarRefusedError, WriteError, type AvatarRefusal } from "../src/writer";

const AVATAR = "0x7";
const PLAYER = "0x5";
const deployment = resolveDeployment({ network: "devnet", env: { rpcUrl: "http://x", addresses: { Challenge: "0x2", Setup: "0x3", Avatar: AVATAR } } });
const codecs = createCodecs();
/** The tests' parts in use, as the contract's tests. */
const PARTS = 4;
/** The vector of the contract's `test_look_is_the_format_of_avatar_look`: ten parts, the backgrounds' last at 16. */
const IDS = [8, 5, 5, 4, 5, 7, 5, 7, 7, 16];
const LOOK = 0x1007070507050405050801n;

const item = (over: Partial<AvatarItem> & { part: number; id: number }): AvatarItem => ({ ...unlistedItem(over.part, over.id), state: AVATAR_LISTED, ...over });

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
  test("AVATAR-LOOK's format: the version in byte 0, part p in byte p + 1, as the contract reads it", () => {
    expect(lookOf([0, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toBe(1n);
    expect(lookOf([])).toBe(1n);
    expect(lookOf([1])).toBe(0x101n);
    expect(lookOf([0, 1])).toBe(0x10001n);
    expect(lookOf([0, 0, 0, 0, 0, 0, 0, 0, 0, 16])).toBe(0x1000000000000000000001n);
    expect(lookOf(IDS)).toBe(LOOK);
    expect(lookIds(LOOK, 10)).toEqual(IDS);
    // 0 (no avatar), another version, a byte past the parts: no ids
    expect(lookIds(0n, 10)).toBeNull();
    expect(lookIds(2n, 10)).toBeNull();
    expect(lookIds(0x1000000000000000000001n, 9)).toBeNull();
    // a shorter look reads item 0 in the parts it does not set
    expect(lookIds(0x0301n, 3)).toEqual([3, 0, 0]);
    const top = lookOf(new Array(15).fill(255));
    expect(top).toBe(2n ** 128n - 0xffn);
    expect(lookIds(top, 15)).toEqual(new Array(15).fill(255));
  });

  test("an id that is not a byte, or more than 15 parts, throws", () => {
    expect(() => lookOf([256])).toThrow(RangeError);
    expect(() => lookOf([-1])).toThrow(RangeError);
    expect(() => lookOf([1.5])).toThrow(RangeError);
    expect(() => lookOf(new Array(16).fill(0))).toThrow(RangeError);
  });

  test("canSetLook: 0 always; any other of the version, no byte past the parts, each part listed and free, or owned", () => {
    const catalogue = new Map<string, AvatarItem>([
      ["0:1", item({ part: 0, id: 1 })],
      ["0:2", item({ part: 0, id: 2, cobbles: 30 })],
      ["0:3", item({ part: 0, id: 3, state: AVATAR_WITHDRAWN })],
    ]);
    const at = (p: number, i: number) => (p === 0 ? catalogue.get(`${p}:${i}`) : item({ part: p, id: i }));
    const none = () => 0n;
    const owns2 = (p: number) => (p === 0 ? 1n << 2n : 0n);
    expect(canSetLook(0n, 0, at, none)).toBe(true);
    expect(canSetLook(1n, 0, at, none)).toBe(true);
    expect(canSetLook(0x101n, 0, at, none)).toBe(false);
    expect(canSetLook(lookOf([1, 0, 0, 0]), PARTS, at, none)).toBe(true);
    expect(canSetLook(lookOf([2, 0, 0, 0]), PARTS, at, none)).toBe(false);
    expect(canSetLook(lookOf([2, 0, 0, 0]), PARTS, at, owns2)).toBe(true);
    // withdrawn and free is no longer free; never listed is never free
    expect(canSetLook(lookOf([3, 0, 0, 0]), PARTS, at, none)).toBe(false);
    expect(canSetLook(lookOf([4, 0, 0, 0]), PARTS, at, none)).toBe(false);
    // a part past the parts in use, another version
    expect(canSetLook(lookOf([1, 0, 0, 0, 1]), PARTS, at, none)).toBe(false);
    expect(canSetLook(0x102n, PARTS, at, none)).toBe(false);
  });

  test("isFreeItem, isOnSale and ownsItem", () => {
    expect(isFreeItem(item({ part: 0, id: 0 }))).toBe(true);
    expect(isFreeItem(item({ part: 0, id: 0, state: AVATAR_WITHDRAWN }))).toBe(false);
    expect(isOnSale(item({ part: 0, id: 0 }), 0)).toBe(false);
    expect(isOnSale(item({ part: 0, id: 0, cobbles: 50 }), 0)).toBe(true);
    expect(isOnSale(item({ part: 0, id: 0, cobbles: 50, supply: 2, sold: 2 }), 0)).toBe(false);
    expect(isOnSale(item({ part: 0, id: 0, cobbles: 50, until: 1000 }), 999)).toBe(true);
    expect(isOnSale(item({ part: 0, id: 0, cobbles: 50, until: 1000 }), 1000)).toBe(false);
    expect(ownsItem(1n << 127n, 127)).toBe(true);
    expect(ownsItem(1n << 127n, 126)).toBe(false);
    expect(ownsItem(1n << 255n, 255)).toBe(true);
  });
});

describe("the views follow Avatar.json", () => {
  test("Avatar has the two writes and the views", () => {
    for (const fn of ["buy_avatar_item", "set_avatar", "avatar", "owned", "item", "items", "parts", "price_bounds"]) {
      expect(codecs.Avatar.hasFunction(fn), fn).toBe(true);
    }
  });

  test("parts, price_bounds, item, items, owned and avatar, decoded", async () => {
    const one = ["0x1", "0x1e", "0x2", "0x5", "0x3e8"];
    const { views: v, calls } = views((entrypoint) => {
      switch (entrypoint) {
        case "parts":
          return ["0xa"];
        case "price_bounds":
          return ["0x14", "0x64"];
        case "item":
          return one;
        case "items":
          return ["0x2", ...one, "0x0", "0x0", "0x0", "0x0", "0x0"];
        case "owned":
          // a u256: its low half, then its high half
          return ["0x0", `0x${(1n << 127n).toString(16)}`];
        default:
          return [`0x${LOOK.toString(16)}`];
      }
    });
    expect(await v.avatarParts()).toBe(10);
    expect(await v.avatarPriceBounds()).toEqual([20, 100]);
    expect(await v.avatarItem(0, 2)).toEqual({ part: 0, id: 2, state: 1, cobbles: 30, sold: 2, supply: 5, until: 1000 });
    expect(await v.avatarItems(1)).toEqual([{ part: 1, id: 0, state: 1, cobbles: 30, sold: 2, supply: 5, until: 1000 }, unlistedItem(1, 1)]);
    expect(ownsItem(await v.ownedAvatarItems(PLAYER, 2), 255)).toBe(true);
    expect(await v.avatar(PLAYER)).toBe(LOOK);
    expect(calls.map((c) => [BigInt(c.contractAddress), c.entrypoint, c.calldata.map(Number)])).toEqual([
      [7n, "parts", []],
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
    await expect(v.avatarParts()).rejects.toBeInstanceOf(ViewError);
  });
});

describe("the writes", () => {
  test("buyAvatarItem reads the price again, then sends buy_avatar_item(part, id)", async () => {
    const { writer, execute } = writerWith();
    const read = vi.fn(async (part: number, id: number) => item({ part, id, cobbles: 30 }));
    await writer.buyAvatarItem({ part: 2, id: 255, confirmedPrice: 30 }, { avatarItem: read });
    expect(read).toHaveBeenCalledWith(2, 255);
    expect(sent(execute)).toEqual([[7n, "buy_avatar_item", [2n, 255n]]]);
  });

  test("a price changed, or withdrawn, at send sends nothing", async () => {
    const { writer, execute } = writerWith();
    await expect(writer.buyAvatarItem({ part: 0, id: 2, confirmedPrice: 30 }, { avatarItem: async () => item({ part: 0, id: 2, cobbles: 40 }) })).rejects.toBeInstanceOf(
      AvatarPriceChangedError,
    );
    await expect(
      writer.buyAvatarItem({ part: 0, id: 2, confirmedPrice: 30 }, { avatarItem: async () => item({ part: 0, id: 2, cobbles: 30, state: AVATAR_WITHDRAWN }) }),
    ).rejects.toMatchObject({ current: 0 });
    expect(execute).not.toHaveBeenCalled();
  });

  test("refused before sending: no Avatar, a part or an id out of range, no confirmed price, a look wider than a u128", async () => {
    const none = resolveDeployment({ network: "devnet", env: { rpcUrl: "http://x", addresses: { Challenge: "0x2" } } });
    const views = { avatarItem: async () => item({ part: 0, id: 0, cobbles: 30 }) };
    await expect(writerWith({ dep: none }).writer.buyAvatarItem({ part: 0, id: 0, confirmedPrice: 30 }, views)).rejects.toThrow(/No Avatar/);
    await expect(writerWith({ dep: none }).writer.setAvatar(1n)).rejects.toThrow(/No Avatar/);
    const { writer, execute } = writerWith();
    await expect(writer.buyAvatarItem({ part: 15, id: 0, confirmedPrice: 30 }, views)).rejects.toBeInstanceOf(AvatarRefusedError);
    await expect(writer.buyAvatarItem({ part: 0, id: 256, confirmedPrice: 30 }, views)).rejects.toBeInstanceOf(AvatarRefusedError);
    await expect(writer.buyAvatarItem({ part: 0, id: 1, confirmedPrice: 0 }, views)).rejects.toBeInstanceOf(WriteError);
    await expect(writer.setAvatar(2n ** 128n)).rejects.toMatchObject({ reason: "invalid-look" });
    await expect(writer.setAvatar(-1n)).rejects.toMatchObject({ reason: "invalid-look" });
    expect(execute).not.toHaveBeenCalled();
  });

  test("setAvatar sends set_avatar(look); 0n clears it", async () => {
    const { writer, execute } = writerWith();
    await writer.setAvatar(LOOK);
    expect(sent(execute)).toEqual([[7n, "set_avatar", [LOOK]]]);
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
    const methods = controllerPolicies(deployment)
      .filter((p) => BigInt(p.target) === BigInt(AVATAR))
      .map((p) => p.method);
    expect(methods).toEqual(["buy_avatar_item", "set_avatar"]);
    const none = resolveDeployment({ network: "devnet", env: { rpcUrl: "http://x", addresses: { Challenge: "0x2", Setup: "0x3" } } });
    expect(controllerPolicies(none).map((p) => p.method)).not.toContain("set_avatar");
  });

  test("FakeGameViews answers the avatar in memory", async () => {
    const fake = new FakeGameViews();
    fake.avatars.parts = PARTS;
    fake.avatars.bounds = [20, 100];
    fake.listAvatarItem({ part: 0, id: 2, cobbles: 30 });
    fake.avatarPlayer(PLAYER).look = 9n;
    fake.avatarPlayer(PLAYER).owned.set(0, 4n);
    expect(await fake.avatarParts()).toBe(PARTS);
    expect(await fake.avatarPriceBounds()).toEqual([20, 100]);
    expect(await fake.avatarItem(0, 2)).toMatchObject({ state: 1, cobbles: 30 });
    expect(await fake.avatarItem(0, 3)).toEqual(unlistedItem(0, 3));
    expect((await fake.avatarItems(0)).map((i) => i.cobbles)).toEqual([0, 0, 30]);
    expect(await fake.avatarItems(4)).toEqual([]);
    expect(await fake.avatar(PLAYER)).toBe(9n);
    expect(await fake.ownedAvatarItems(PLAYER, 0)).toBe(4n);
    expect(await fake.avatar("0x99")).toBe(0n);
    fake.avatarFail = new Error("down");
    await expect(fake.avatar(PLAYER)).rejects.toThrow("down");
  });
});
