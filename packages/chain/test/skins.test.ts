/** The skins of `Setup` (cobbles v1, part 3): the views through the codec, `buy_skin` and `set_skins`, their typed refusals, the fakes. */
import { shortString } from "starknet";
import { describe, expect, test, vi } from "vitest";
import setupAbi from "../../../contracts/abis/Setup.json";
import { createCodecs } from "../src/abis";
import { resolveDeployment } from "../src/deployment";
import { PavedClient, type PavedRpc } from "../src/paved-client";
import { SKIN_PLANS, activeThemes, ownsSkin } from "../src/skins";
import { FakeGameViews, RpcGameViews, ViewError, type CallProvider } from "../src/views";
import { SkinPriceChangedError, SkinRefusedError, WriteError, type SkinRefusal } from "../src/writer";

/** The price the card showed (75 Cobbles), and the `skin_price` read again at send. */
const PRICE = { skinPrice: async () => 75 };
const buy = (theme: number, plan: number) => ({ theme, plan, confirmedPrice: 75 });

const SETUP = "0x3";
const PLAYER = "0x5";
const deployment = resolveDeployment({ network: "devnet", env: { rpcUrl: "http://x", addresses: { Challenge: "0x2", Setup: SETUP } } });
const codecs = createCodecs();

function views(answer: (entrypoint: string, calldata: string[]) => string[]) {
  const calls: Array<{ contractAddress: string; entrypoint: string; calldata: string[] }> = [];
  const provider: CallProvider = {
    callContract: async (call) => {
      calls.push(call);
      return answer(call.entrypoint, call.calldata);
    },
  };
  return { views: new RpcGameViews(provider, deployment, codecs), calls };
}

type Receipt = { execution_status?: string; revert_reason?: string; events?: unknown[] };

function writerWith(options: { receipt?: Receipt; execute?: () => Promise<{ transaction_hash: string }>; dep?: typeof deployment } = {}) {
  const execute = vi.fn(async (_calls: Array<{ contractAddress: string; entrypoint: string; calldata: string[] }>) => (options.execute ? options.execute() : { transaction_hash: "0x1" }));
  const rpc = {
    callContract: async () => [],
    getEvents: async () => ({ events: [] }),
    waitForTransaction: async () => options.receipt ?? { execution_status: "SUCCEEDED", events: [] },
  } as unknown as PavedRpc;
  const writer = new PavedClient(options.dep ?? deployment, rpc, codecs, new FakeGameViews()).writer({ address: PLAYER, execute });
  return { writer, execute };
}

const sent = (execute: ReturnType<typeof writerWith>["execute"]) => execute.mock.calls[0][0].map((c) => [BigInt(c.contractAddress), c.entrypoint, c.calldata.map(Number)]);

/** A raw event of `Setup`: the selector, the keys, the data. */
const raw = (name: string, keys: string[], data: string[]) => ({ from_address: SETUP, keys: [codecs.Setup.eventSelector(name), ...keys], data });

