import { describe, expect, it } from "vitest";
import { ONLINE_WINDOW_S, PLAYER_RANKING_LIMIT, SEARCH_LIMIT, isOnline, nameMatches, parsePlayerId, playerPlace, rankAmongFriends, rankPlayers, searchPlayers, wordStarts } from "../src";

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

describe("the players' ranking (LEADERBOARD-PAGE)", () => {
  const p = (address: string, crowns: number, level: number) => ({ address, crowns, level });

  it("ranks by crowns, then by level, then by ID, whatever the ID's form", () => {
    const players = [p("0x3", 100, 2), p("0x05", 300, 1), p("0x2", 100, 2), p("0x4", 100, 7), p("0x1", 0, 9)];
    expect(rankPlayers(players).map((x) => x.address)).toEqual(["0x05", "0x4", "0x2", "0x3", "0x1"]);
    expect(rankPlayers([p("0x10", 5, 1), p("0x0f", 5, 1)]).map((x) => x.address)).toEqual(["0x0f", "0x10"]);
  });

  it("keeps the first PLAYER_RANKING_LIMIT, and leaves the list given as it was", () => {
    const players = Array.from({ length: PLAYER_RANKING_LIMIT + 5 }, (_, i) => p(`0x${(i + 1).toString(16)}`, i, 1));
    const ranked = rankPlayers(players);
    expect(ranked).toHaveLength(PLAYER_RANKING_LIMIT);
    expect(ranked[0]!.crowns).toBe(PLAYER_RANKING_LIMIT + 4);
    expect(players[0]!.crowns).toBe(0);
    expect(rankPlayers(players, 2)).toHaveLength(2);
  });

  it("says a player's place past the limit too, or null for a player not in it", () => {
    const players = Array.from({ length: PLAYER_RANKING_LIMIT + 5 }, (_, i) => p(`0x${(i + 1).toString(16)}`, i, 1));
    expect(playerPlace(players, "0x1")).toBe(PLAYER_RANKING_LIMIT + 5);
    expect(playerPlace(players, "0x0069")).toBe(1);
    expect(playerPlace(players, "0xabc")).toBeNull();
  });

  it("ranks a player among their friends by the same order, all of them, the player once, and says their place", () => {
    const friends = Array.from({ length: PLAYER_RANKING_LIMIT + 2 }, (_, i) => p(`0x${(i + 1).toString(16)}`, i * 10, 1));
    const me = p("0x0abc", 15, 4);
    const ranked = rankAmongFriends([...friends, p("0xabc", 15, 4)], me);
    // Past the players' limit (the list is the player's own), the player counted once whatever their ID's form.
    expect(ranked.players).toHaveLength(PLAYER_RANKING_LIMIT + 3);
    expect(ranked.players.map((x) => x.address)).toEqual(rankPlayers([...friends, me], Infinity).map((x) => x.address));
    expect(ranked.me).toEqual({ place: PLAYER_RANKING_LIMIT + 1, profile: me });
    // No friend: nothing to rank against; no player: the friends alone.
    expect(rankAmongFriends([], me)).toEqual({ players: [], me: null });
    expect(rankAmongFriends(friends.slice(0, 2), null)).toEqual({ players: [friends[1], friends[0]], me: null });
  });
});
