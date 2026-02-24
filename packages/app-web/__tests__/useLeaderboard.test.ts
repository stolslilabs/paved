import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Tests for the fetchLeaderboard logic extracted from useLeaderboard hook.
 */

describe("fetchLeaderboard", () => {
  let fetchLeaderboard: typeof import("../src/hooks/useLeaderboard").fetchLeaderboard;
  const TORII_URL = "http://localhost:8080";

  beforeEach(async () => {
    vi.restoreAllMocks();
    const mod = await import("../src/hooks/useLeaderboard");
    fetchLeaderboard = mod.fetchLeaderboard;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches top 10 players ordered by score", async () => {
    const mockRows = [
      { name: "0x416c696365", score: 1000 }, // "Alice"
      { name: "0x426f62", score: 900 },       // "Bob"
      { name: "0x436861726c6965", score: 800 }, // "Charlie"
    ];

    const mockFetch = vi.fn().mockResolvedValueOnce({
      json: () => Promise.resolve(mockRows),
    });

    vi.stubGlobal("fetch", mockFetch);

    const result = await fetchLeaderboard(TORII_URL);

    // Should query with ORDER BY score DESC LIMIT 10
    const callBody = mockFetch.mock.calls[0][1]?.body as string;
    expect(callBody).toContain("ORDER BY");
    expect(callBody).toContain("score");
    expect(callBody).toContain("LIMIT 10");

    expect(result).toHaveLength(3);
  });

  it("returns ranked entries with names decoded", async () => {
    const mockRows = [
      { name: "0x416c696365", score: 1000 }, // "Alice"
      { name: "0x426f62", score: 900 },       // "Bob"
    ];

    const mockFetch = vi.fn().mockResolvedValueOnce({
      json: () => Promise.resolve(mockRows),
    });

    vi.stubGlobal("fetch", mockFetch);

    const result = await fetchLeaderboard(TORII_URL);

    // Rank 1 should have highest score
    expect(result[0].rank).toBe(1);
    expect(result[0].name).toBe("Alice");
    expect(result[0].score).toBe(1000);

    // Rank 2
    expect(result[1].rank).toBe(2);
    expect(result[1].name).toBe("Bob");
    expect(result[1].score).toBe(900);
  });

  it("handles empty leaderboard", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      json: () => Promise.resolve([]),
    });

    vi.stubGlobal("fetch", mockFetch);

    const result = await fetchLeaderboard(TORII_URL);
    expect(result).toEqual([]);
  });

  it("returns empty array when toriiUrl is null", async () => {
    const result = await fetchLeaderboard(null);
    expect(result).toEqual([]);
  });

  it("handles fetch failure gracefully", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
    vi.stubGlobal("fetch", mockFetch);

    const result = await fetchLeaderboard(TORII_URL);
    expect(result).toEqual([]);
  });

  it("queries [paved-Player] table", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      json: () => Promise.resolve([]),
    });

    vi.stubGlobal("fetch", mockFetch);

    await fetchLeaderboard(TORII_URL);

    const callBody = mockFetch.mock.calls[0][1]?.body as string;
    expect(callBody).toContain("[paved-Player]");
  });

  it("assigns sequential ranks starting from 1", async () => {
    const mockRows = [
      { name: "0x41", score: 500 }, // "A"
      { name: "0x42", score: 400 }, // "B"
      { name: "0x43", score: 300 }, // "C"
      { name: "0x44", score: 200 }, // "D"
      { name: "0x45", score: 100 }, // "E"
    ];

    const mockFetch = vi.fn().mockResolvedValueOnce({
      json: () => Promise.resolve(mockRows),
    });

    vi.stubGlobal("fetch", mockFetch);

    const result = await fetchLeaderboard(TORII_URL);

    result.forEach((entry, index) => {
      expect(entry.rank).toBe(index + 1);
    });
  });
});