describe("the skins follow Setup.json", () => {
  test("Setup has the two writes and the three views", () => {
    for (const fn of ["buy_skin", "set_skins", "skin_price", "skins", "active_skins"]) expect(codecs.Setup.hasFunction(fn), fn).toBe(true);
  });

  test("set_skins takes one Span<(u8, u8)>, the shape the writer encodes by hand", () => {
    type Entry = { type: string; name?: string; items?: Entry[]; inputs?: Array<{ name: string; type: string }> };
    const fns = (setupAbi as Entry[]).flatMap((e) => (e.type === "interface" ? (e.items ?? []) : [e]));
    expect(fns.find((f) => f.name === "set_skins")?.inputs).toEqual([{ name: "changes", type: "core::array::Span::<(core::integer::u8, core::integer::u8)>" }]);
  });

  test("skin_price, skins and active_skins, decoded", async () => {
    const { views: v, calls } = views((entrypoint) =>
      entrypoint === "skin_price" ? ["0x4b"] : entrypoint === "skins" ? [`0x${((1 << 7) | (1 << 19)).toString(16)}`] : ["0x13", ...Array.from({ length: 19 }, (_, i) => (i === 6 ? "0x1" : "0x0"))],
    );
    expect(await v.skinPrice(1, 7)).toBe(75);
    const owned = await v.ownedSkins(PLAYER, 1);
    expect([ownsSkin(owned, 7), ownsSkin(owned, 19), ownsSkin(owned, 8)]).toEqual([true, true, false]);
    expect(await v.activeSkins(PLAYER)).toEqual(Array.from({ length: 19 }, (_, i) => (i === 6 ? 1 : 0)));
    expect(calls.map((c) => [BigInt(c.contractAddress), c.entrypoint, c.calldata.map(Number)])).toEqual([
      [3n, "skin_price", [1, 7]],
      [3n, "skins", [5, 1]],
      [3n, "active_skins", [5]],
    ]);
  });

  test("skinPrices reads the 19 plans of a theme, plan 1 first", async () => {
    const { views: v, calls } = views((_, calldata) => [`0x${(49 + Number(calldata[1])).toString(16)}`]);
    expect(await v.skinPrices(1)).toEqual(Array.from({ length: SKIN_PLANS }, (_, i) => 50 + i));
    expect(calls.map((c) => c.calldata.map(Number))).toEqual(Array.from({ length: SKIN_PLANS }, (_, i) => [1, i + 1]));
  });

  test("an active set that is not 19 themes is an abi-mismatch; without Setup, not-configured", async () => {
    await expect(views(() => ["0x2", "0x1", "0x0"]).views.activeSkins(PLAYER)).rejects.toMatchObject({ kind: "abi-mismatch" });
    const none = resolveDeployment({ network: "devnet", env: { rpcUrl: "http://x", addresses: { Challenge: "0x2" } } });
    await expect(new RpcGameViews({ callContract: async () => [] }, none, codecs).skinPrice(1, 1)).rejects.toMatchObject({ kind: "not-configured" });
    await expect(views(() => { throw new Error("rpc down"); }).views.ownedSkins(PLAYER, 1)).rejects.toBeInstanceOf(ViewError);
  });

  test("SkinBought and SkinsActivated decode from a receipt; the active word unpacks plan 1 in the low byte", async () => {
    const word = (1n << 0n) | (1n << (8n * 6n)) | (2n << (8n * 18n));
    const { writer } = writerWith({
      receipt: {
        execution_status: "SUCCEEDED",
        events: [raw("SkinBought", [PLAYER], ["0x1", "0x7", "0x4b", "0xa5"]), raw("SkinsActivated", [PLAYER], [`0x${word.toString(16)}`])],
      },
    });
    const { events } = await writer.buySkin(buy(1, 7), PRICE);
    expect(events.map((e) => [e.name, e.fields])).toEqual([
      ["SkinBought", { playerId: PLAYER, theme: 1, plan: 7, cobbles: 75, balance: 165 }],
      ["SkinsActivated", { playerId: PLAYER, active: `0x${word.toString(16)}` }],
    ]);
    const themes = activeThemes(events[1]!.fields.active as string);
    expect(themes).toHaveLength(19);
    expect([themes[0], themes[6], themes[18], themes[1]]).toEqual([1, 1, 2, 0]);
  });
});

