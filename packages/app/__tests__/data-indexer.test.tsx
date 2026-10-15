import { describe, expect, it } from "vitest";
import { IndexerClient } from "@paved/chain";
import { FIXTURE_ADA, FIXTURE_TOURNAMENT, type FixtureIndexer } from "@paved/chain/testing";
import {
  useDefinitions,
  useIndexedGame,
  useIndexedPlayerGames,
  useLeaderboard,
  useLeaderboardEntry,
  usePlayerAchievements,
  usePlayerProfile,
  usePlayerQuests,
  usePlayerStatus,
  useTopThree,
} from "../src/data";
import { dataOf, fakeSources, renderData } from "./data-fakes";

/** An address the fixture indexer has never seen. */
const NEWCOMER = "0x07a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f";

describe("the indexer's hooks, on the fixture indexer", () => {
  it("useTopThree answers the day's first three rows", async () => {
    const f = fakeSources();
    const { result } = renderData(() => useTopThree(FIXTURE_TOURNAMENT), f.sources);
    const board = await dataOf(result);
    expect(board.entries.map((e) => e.rank)).toEqual([1, 2, 3]);
    expect(board.total).toBe(41);
    expect(f.fixture.requests).toHaveLength(1);
    expect(f.fixture.requests[0]).toMatch(new RegExp(`^/v1/tournaments/${FIXTURE_TOURNAMENT}/leaderboard\\?.*limit=3`));
  });

  it("useLeaderboard answers a page of a day", async () => {
    const f = fakeSources();
    const { result } = renderData(() => useLeaderboard(FIXTURE_TOURNAMENT, 20, 20), f.sources);
    const board = await dataOf(result);
    expect(board.entries[0]?.rank).toBe(21);
    expect(board.nextOffset).toBe(40);
  });

  it("useLeaderboardEntry answers the viewer's row; null when they have none", async () => {
    const f = fakeSources();
    const ada = renderData(() => useLeaderboardEntry(FIXTURE_TOURNAMENT, FIXTURE_ADA), f.sources);
    expect((await dataOf(ada.result))?.rank).toBe(1);
    const none = renderData(() => useLeaderboardEntry(FIXTURE_TOURNAMENT, NEWCOMER), f.sources);
    expect(await dataOf(none.result)).toBeNull();
  });

  it("usePlayerProfile answers the profile; player null for an unknown id", async () => {
    const f = fakeSources();
    const ada = renderData(() => usePlayerProfile(FIXTURE_ADA), f.sources);
    expect((await dataOf(ada.result)).player?.playerId).toBe(FIXTURE_ADA);
    const unknown = renderData(() => usePlayerProfile(NEWCOMER), f.sources);
    expect(await dataOf(unknown.result)).toEqual({ player: null, stats: null });
  });

  it("useIndexedPlayerGames answers the player's games, newest first", async () => {
    const f = fakeSources();
    const { result } = renderData(() => useIndexedPlayerGames(FIXTURE_ADA), f.sources);
    expect((await dataOf(result)).map((g) => g.gameId)).toEqual([912, 55]);
  });

  it("useIndexedGame answers one game", async () => {
    const f = fakeSources();
    const { result } = renderData(() => useIndexedGame(912), f.sources);
    expect(await dataOf(result)).toMatchObject({ contract: "challenge", gameId: 912, score: 187, over: true });
  });

  it("useDefinitions answers the definitions", async () => {
    const f = fakeSources();
    const { result } = renderData(() => useDefinitions(), f.sources);
    const definitions = await dataOf(result);
    expect(definitions.quests.map((q) => q.questId)).toEqual([1, 2, 3, 4]);
    expect(definitions.achievements).toHaveLength(9);
  });

  it("usePlayerQuests joins the day's progress with each definition's schedule, and drops a quest with none", async () => {
    const f = fakeSources();
    f.fixture.quests = f.fixture.quests.map((q) => (q.quest_id === 4 ? { ...q, start_time: 345_600, interval: 604_800, duration: 604_800 } : q));
    const { result } = renderData(() => usePlayerQuests(FIXTURE_ADA, FIXTURE_TOURNAMENT), f.sources);
    const quests = await dataOf(result);
    expect(quests.day).toBe(FIXTURE_TOURNAMENT);
    expect(quests.quests.find((q) => q.questId === 1)).toMatchObject({ completed: true, start: 0, interval: 86_400, duration: 86_400 });
    expect(quests.quests.find((q) => q.questId === 4)).toMatchObject({ start: 345_600, interval: 604_800, duration: 604_800 });

    // A progress row whose definition is not served cannot be placed in a window: left out.
    const g = fakeSources();
    const fetch = withDefinitions(g.fixture, g.fixture.quests.filter((q) => q.quest_id !== 2));
    const indexer = new IndexerClient({ url: "http://indexer.test/", fetch: fetch as typeof globalThis.fetch });
    const partial = renderData(() => usePlayerQuests(FIXTURE_ADA, FIXTURE_TOURNAMENT), { ...g.sources, indexer });
    expect((await dataOf(partial.result)).quests.map((q) => q.questId)).toEqual([1, 3, 4]);
  });

  it("usePlayerAchievements answers the player's achievements", async () => {
    const f = fakeSources();
    const { result } = renderData(() => usePlayerAchievements(FIXTURE_ADA), f.sources);
    const achievements = await dataOf(result);
    expect(achievements.playerId).toBe(FIXTURE_ADA);
    expect(achievements.achievements.find((a) => a.achievementId === 2)?.completed).toBe(true);
  });

  it("usePlayerStatus joins profile, today's row and balances; a new player gets an empty profile; a guest null", async () => {
    const f = fakeSources();
    f.economy.setBalance("usdc", FIXTURE_ADA, 48_500_000n);
    const ada = renderData(() => usePlayerStatus(FIXTURE_ADA, FIXTURE_TOURNAMENT), f.sources);
    const status = await dataOf(ada.result);
    expect(status?.player.playerId).toBe(FIXTURE_ADA);
    expect(status?.today?.rank).toBe(1);
    expect(status?.usdc).toBe(48_500_000n);
    expect(status?.paved).toBe(0n);

    const fresh = renderData(() => usePlayerStatus(NEWCOMER, FIXTURE_TOURNAMENT), f.sources);
    expect(await dataOf(fresh.result)).toEqual({
      player: { playerId: NEWCOMER, name: null, created: null },
      stats: { challengeGames: 0, challengeFinished: 0, bestScore: 0, paidGames: 0, settledGames: 0, rewards: "0" },
      today: null,
      usdc: 0n,
      paved: 0n,
    });

    const guest = renderData(() => usePlayerStatus(null, FIXTURE_TOURNAMENT), f.sources);
    expect(guest.result.current.data).toBeNull();
  });
});

/** The fixture's `fetch`, with `/v1/definitions` answering only `quests` (the progress routes still use them all). */
function withDefinitions(fixture: FixtureIndexer, quests: FixtureIndexer["quests"]): FixtureIndexer["fetch"] {
  return async (input) => {
    const answer = await fixture.fetch(input);
    if (!new URL(String(input)).pathname.endsWith("/v1/definitions")) return answer;
    const body = (await answer.json()) as Record<string, unknown>;
    return new Response(JSON.stringify({ ...body, quests }), { status: 200 });
  };
}
