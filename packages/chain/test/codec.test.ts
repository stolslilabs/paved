import { describe, expect, test } from "vitest";
import { hash } from "starknet";
import { ABIS, createCodecs } from "../src/abis";
import { AbiCodec, camelCase } from "../src/codec";
import { VIEW_FIELDS, toViewError } from "../src/views";

const codecs = createCodecs();

describe("view types follow the ABIs of contracts/abis", () => {
  for (const [struct, fields] of Object.entries(VIEW_FIELDS)) {
    test(`${struct} has the ABI's fields, in order`, () => {
      expect(codecs.Daily.structFields(struct)).toEqual(fields);
    });
  }

  test("Daily and Tutorial expose the game views; only Daily the tournament views", () => {
    for (const fn of ["game", "tiles", "builder", "characters"]) {
      expect(codecs.Daily.hasFunction(fn)).toBe(true);
      expect(codecs.Tutorial.hasFunction(fn)).toBe(true);
    }
    expect(codecs.Daily.hasFunction("tournament")).toBe(true);
    expect(codecs.Daily.hasFunction("current_tournament_id")).toBe(true);
    expect(codecs.Tutorial.hasFunction("tournament")).toBe(false);
  });

  test("every ABI is a non-empty array", () => {
    for (const abi of Object.values(ABIS)) expect(abi.length).toBeGreaterThan(0);
  });
});

describe("AbiCodec", () => {
  test("encodes build: u32 and unit enums by variant index", () => {
    expect(codecs.Daily.encodeCall("build", [7, 2, 0x7fffffff, 0x80000000, 3, 9])).toEqual([
      "0x7", "0x2", "0x7fffffff", "0x80000000", "0x3", "0x9",
    ]);
  });

  test("refuses an enum code the ABI does not have", () => {
    expect(() => codecs.Daily.encodeCall("build", [1, 5, 0, 0, 0, 0])).toThrow(/Orientation has no variant 5/);
  });

  test("encodes a u256 as low, high", () => {
    const amount = (1n << 128n) + 5n;
    expect(codecs.Token.encodeCall("approve", ["0xabc", amount])).toEqual(["0xabc", "0x5", "0x1"]);
  });

  test("checks the argument count", () => {
    expect(() => codecs.Daily.encodeCall("discard", [])).toThrow(/takes 1 arguments/);
  });

  test("decodes an array of structs", () => {
    const felts = ["0x2", "0x1", "0x1", "0x4", "0x1", "0x7fffffff", "0x7fffffff", "0x2", "0x3", "0x9", "0x0", "0x0", "0x0"];
    expect(codecs.Daily.decodeResult("tiles", felts)).toEqual([
      { id: 1, status: 1, plan: 4, orientation: 1, x: 0x7fffffff, y: 0x7fffffff },
      { id: 2, status: 3, plan: 9, orientation: 0, x: 0, y: 0 },
    ]);
  });

  test("decodes u256, bool and felts in a struct", () => {
    const felts = [
      "0x5", "0x69780", "0x6ae00", "0x1", "0xde0b6b3a7640000", "0x0",
      "0xabc", "0x3", "0x0", "0x0", "0x0", "0x0", "0x0", "0x0", "0x0",
    ];
    const t = codecs.Daily.decodeResult("tournament", felts) as Record<string, unknown>;
    expect(t).toMatchObject({ id: 5, over: true, prize: 10n ** 18n, top1PlayerId: "0xabc", top1Score: 3, top1Claimed: false });
  });

  test("fails loudly on a short result", () => {
    expect(() => codecs.Daily.decodeResult("game", ["0x1"])).toThrow(/Not enough felts/);
  });

  test("decodes an event's keys and data by member kind", () => {
    const selector = hash.getSelectorFromName("GameOver");
    expect(codecs.Daily.eventSelector("GameOver")).toBe(selector);
    const event = codecs.Daily.decodeEvent({
      keys: [selector, "0x3", "0xabc", "0x4e20"],
      data: ["0x1", "0x2a", "0x100", "0x200"],
      from_address: "0x1",
    });
    expect(event).toEqual({
      name: "GameOver",
      fields: { gameId: 3, playerId: "0xabc", tournamentId: 0x4e20, mode: 1, score: 42, startTime: 0x100, endTime: 0x200 },
      fromAddress: "0x1",
      blockNumber: undefined,
      transactionHash: undefined,
    });
  });

  test("ignores events it does not know", () => {
    expect(codecs.Daily.decodeEvent({ keys: ["0x1234"], data: [] })).toBeNull();
    expect(codecs.Daily.decodeEvent({ keys: [], data: [] })).toBeNull();
  });

  test("camelCase", () => {
    expect(camelCase("top1_player_id")).toBe("top1PlayerId");
  });
});

