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
