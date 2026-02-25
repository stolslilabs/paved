import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Tests for the fetchPlayerGames logic extracted from usePlayerGames hook.
 * We test the pure async function since @testing-library/react is not available.
 */

// We'll import once the implementation exists
// import { fetchPlayerGames } from "../src/hooks/usePlayerGames";

describe("fetchPlayerGames", () => {
  let fetchPlayerGames: typeof import("../src/hooks/usePlayerGames").fetchPlayerGames;
  const TORII_URL = "http://localhost:8080";
  const ACCOUNT = "0x1234";

  beforeEach(async () => {
    vi.restoreAllMocks();
    const mod = await import("../src/hooks/usePlayerGames");
    fetchPlayerGames = mod.fetchPlayerGames;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches builder rows for padded player address", async () => {
    const mockFetch = vi.fn()
      // First call: builder query
      .mockResolvedValueOnce({
        json: () => Promise.resolve([{ game_id: 10 }, { game_id: 20 }]),
      })
      // Second call: game query for game_id 10
      .mockResolvedValueOnce({
        json: () =>
          Promise.resolve([
            {
              id: 10,
              mode: "1",
              score: 100,
              built: 5,
              tile_count: 38,
              over: 0,
              start_time: 1000,
            },
          ]),
      })
      // Third call: game query for game_id 20
      .mockResolvedValueOnce({
        json: () =>
          Promise.resolve([
            {
              id: 20,
              mode: "2",
              score: 200,
              built: 10,
              tile_count: 72,
              over: 1,
              start_time: 2000,
            },
          ]),
      });

    vi.stubGlobal("fetch", mockFetch);

    const result = await fetchPlayerGames(TORII_URL, ACCOUNT);

    // Should call builder query with padded address
    const firstCallBody = mockFetch.mock.calls[0][1]?.body as string;
    expect(firstCallBody).toContain("[paved-Builder]");
    // Address should be padded to 66 chars
    expect(firstCallBody).toContain(
      "0x" + "1234".padStart(64, "0")
    );
  });

  it("fetches game rows for each builder game_id", async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        json: () => Promise.resolve([{ game_id: 10 }, { game_id: 20 }]),
      })
      .mockResolvedValueOnce({
        json: () =>
          Promise.resolve([
            {
              id: 10,
              mode: "1",
              score: 100,
              built: 5,
              tile_count: 38,
              over: 0,
              start_time: 1000,
            },
          ]),
      })
      .mockResolvedValueOnce({
        json: () =>
          Promise.resolve([
            {
              id: 20,
              mode: "2",
              score: 200,
              built: 10,
              tile_count: 72,
              over: 1,
              start_time: 2000,
            },
          ]),
      });

    vi.stubGlobal("fetch", mockFetch);

    await fetchPlayerGames(TORII_URL, ACCOUNT);

    // Should have 3 fetch calls: 1 for builders + 2 for games
    expect(mockFetch).toHaveBeenCalledTimes(3);

    // Second and third calls should query [paved-Game]
    const secondCallBody = mockFetch.mock.calls[1][1]?.body as string;
    expect(secondCallBody).toContain("[paved-Game]");
    expect(secondCallBody).toContain("10");

    const thirdCallBody = mockFetch.mock.calls[2][1]?.body as string;
    expect(thirdCallBody).toContain("[paved-Game]");
    expect(thirdCallBody).toContain("20");
  });

  it("splits results into activeGames and completedGames via splitGames", async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        json: () => Promise.resolve([{ game_id: 10 }, { game_id: 20 }]),
      })
      .mockResolvedValueOnce({
        json: () =>
          Promise.resolve([
            {
              id: 10,
              mode: "1",
              score: 100,
              built: 5,
              tile_count: 38,
              over: 0,
              start_time: 1000,
            },
          ]),
      })
      .mockResolvedValueOnce({
        json: () =>
          Promise.resolve([
            {
              id: 20,
              mode: "2",
              score: 200,
              built: 10,
              tile_count: 72,
              over: 1,
              start_time: 2000,
            },
          ]),
      });

    vi.stubGlobal("fetch", mockFetch);

    const result = await fetchPlayerGames(TORII_URL, ACCOUNT);

    // Game 10 is not over → active
    expect(result.activeGames).toHaveLength(1);
    expect(result.activeGames[0].gameId).toBe(10);
    expect(result.activeGames[0].isOver).toBe(false);

    // Game 20 is over → completed
    expect(result.completedGames).toHaveLength(1);
    expect(result.completedGames[0].gameId).toBe(20);
    expect(result.completedGames[0].isOver).toBe(true);
  });

  it("returns empty arrays when toriiUrl is null", async () => {
    const result = await fetchPlayerGames(null, ACCOUNT);
    expect(result.activeGames).toEqual([]);
    expect(result.completedGames).toEqual([]);
  });

  it("returns empty arrays when accountAddress is null", async () => {
    const result = await fetchPlayerGames(TORII_URL, null);
    expect(result.activeGames).toEqual([]);
    expect(result.completedGames).toEqual([]);
  });

  it("handles fetch failure gracefully", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
    vi.stubGlobal("fetch", mockFetch);

    const result = await fetchPlayerGames(TORII_URL, ACCOUNT);
    expect(result.activeGames).toEqual([]);
    expect(result.completedGames).toEqual([]);
  });

  it("handles empty builder rows", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      json: () => Promise.resolve([]),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await fetchPlayerGames(TORII_URL, ACCOUNT);
    expect(result.activeGames).toEqual([]);
    expect(result.completedGames).toEqual([]);
    // Only one call for builders, no game calls
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("parses game rows correctly via parseGameRow", async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        json: () => Promise.resolve([{ game_id: 42 }]),
      })
      .mockResolvedValueOnce({
        json: () =>
          Promise.resolve([
            {
              id: 42,
              mode: "1",
              score: 350,
              built: 15,
              tile_count: 38,
              over: 0,
              start_time: 9999,
            },
          ]),
      });

    vi.stubGlobal("fetch", mockFetch);

    const result = await fetchPlayerGames(TORII_URL, ACCOUNT);

    expect(result.activeGames[0]).toEqual({
      gameId: 42,
      mode: "daily",
      score: 350,
      tilesPlaced: 15,
      totalTiles: 38,
      isOver: false,
      startTime: 9999,
    });
  });
});
