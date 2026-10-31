import { act, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { isOnline, ONLINE_WINDOW_S } from "@paved/game-core";
import { usePlayerSearch, usePublicProfile, type SocialSource } from "../src/data/social";
import { community, communityProfile, lastSeenOf, SEEN_SLOT_S, searchCommunity } from "../src/data/mock/community";
import { MockLedger } from "../src/data/mock/ledger";
import { mockSocial } from "../src/data/mock/overlay";
import { SEEDED_PLAYERS } from "../src/data/mock/players";
import { mockRivalsV2 } from "../src/data/mock/v2";
import { generatedLook } from "../src/mocks/avatar";
import { dataOf, fakeSources, memoryStore, renderData } from "./data-fakes";

// The social base (#952): the mock community, its last-seen times, the player search and the public profile, through the
// social source and its hooks.

/** 2026-10-31 12:00 UTC. */
const NOW = 1_793_448_000;

const ledgerAt = (now: number) => {
  const store = memoryStore();
  return new MockLedger({ store: () => store, seller: "0x3", latencyMs: 0, now: () => now });
};

describe("the mock community (#952)", () => {
  it("is the twenty seeded players and every rival village, each once, with the address the PvP knows them by", () => {
    const members = community();
    expect(members).toHaveLength(SEEDED_PLAYERS.length + mockRivalsV2().length);
    expect(members.slice(0, 20).map((m) => m.address)).toEqual(SEEDED_PLAYERS.map((p) => p.address));
    expect(members.slice(20).map((m) => m.address)).toEqual(mockRivalsV2().map((r) => r.address));
    expect(new Set(members.map((m) => BigInt(m.address))).size).toBe(members.length);
    expect(members.every((m) => BigInt(m.address) > 255n)).toBe(true);
  });

  it("gives each a name, the mock's avatar, a level, crowns, their league and a village score", () => {
    const rival = mockRivalsV2()[4]!;
    expect(communityProfile(rival.address, NOW)).toMatchObject({ address: rival.address, name: rival.name, look: generatedLook(rival.address), level: rival.level, crowns: rival.crowns, score: rival.score });
    const seeded = SEEDED_PLAYERS[0]!;
    const profile = communityProfile(seeded.address, NOW)!;
    expect(profile).toMatchObject({ name: seeded.name, level: seeded.level, crowns: seeded.crowns, league: 0 });
    expect(profile.score).toBeGreaterThan(0);
    expect(communityProfile(SEEDED_PLAYERS[19]!.address, NOW)!.league).toBeGreaterThan(0);
  });

  it("reads an ID in any form, and answers null for one no member has", () => {
    const seeded = SEEDED_PLAYERS[3]!;
    expect(communityProfile(`0x000${seeded.address.slice(2).toUpperCase()}`, NOW)?.name).toBe(seeded.name);
    expect(communityProfile("0x1234", NOW)).toBeNull();
    expect(communityProfile("not an id", NOW)).toBeNull();
  });

  it("draws the same last-seen times on two devices at the same time, never after now", () => {
    // Two devices: two ledgers on their own stores, one clock.
    const a = community().map((m) => communityProfile(m.address, NOW)!);
    const b = community().map((m) => ledgerAt(NOW).publicProfile(m.address));
    return Promise.all(b).then((other) => {
      expect(other).toEqual(a);
      expect(a.every((p) => p.lastSeen <= NOW && p.lastSeen > NOW - 3 * 86_400)).toBe(true);
    });
  });

  it("moves the times with the clock: a player online stays seen now, one away keeps their last visit's end", () => {
    const later = NOW + 600;
    for (const m of community()) {
      const before = lastSeenOf(m.address, NOW);
      const after = lastSeenOf(m.address, later);
      expect(after).toBeGreaterThanOrEqual(before);
      expect(after).toBeLessThanOrEqual(later);
    }
  });

  it("shows some players online and some away at any time of the day", () => {
    for (let hour = 0; hour < 24; hour += 6) {
      const now = NOW + hour * 3_600;
      const online = community().filter((m) => isOnline(lastSeenOf(m.address, now), now)).length;
      expect(online).toBeGreaterThan(0);
      expect(online).toBeLessThan(community().length);
    }
    expect(ONLINE_WINDOW_S).toBeLessThan(SEEN_SLOT_S);
  });
});

describe("the player search on the mock (#952)", () => {
  it("finds a seeded player and a rival by name, from the start of a word, whatever the case", () => {
    const seeded = SEEDED_PLAYERS[1]!; // BreezyThatcher66
    expect(searchCommunity("thatch", NOW).map((p) => p.address)).toContain(seeded.address);
    expect(searchCommunity("BREEZY", NOW).map((p) => p.address)).toContain(seeded.address);
    const rival = mockRivalsV2().find((r) => r.name === "Old Tom Cobble")!;
    expect(searchCommunity("tom", NOW).map((p) => p.address)).toContain(rival.address);
    expect(searchCommunity("om cob", NOW)).toEqual([]);
  });

  it("finds a seeded player and a rival by player ID", () => {
    const seeded = SEEDED_PLAYERS[7]!;
    const rival = mockRivalsV2()[9]!;
    expect(searchCommunity(seeded.address, NOW).map((p) => p.name)).toEqual([seeded.name]);
    expect(searchCommunity(rival.address.toUpperCase().replace("0X", "0x"), NOW).map((p) => p.name)).toEqual([rival.name]);
    expect(searchCommunity("0xdead", NOW)).toEqual([]);
  });
});

describe("the social hooks (#952)", () => {
  const social = (ledger = ledgerAt(NOW)) => mockSocial(ledger);

  it("usePublicProfile reads a player's profile from the social source", async () => {
    const seeded = SEEDED_PLAYERS[5]!;
    const { result } = renderData(() => usePublicProfile(seeded.address), fakeSources({ social: social() }).sources);
    expect(result.current.isPending).toBe(true);
    expect((await dataOf(result))?.name).toBe(seeded.name);
    expect(result.current.unavailable).toBe(false);
  });

  it("answers null for an unknown ID, and for what is not an ID, without a read", async () => {
    const source: SocialSource = { profile: vi.fn(async () => null), searchPlayers: vi.fn(async () => []) };
    const unknown = renderData(() => usePublicProfile("0x1234"), fakeSources({ social: source }).sources);
    expect(await dataOf(unknown.result)).toBeNull();
    const typed = renderData(() => usePublicProfile("wren"), fakeSources({ social: source }).sources);
    expect(typed.result.current).toMatchObject({ data: null, isPending: false, error: null });
    expect(source.profile).toHaveBeenCalledTimes(1);
  });

  it("stops pending when the read fails", async () => {
    const source: SocialSource = { profile: async () => Promise.reject(new Error("down")), searchPlayers: async () => [] };
    const { result } = renderData(() => usePublicProfile("0x7e3a0001"), fakeSources({ social: source }).sources);
    await waitFor(() => expect(result.current.error?.message).toBe("down"));
    expect(result.current.isPending).toBe(false);
  });

  it("answers unavailable without a social source (the chain today)", () => {
    const { result } = renderData(() => [usePublicProfile("0x7e3a0001"), usePlayerSearch("wren", null, { delayMs: 0 })] as const, fakeSources().sources);
    expect(result.current.map((r) => [r.unavailable, r.isPending, r.data])).toEqual([
      [true, false, undefined],
      [true, false, undefined],
    ]);
  });

  it("usePlayerSearch reads once the typing settles, and leaves the connected player out", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const source: SocialSource = { profile: async () => null, searchPlayers: vi.fn((q: string) => social().searchPlayers(q)) };
      const me = SEEDED_PLAYERS[1]!.address;
      let query = "";
      const { result, rerender } = renderData(() => usePlayerSearch(query, me), fakeSources({ social: source }).sources);
      expect(result.current.data).toEqual([]);
      for (const typed of ["b", "br", "bre"]) {
        query = typed;
        rerender();
      }
      expect(source.searchPlayers).not.toHaveBeenCalled();
      await act(async () => void vi.advanceTimersByTime(250));
      await waitFor(() => expect(result.current.data).toBeDefined());
      expect(source.searchPlayers).toHaveBeenCalledTimes(1);
      expect(source.searchPlayers).toHaveBeenCalledWith("bre");
      // BreezyThatcher66 is the connected player: not among the results; the source did answer them.
      await expect(source.searchPlayers("bre")).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ address: me })]));
      expect(result.current.data!.some((p) => p.address === me)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("shares one entry for a query typed with other spaces or case", async () => {
    const source: SocialSource = { profile: async () => null, searchPlayers: vi.fn(async () => []) };
    const sources = fakeSources({ social: source }).sources;
    const { result, client } = renderData(() => [usePlayerSearch("  Wren ", null, { delayMs: 0 }), usePlayerSearch("wren", null, { delayMs: 0 })] as const, sources);
    await waitFor(() => expect(result.current.every((r) => r.data !== undefined && !r.isPending)).toBe(true));
    expect(source.searchPlayers).toHaveBeenCalledTimes(1);
    expect(client.getQueryCache().findAll({ queryKey: ["social", "search"] })).toHaveLength(1);
  });
});
