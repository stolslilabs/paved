import { describe, expect, test } from "vitest";
import { hash } from "starknet";
import { ABIS, FAUCET_ABI, createCodecs } from "../src/abis";
import { AbiCodec, camelCase } from "../src/codec";
import { VIEW_FIELDS, toViewError } from "../src/views";

const codecs = createCodecs();

describe("view types follow the ABIs of contracts/abis", () => {
  for (const [struct, fields] of Object.entries(VIEW_FIELDS)) {
    test(`${struct} has the ABI's fields, in order`, () => {
      expect(codecs.Challenge.structFields(struct)).toEqual(fields);
    });
  }

  test("Challenge exposes the game views and the day views (IChallengeView); Setup none of them", () => {
    for (const fn of ["game", "tiles", "builder", "current_day", "entry_price", "spawn_paused", "guardian"]) {
      expect(codecs.Challenge.hasFunction(fn)).toBe(true);
      expect(codecs.Setup.hasFunction(fn)).toBe(false);
    }
  });

  test("Account left (D-25 (E)): no Account ABI, no player view, no registration", () => {
    expect(Object.keys(ABIS)).not.toContain("Account");
    for (const codec of Object.values(codecs)) {
      for (const fn of ["create", "player"]) expect(codec.hasFunction(fn), fn).toBe(false);
    }
  });

  test("the on-chain Tutorial left (D-21): no Tutorial or Lobby ABI, Setup holds the claim", () => {
    expect(Object.keys(ABIS).sort()).toEqual(["Challenge", "Setup"]);
    expect(codecs.Setup.hasFunction("claim_tutorial")).toBe(true);
    expect(codecs.Setup.encodeCall("claim_tutorial", [])).toEqual([]);
    // The claim's state is a view of Setup (step D): read before any write.
    expect(codecs.Setup.encodeCall("tutorial_claimed", ["0xabc"])).toEqual(["0xabc"]);
    expect(codecs.Setup.decodeResult("tutorial_claimed", ["0x1"])).toBe(true);
    // The quests and achievements moved from Challenge to Setup (D-24).
    for (const fn of ["define_quest", "define_achievement", "set_reporter", "report"]) {
      expect(codecs.Setup.hasFunction(fn), fn).toBe(true);
      expect(codecs.Challenge.hasFunction(fn), fn).toBe(false);
    }
    for (const codec of Object.values(codecs)) {
      expect(JSON.stringify(codec.abi)).not.toMatch(/systems::tutorial|systems::lobby|ILobbyClass|tutoriable/i);
    }
  });

  test("Setup emits the achievement progress of the claim: player and task as keys, count as data", () => {
    const selector = hash.getSelectorFromName("AchievementProgressed");
    expect(codecs.Setup.eventSelector("AchievementProgressed")).toBe(selector);
    const event = codecs.Setup.decodeEvent({ keys: [selector, "0xabc", "0xa"], data: ["0x1"], from_address: "0x5" });
    expect(event?.name).toBe("AchievementProgressed");
    expect(event?.fields).toEqual({ playerId: "0xabc", taskId: 10, count: 1 });
  });

  test("the prize left (D-20): no claim, sponsor or tournament view, no TournamentView, no prize event", () => {
    for (const codec of [codecs.Challenge, codecs.Setup]) {
      for (const fn of ["claim", "sponsor", "tournament", "current_tournament_id"]) expect(codec.hasFunction(fn), fn).toBe(false);
      expect(JSON.stringify(codec.abi)).not.toMatch(/TournamentView|ITournamentView|tournament_id|::Sponsored|::Claimed|::Reclaimed/);
    }
    expect(JSON.stringify(codecs.Challenge.abi)).toMatch(/paved::views::IChallengeView/);
  });

  test("the day id is day_id in GameSpawned, GameOver and GameView", () => {
    expect(codecs.Challenge.structFields("paved::views::GameView").at(-1)).toBe("dayId");
    for (const codec of [codecs.Challenge]) {
      const events = (codec.abi as Array<{ type: string; name: string; members?: Array<{ name: string }> }>).filter(
        (item) => item.type === "event" && /::(GameSpawned|GameOver)$/.test(item.name),
      );
      expect(events).toHaveLength(2);
      for (const event of events) expect(event.members!.map((m) => m.name)).toContain("day_id");
    }
  });

  test("characters left the game (D-18): no view, no role or spot type in the ABIs", () => {
    for (const codec of [codecs.Challenge, codecs.Setup]) {
      expect(codec.hasFunction("characters")).toBe(false);
      expect(JSON.stringify(codec.abi)).not.toMatch(/CharacterView|types::role|types::spot/);
    }
  });

  test("every ABI is a non-empty array", () => {
    for (const abi of Object.values(ABIS)) expect(abi.length).toBeGreaterThan(0);
  });
});

