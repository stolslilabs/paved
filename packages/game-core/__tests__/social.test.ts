import { describe, expect, it } from "vitest";
import { ONLINE_WINDOW_S, SEARCH_LIMIT, isOnline, nameMatches, parsePlayerId, searchPlayers, wordStarts } from "../src";

describe("the player search's words (#952)", () => {
  it("starts a word at the name's start, after a sign, at a capital after a small letter, and at digits", () => {
    expect(wordStarts("ChillyNewt46")).toEqual([0, 6, 10]);
    expect(wordStarts("Old Tom Cobble")).toEqual([0, 4, 8]);
    expect(wordStarts("millstone_mara")).toEqual([0, 10]);
    expect(wordStarts("kestrel.eth")).toEqual([0, 8]);
    expect(wordStarts("  Vael")).toEqual([2]);
    expect(wordStarts("")).toEqual([]);
  });

  it("matches from the start of a word, whatever the case", () => {
    expect(nameMatches("ChillyNewt46", "chilly")).toBe(true);
    expect(nameMatches("ChillyNewt46", "NEWT")).toBe(true);
    expect(nameMatches("ChillyNewt46", "46")).toBe(true);
    expect(nameMatches("ChillyNewt46", "ewt")).toBe(false);
    expect(nameMatches("ChillyNewt46", "6")).toBe(false);
    expect(nameMatches("Old Tom Cobble", " tom   c ")).toBe(true);
    expect(nameMatches("millstone_mara", "mara")).toBe(true);
    expect(nameMatches("kestrel.eth", "eth")).toBe(true);
  });

  it("matches nothing on an empty query", () => {
    expect(nameMatches("Wren", "")).toBe(false);
    expect(nameMatches("Wren", "   ")).toBe(false);
  });
});

describe("the player ID (#952)", () => {
  it("reads 0x and hex digits as one form, whatever the case and the leading zeros", () => {
    expect(parsePlayerId("0x7E3A0001")).toBe("0x7e3a0001");
    expect(parsePlayerId("  0x0007e3a0001 ")).toBe("0x7e3a0001");
    expect(parsePlayerId("0x0")).toBe("0x0");
  });

  it("refuses what is not an ID", () => {
    expect(parsePlayerId("7e3a0001")).toBeNull();
    expect(parsePlayerId("0x")).toBeNull();
    expect(parsePlayerId("0xzz")).toBeNull();
    expect(parsePlayerId("Wren")).toBeNull();
    expect(parsePlayerId(`0x${"f".repeat(65)}`)).toBeNull();
    expect(parsePlayerId(`0x${"f".repeat(64)}`)).not.toBeNull();
  });
});

describe("searchPlayers (#952)", () => {
  const players = [
    { address: "0x7e3a0001", name: "ChillyNewt46" },
    { address: "0x7e3a0002", name: "BreezyThatcher66" },
    { address: "0x7e2a0005", name: "Old Tom Cobble" },
    { address: "0x7e2a0007", name: "Cobblewright" },
    { address: "0x7e2a0009", name: null },
  ];

  it("finds a player by ID, in any form, and only that one", () => {
    expect(searchPlayers(players, "0x07E2A0005")).toEqual([players[2]]);
    expect(searchPlayers(players, "0x7e2a0009")).toEqual([players[4]]);
    expect(searchPlayers(players, "0x1234")).toEqual([]);
  });

  it("finds by name, those starting with the query first", () => {
    expect(searchPlayers(players, "cobble").map((p) => p.name)).toEqual(["Cobblewright", "Old Tom Cobble"]);
    expect(searchPlayers(players, "thatcher")).toEqual([players[1]]);
    expect(searchPlayers(players, "")).toEqual([]);
  });

  it("answers at most the limit", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ address: `0x${(i + 1).toString(16)}`, name: `Wren${i}` }));
    expect(searchPlayers(many, "wren")).toHaveLength(SEARCH_LIMIT);
    expect(searchPlayers(many, "wren", 3).map((p) => p.name)).toEqual(["Wren0", "Wren1", "Wren2"]);
  });
});

describe("who shows as online (#952, open point 4)", () => {
  it("is a player seen less than 5 minutes ago", () => {
    expect(ONLINE_WINDOW_S).toBe(300);
    expect(isOnline(1_000, 1_000)).toBe(true);
    expect(isOnline(1_000, 1_299)).toBe(true);
    expect(isOnline(1_000, 1_300)).toBe(false);
  });
});
