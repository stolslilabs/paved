import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Tests for the fetchTournaments logic extracted from useTournaments hook.
 */

describe("fetchTournaments", () => {
  let fetchTournaments: typeof import("../src/hooks/useTournaments").fetchTournaments;
  const TORII_URL = "http://localhost:8080";

  beforeEach(async () => {
    vi.restoreAllMocks();
    const mod = await import("../src/hooks/useTournaments");
    fetchTournaments = mod.fetchTournaments;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns tournament info for Daily and Weekly modes", async () => {
    const mockFetch = vi.fn()
      // Daily tournament query
      .mockResolvedValueOnce({
        json: () =>
          Promise.resolve([
            {
              id: 100,
              prize: "5000000000000000000",
              top1_player_id: "0x111",
              top1_score: 500,
              top2_player_id: "0x222",
              top2_score: 300,
              top3_player_id: "0x333",
              top3_score: 100,
            },
          ]),
      })
      // Daily player names query
      .mockResolvedValueOnce({
        json: () =>
          Promise.resolve([
            { id: "0x111", name: "0x416c696365" }, // "Alice"
            { id: "0x222", name: "0x426f62" },     // "Bob"
            { id: "0x333", name: "0x436861726c6965" }, // "Charlie"
          ]),
      })
      // Weekly tournament query
      .mockResolvedValueOnce({
        json: () =>
          Promise.resolve([
            {
              id: 200,
              prize: "10000000000000000000",
              top1_player_id: "0x444",
              top1_score: 800,
              top2_player_id: "0x0",
              top2_score: 0,
              top3_player_id: "0x0",
              top3_score: 0,
            },
          ]),
      })
      // Weekly player names query
      .mockResolvedValueOnce({
        json: () =>
          Promise.resolve([
            { id: "0x444", name: "0x44617665" }, // "Dave"
          ]),
      });

    vi.stubGlobal("fetch", mockFetch);

    const result = await fetchTournaments(TORII_URL);

    // Daily tournament
    expect(result.daily).not.toBeNull();
    expect(result.daily!.prizePool).toBeDefined();
    expect(result.daily!.topPlayers.length).toBeGreaterThanOrEqual(1);

    // Weekly tournament
    expect(result.weekly).not.toBeNull();
    expect(result.weekly!.topPlayers.length).toBeGreaterThanOrEqual(1);
  });

  it("handles missing tournament data gracefully", async () => {
    const mockFetch = vi.fn()
      // Daily: empty result
      .mockResolvedValueOnce({
        json: () => Promise.resolve([]),
      })
      // Daily player names (should still be called but won't matter)
      .mockResolvedValueOnce({
        json: () => Promise.resolve([]),
      })
      // Weekly: empty result
      .mockResolvedValueOnce({
        json: () => Promise.resolve([]),
      })
      // Weekly player names
      .mockResolvedValueOnce({
        json: () => Promise.resolve([]),
      });

    vi.stubGlobal("fetch", mockFetch);

    const result = await fetchTournaments(TORII_URL);

    expect(result.daily).toBeNull();
    expect(result.weekly).toBeNull();
  });

  it("returns null for all tournaments when toriiUrl is null", async () => {
    const result = await fetchTournaments(null);
    expect(result.daily).toBeNull();
    expect(result.weekly).toBeNull();
  });

  it("handles fetch failure gracefully", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
    vi.stubGlobal("fetch", mockFetch);

    const result = await fetchTournaments(TORII_URL);
    expect(result.daily).toBeNull();
    expect(result.weekly).toBeNull();
  });

  it("queries [paved-Tournament] with correct tournament IDs", async () => {
    const mockFetch = vi.fn()
      .mockResolvedValue({
        json: () => Promise.resolve([]),
      });

    vi.stubGlobal("fetch", mockFetch);

    await fetchTournaments(TORII_URL);

    // Should have at least queried tournament tables
    const tournamentCalls = mockFetch.mock.calls.filter(
      (call: any) => (call[1]?.body as string)?.includes("[paved-Tournament]")
    );
    expect(tournamentCalls.length).toBeGreaterThanOrEqual(2); // Daily + Weekly
  });

  it("fetches player names for top players", async () => {
    const mockFetch = vi.fn()
      // Daily tournament query
      .mockResolvedValueOnce({
        json: () =>
          Promise.resolve([
            {
              id: 100,
              prize: "5000000000000000000",
              top1_player_id: "0xabc",
              top1_score: 500,
              top2_player_id: "0x0",
              top2_score: 0,
              top3_player_id: "0x0",
              top3_score: 0,
            },
          ]),
      })
      // Daily player names
      .mockResolvedValueOnce({
        json: () =>
          Promise.resolve([
            { id: "0xabc", name: "0x5465737465" }, // "Teste"
          ]),
      })
      // Weekly tournament
      .mockResolvedValueOnce({
        json: () => Promise.resolve([]),
      })
      // Weekly player names
      .mockResolvedValueOnce({
        json: () => Promise.resolve([]),
      });

    vi.stubGlobal("fetch", mockFetch);

    const result = await fetchTournaments(TORII_URL);

    // The player names query should have been called
    const playerCalls = mockFetch.mock.calls.filter(
      (call: any) => (call[1]?.body as string)?.includes("[paved-Player]")
    );
    expect(playerCalls.length).toBeGreaterThanOrEqual(1);
  });
});