describe("AbiCodec", () => {
  test("encodes build: u32 and unit enums by variant index", () => {
    expect(codecs.Challenge.encodeCall("build", [7, 2, 0x7fffffff, 0x80000000])).toEqual([
      "0x7", "0x2", "0x7fffffff", "0x80000000",
    ]);
  });

  test("refuses an enum code the ABI does not have", () => {
    expect(() => codecs.Challenge.encodeCall("build", [1, 5, 0, 0])).toThrow(/Orientation has no variant 5/);
  });

  test("encodes a u256 as low, high", () => {
    const amount = (1n << 128n) + 5n;
    expect(new AbiCodec(FAUCET_ABI).encodeCall("approve", ["0xabc", amount])).toEqual(["0xabc", "0x5", "0x1"]);
  });

  test("checks the argument count", () => {
    expect(() => codecs.Challenge.encodeCall("discard", [])).toThrow(/takes 1 arguments/);
  });

  test("decodes an array of structs", () => {
    const felts = ["0x2", "0x1", "0x1", "0x4", "0x1", "0x7fffffff", "0x7fffffff", "0x2", "0x3", "0x9", "0x0", "0x0", "0x0"];
    expect(codecs.Challenge.decodeResult("tiles", felts)).toEqual([
      { id: 1, status: 1, plan: 4, orientation: 1, x: 0x7fffffff, y: 0x7fffffff },
      { id: 2, status: 3, plan: 9, orientation: 0, x: 0, y: 0 },
    ]);
  });

  test("decodes u256 and felts in a struct", () => {
    const price = codecs.Challenge.decodeResult("entry_price", ["0xabc", "0xde0b6b3a7640000", "0x0"]) as Record<string, unknown>;
    expect(price).toEqual({ token: "0xabc", amount: 10n ** 18n });
  });

  test("decodes bools and the day id of a game view", () => {
    const felts = ["0x5", "0xabc", "0x1", "0x9", "0x3", "0x1", "0x2", "0x1", "0x1", "0x0", "0x0", "0x0", "0x26", "0x100", "0x200", "0x4e20"];
    const g = codecs.Challenge.decodeResult("game", felts) as Record<string, unknown>;
    expect(g).toMatchObject({ id: 5, playerId: "0xabc", over: true, score: 3, endTime: 0x200, dayId: 0x4e20 });
  });

  test("fails loudly on a short result", () => {
    expect(() => codecs.Challenge.decodeResult("game", ["0x1"])).toThrow(/Not enough felts/);
  });

  test("decodes an event's keys and data by member kind", () => {
    const selector = hash.getSelectorFromName("GameOver");
    expect(codecs.Challenge.eventSelector("GameOver")).toBe(selector);
    const event = codecs.Challenge.decodeEvent({
      keys: [selector, "0x3", "0xabc", "0x4e20"],
      data: ["0x1", "0x2a", "0x100", "0x200"],
      from_address: "0x1",
    });
    expect(event).toEqual({
      name: "GameOver",
      fields: { gameId: 3, playerId: "0xabc", dayId: 0x4e20, mode: 1, score: 42, startTime: 0x100, endTime: 0x200 },
      fromAddress: "0x1",
      blockNumber: undefined,
      transactionHash: undefined,
    });
  });

  test("Built has six data fields (D-18); one from before the upgrade (role and spot, eight) still decodes to them", () => {
    const keys = [hash.getSelectorFromName("Built"), "0x3"];
    const fields = { gameId: 3, playerId: "0xabc", tileId: 2, plan: 7, orientation: 2, x: 0x80000000, y: 0x7fffffff };
    for (const codec of [codecs.Challenge]) {
      const six = codec.decodeEvent({ keys, data: ["0xabc", "0x2", "0x7", "0x2", "0x80000000", "0x7fffffff"] });
      expect(six?.fields).toEqual(fields);
      // The two trailing felts are role and spot of the old layout: left unread, nothing else shifts.
      const eight = codec.decodeEvent({ keys, data: ["0xabc", "0x2", "0x7", "0x2", "0x80000000", "0x7fffffff", "0x3", "0x5"] });
      expect(eight?.fields).toEqual(fields);
    }
  });

  test("ignores events it does not know", () => {
    expect(codecs.Challenge.decodeEvent({ keys: ["0x1234"], data: [] })).toBeNull();
    expect(codecs.Challenge.decodeEvent({ keys: [], data: [] })).toBeNull();
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
      ...ABIS.Challenge,
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