describe("the writes", () => {
  test("buy_skin is one call to Setup with the theme and the plan", async () => {
    const { writer, execute } = writerWith();
    await writer.buySkin(buy(1, 19), PRICE);
    expect(sent(execute)).toEqual([[3n, "buy_skin", [1, 19]]]);
  });

  test("skin_price is read again inside the serialised send: a changed price, a skin off sale or a failed read sends nothing", async () => {
    const read = vi.fn(async (theme: number, plan: number) => (theme === 1 && plan === 7 ? 80 : 0));
    const { writer, execute } = writerWith();
    const changed = await writer.buySkin(buy(1, 7), { skinPrice: read }).catch((e: unknown) => e);
    expect(changed).toBeInstanceOf(SkinPriceChangedError);
    expect(changed).toBeInstanceOf(WriteError);
    expect(changed).toMatchObject({ confirmed: 75, current: 80, message: "This skin's price changed: check the new price and buy again. Nothing was sent." });
    expect(read).toHaveBeenCalledWith(1, 7);
    const off = await writer.buySkin(buy(1, 8), { skinPrice: read }).catch((e: unknown) => e);
    expect(off).toMatchObject({ name: "SkinPriceChangedError", current: 0, message: "This skin is not for sale any more. Nothing was sent." });
    await expect(writer.buySkin(buy(1, 7), { skinPrice: () => Promise.reject(new Error("rpc down")) })).rejects.toThrow(/Cannot read the skin's price: rpc down/);
    await expect(writer.buySkin({ theme: 1, plan: 7, confirmedPrice: 0 }, PRICE)).rejects.toThrow(/No confirmed price/);
    expect(execute).not.toHaveBeenCalled();
    // The read waits for an earlier write of the account: it is inside the serialisation, so a second send is refused meanwhile.
    let release!: () => void;
    const gate = new Promise<number>((resolve) => (release = () => resolve(75)));
    const first = writer.buySkin(buy(1, 7), { skinPrice: () => gate });
    await expect(writer.setSkins([{ plan: 7, theme: 1 }])).rejects.toThrow(/Another write is pending/);
    release();
    await first;
    expect(sent(execute)).toEqual([[3n, "buy_skin", [1, 7]]]);
  });

  test("set_skins is one call: the batch's length, then each (plan, theme), in the order given", async () => {
    const { writer, execute } = writerWith();
    await writer.setSkins([{ plan: 7, theme: 1 }, { plan: 13, theme: 0 }, { plan: 19, theme: 255 }]);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(sent(execute)).toEqual([[3n, "set_skins", [3, 7, 1, 13, 0, 19, 255]]]);
  });

  test("nothing is sent for an empty batch, a plan twice, a plan or theme out of range, theme 0 bought, or without Setup", async () => {
    const { writer, execute } = writerWith();
    await expect(writer.setSkins([])).rejects.toThrow(/No skin changed/);
    await expect(writer.setSkins([{ plan: 7, theme: 1 }, { plan: 7, theme: 0 }])).rejects.toThrow(/named twice/);
    for (const change of [{ plan: 0, theme: 1 }, { plan: 20, theme: 1 }, { plan: 7, theme: 256 }, { plan: 7, theme: -1 }, { plan: 1.5, theme: 1 }]) {
      await expect(writer.setSkins([change])).rejects.toMatchObject({ name: "SkinRefusedError", reason: "invalid-skin" });
    }
    for (const [theme, plan] of [[0, 7], [256, 7], [1, 0], [1, 20]]) {
      await expect(writer.buySkin(buy(theme!, plan!), PRICE)).rejects.toMatchObject({ name: "SkinRefusedError", reason: "invalid-skin" });
    }
    const none = resolveDeployment({ network: "devnet", env: { rpcUrl: "http://x", addresses: { Challenge: "0x2" } } });
    const other = writerWith({ dep: none });
    await expect(other.writer.buySkin(buy(1, 7), PRICE)).rejects.toThrow(/No Setup/);
    await expect(other.writer.setSkins([{ plan: 7, theme: 1 }])).rejects.toThrow(/No Setup/);
    expect(execute).not.toHaveBeenCalled();
    expect(other.execute).not.toHaveBeenCalled();
  });

  const REVERTS: Array<[string, SkinRefusal]> = [
    ["Setup: skin owned", "owned"],
    ["Setup: skin not for sale", "not-for-sale"],
    ["Setup: not enough cobbles", "not-enough-cobbles"],
    ["Setup: skin not owned", "not-owned"],
    ["Setup: invalid skin", "invalid-skin"],
  ];

  test.each(REVERTS)("'%s' is a SkinRefusedError (%s), from the simulation, as text or as hex", async (reason, refusal) => {
    for (const message of [`Execution failed: ${reason}`, `Failure reason: ${shortString.encodeShortString(reason)}.`]) {
      for (const send of [(w: ReturnType<typeof writerWith>["writer"]) => w.buySkin(buy(1, 7), PRICE), (w: ReturnType<typeof writerWith>["writer"]) => w.setSkins([{ plan: 7, theme: 1 }])]) {
        const { writer } = writerWith({ execute: () => Promise.reject(new Error(message)) });
        const error = await send(writer).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(SkinRefusedError);
        expect(error).toMatchObject({ reason: refusal, transactionHash: undefined, reverted: false });
      }
    }
  });

  test("a reverted receipt is a SkinRefusedError with its hash", async () => {
    const { writer } = writerWith({ receipt: { execution_status: "REVERTED", revert_reason: "Setup: skin not owned" } });
    await expect(writer.setSkins([{ plan: 7, theme: 1 }])).rejects.toMatchObject({ name: "SkinRefusedError", reason: "not-owned", transactionHash: "0x1", reverted: true });
  });

  test("another revert stays a WriteError", async () => {
    const { writer } = writerWith({ execute: () => Promise.reject(new Error("insufficient fee")) });
    const error = await writer.buySkin(buy(1, 7), PRICE).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WriteError);
    expect(error).not.toBeInstanceOf(SkinRefusedError);
  });
});

describe("FakeGameViews' skins", () => {
  test("prices, owned words and the active set by player; unlisted reads are 0", async () => {
    const v = new FakeGameViews();
    v.priceSkins(1, Array.from({ length: SKIN_PLANS }, (_, i) => (i === 0 ? 100 : 50)));
    v.skinPlayer("0x05").owned.set(1, 1 << 7);
    v.skinPlayer(PLAYER).active[6] = 1;
    expect((await v.skinPrices(1)).slice(0, 2)).toEqual([100, 50]);
    expect(await v.skinPrice(2, 1)).toBe(0);
    expect(await v.ownedSkins(PLAYER, 1)).toBe(1 << 7);
    expect(await v.ownedSkins("0x6", 1)).toBe(0);
    expect((await v.activeSkins(PLAYER))[6]).toBe(1);
    expect(await v.activeSkins("0x6")).toEqual(new Array(SKIN_PLANS).fill(0));
    v.skinsFail = new Error("down");
    await expect(v.activeSkins(PLAYER)).rejects.toThrow("down");
  });
});