describe("toViewError", () => {
  test("maps the two view reverts, as text or as the hex of their short string", () => {
    expect(toViewError(new Error("execution error: 'Game: does not exist'")).kind).toBe("game-not-found");
    // 'View: not the game player' as a felt, the way a node may quote it.
    expect(toViewError(new Error("revert 0x566965773a206e6f74207468652067616d6520706c61796572")).kind).toBe("not-player");
    expect(toViewError(new Error("fetch failed")).kind).toBe("rpc");
  });
});

describe("tolerance to ABI growth (CORE's hardening adds entries and events)", () => {
  test("unknown entries, functions and events neither break the codec nor the decoding of known ones", () => {
    const grown = new AbiCodec([
      ...ABIS.Daily,
      { type: "l1_handler", name: "on_message", inputs: [{ name: "x", type: "core::some::Unknown" }] },
      { type: "function", name: "new_view", inputs: [{ name: "x", type: "paved::new::Type" }], outputs: [{ type: "paved::new::Type" }] },
      { type: "event", name: "paved::new::Paused", kind: "struct", members: [{ name: "by", type: "paved::new::Type", kind: "data" }] },
      { type: "event", name: "paved::new::Event", kind: "enum", variants: [{ name: "Paused", type: "paved::new::Paused", kind: "nested" }] },
    ]);
    expect(grown.encodeCall("discard", [3])).toEqual(["0x3"]);
    const paused = grown.decodeEvent({ keys: [hash.getSelectorFromName("Paused")], data: ["0x1"] });
    // An event with a field type the codec does not know is skipped (null), not thrown.
    expect(paused).toBeNull();
    const selector = hash.getSelectorFromName("Discarded");
    expect(grown.decodeEvent({ keys: [selector, "0x3"], data: ["0xabc", "0x4", "0x2", "0x0"] })?.fields).toMatchObject({ gameId: 3, tileId: 4 });
  });
});

describe("signed integers (i8 to i128): a negative value -v is the felt P - v", () => {
  const P = (1n << 251n) + 17n * (1n << 192n) + 1n;
  const hex = (v: bigint) => `0x${v.toString(16)}`;
  const fn = (name: string, type: string) => ({
    type: "function", name, inputs: [{ name: "v", type }], outputs: [{ type }], state_mutability: "view",
  });
  const codec = new AbiCodec([
    fn("a", "core::integer::i8"), fn("b", "core::integer::i16"), fn("c", "core::integer::i64"), fn("d", "core::integer::i128"),
    {
      type: "struct", name: "S", members: [{ name: "sigma_bps", type: "core::integer::i16" }, { name: "n", type: "core::integer::u8" }],
    },
    { type: "function", name: "s", inputs: [], outputs: [{ type: "S" }], state_mutability: "view" },
  ]);

  test("decodes i16 on both sides of zero, at its bounds", () => {
    const cases: Array<[bigint, number]> = [[0n, 0], [500n, 500], [32_767n, 32_767], [P - 500n, -500], [P - 1n, -1], [P - 32_768n, -32_768]];
    for (const [felt, value] of cases) expect(codec.decodeResult("b", [hex(felt)])).toBe(value);
  });

  test("refuses a felt outside the type, rather than wrapping or reading it as a huge number", () => {
    expect(() => codec.decodeResult("b", [hex(32_768n)])).toThrow(/not an i16/);
    expect(() => codec.decodeResult("b", [hex(P - 32_769n)])).toThrow(/not an i16/);
    expect(() => codec.decodeResult("a", [hex(128n)])).toThrow(/not an i8/);
    expect(codec.decodeResult("a", [hex(P - 128n)])).toBe(-128);
  });

  test("wide ones: i64 stays a number while safe, i128 is a bigint past 2^53", () => {
    expect(codec.decodeResult("c", [hex(P - 5n)])).toBe(-5);
    expect(codec.decodeResult("d", [hex(P - (1n << 100n))])).toBe(-(1n << 100n));
    expect(codec.decodeResult("d", [hex((1n << 127n) - 1n)])).toBe((1n << 127n) - 1n);
    expect(() => codec.decodeResult("d", [hex(1n << 127n)])).toThrow(/not an i128/);
  });

  test("encodes negative values as P - v, and refuses out-of-range ones", () => {
    expect(codec.encodeCall("b", [-500])).toEqual([hex(P - 500n)]);
    expect(codec.encodeCall("b", [500])).toEqual(["0x1f4"]);
    expect(codec.encodeCall("b", [-32_768])).toEqual([hex(P - 32_768n)]);
    expect(() => codec.encodeCall("b", [32_768])).toThrow(RangeError);
    expect(() => codec.encodeCall("b", [-32_769])).toThrow(RangeError);
    expect(codec.encodeCall("d", [-(1n << 127n)])).toEqual([hex(P - (1n << 127n))]);
  });

  test("round trips, and decodes inside a struct", () => {
    for (const v of [-32_768, -1, 0, 1, 32_767]) expect(codec.decodeResult("b", codec.encodeCall("b", [v]))).toBe(v);
    expect(codec.decodeResult("s", [hex(P - 7n), "0x3"])).toEqual({ sigmaBps: -7, n: 3 });
  });
});
