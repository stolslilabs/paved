import { slow } from "../test-slow";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FIXTURE_ADA, FIXTURE_HEAD } from "@paved/chain/testing";
import { App } from "../src/App";
import type { GameSigner } from "../src/data";
import { MOCK_KEY } from "../src/data/mock/ledger";
import { SEEDED_FROM_DAY, SEEDED_GAME_IDS, SEEDED_PLAYERS, seededDay, seededRandom } from "../src/data/mock/players";
import { mockRivals } from "../src/data/mock/pvp";
import { mockRivalsV2 } from "../src/data/mock/v2";
import { PLAYER_NAME, playerName } from "../src/lib/player-names";
import { queryClient } from "../src/lib/query-client";
import { generatedLook } from "../src/mocks/avatar";
import { ACHIEVEMENTS_NEW, QUEST_DEFINITIONS } from "../src/mocks/quests";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { buyGame, mockImplementation, playGame, surrenderedGame } from "./mock-fakes";
import { preloadPages } from "./route-helpers";
import { fakeWallet } from "./wallet-fakes";

// The mock's indexer (#927, PR 5 of 6): every route of the indexer answered from the device's ledger, no request made. The
// leaderboard ranks the device's games among the twenty seeded players' (open point 2), the players' pages and the game-over
// pages read the ledger's games, the quests and achievements count each game over's report. The fixture's indexer stays
// under the sources only to show that nothing reaches it.

const PLAYER = FIXTURE_ADA;
const TODAY = Math.floor(FIXTURE_HEAD.timestamp / 86_400);
const DAY = 86_400;
const WAIT = { timeout: slow(8000) };

/** The mock on a clock of `clock.now` (seconds), today at 09:00 UTC by default; the fixture's indexer counts its requests. */
function clocked(now = TODAY * DAY + 9 * 3_600) {
  const clock = { now };
  const s = mockImplementation(undefined, undefined, () => clock.now);
  return { clock, ...s, indexer: s.sources.indexer };
}

describe("the seeded players (#927, open point 2)", () => {
  it("are twenty, named by #926's generator on their seed, apart from every rival and NPC, each with a face, a level and a league", async () => {
    expect(SEEDED_PLAYERS).toHaveLength(20);
    const { ledger } = clocked();
    const taken = new Set([...mockRivals(), ...mockRivalsV2()].map((r) => BigInt(r.address)));
    for (const p of SEEDED_PLAYERS) {
      expect(p.name).toBe(playerName(seededRandom(BigInt(p.index))));
      expect(p.name).toMatch(PLAYER_NAME);
      expect(BigInt(p.address) > 255n && !taken.has(BigInt(p.address))).toBe(true);
      expect(await ledger.name(p.address)).toBe(p.name);
      expect(await ledger.avatar(p.address)).toBe(generatedLook(p.address));
      expect((await ledger.playerLevel(p.address)).level).toBe(p.level);
      expect((await ledger.pvpLeague(p.address)).crowns).toBe(p.crowns);
      const village = await ledger.freeVillage(p.address);
      expect(village).toMatchObject({ founded: true, level: p.level });
      expect(village.tiles.length).toBeGreaterThan(0);
    }
    expect(new Set(SEEDED_PLAYERS.map((p) => p.name)).size).toBe(20);
    expect(new Set(SEEDED_PLAYERS.map((p) => p.address)).size).toBe(20);
  });

  it("play the same days at every load, none before their first, and today only the games over by now", () => {
    const [first] = SEEDED_PLAYERS;
    expect(seededDay(first!, SEEDED_FROM_DAY - 1, TODAY * DAY)).toEqual([]);
    const played = SEEDED_PLAYERS.flatMap((p) => seededDay(p, TODAY - 1, TODAY * DAY));
    // About six in ten play a day, one to three games each.
    expect(played.length).toBeGreaterThan(10);
    expect(played).toEqual(SEEDED_PLAYERS.flatMap((p) => seededDay(p, TODAY - 1, TODAY * DAY + 5)));
    for (const g of played) {
      expect(Math.floor(g.startTime / DAY)).toBe(TODAY - 1);
      expect(Math.floor(g.endTime / DAY)).toBe(TODAY - 1);
      expect(g.gameId).toBeGreaterThan(SEEDED_GAME_IDS);
    }
    const noon = TODAY * DAY + 12 * 3_600;
    for (const p of SEEDED_PLAYERS) for (const g of seededDay(p, TODAY, noon)) expect(g.endTime).toBeLessThanOrEqual(noon);
  });
});

describe("the mock's indexer (#927)", () => {
  it("ranks the device's game of the day among the seeded players', with its name; a free game is marked; no request is made", async () => {
    const { ledger, indexer, chain, clock, store } = clocked();
    await ledger.writesFor(PLAYER).setName("SwiftCarter04");
    const { gameId, score } = await playGame(ledger, PLAYER);
    clock.now = TODAY * DAY + 23 * 3_600 + 3_000;
    const board = (await indexer.leaderboard(TODAY)).data;
    const seeded = SEEDED_PLAYERS.filter((p) => seededDay(p, TODAY, clock.now).length > 0);
    expect(board.total).toBe(seeded.length + 1);
    expect(board.entries.map((e) => e.rank)).toEqual(board.entries.map((_, i) => i + 1));
    expect(board.entries.map((e) => e.bestScore)).toEqual([...board.entries.map((e) => e.bestScore)].sort((a, b) => b - a));
    const mine = board.entries.find((e) => e.bestGameId === gameId)!;
    expect(mine).toMatchObject({ playerId: `0x${BigInt(PLAYER).toString(16).padStart(64, "0")}`, bestScore: score, gamesPlayed: 1, gamesFinished: 1, free: false, name: "SwiftCarter04" });
    expect((await indexer.playerTournament(PLAYER, TODAY)).data).toEqual(mine);
    expect((await indexer.playerTournament(PLAYER, TODAY - 1)).data).toBeNull();
    for (const e of board.entries.filter((e) => e !== mine)) expect(SEEDED_PLAYERS.some((p) => p.name === e.name)).toBe(true);
    // Paged by offset.
    const page = (await indexer.leaderboard(TODAY, { limit: 5, offset: 5 })).data;
    expect(page.entries).toEqual(board.entries.slice(5, 10));
    expect(page.nextOffset).toBe(board.total > 10 ? 10 : null);
    // A free game ranks too, marked: another account's, made free (stake 0) as `spawn_free` leaves it.
    const free = await surrenderedGame(ledger, "0x5f2");
    const state = JSON.parse(store.data.get(MOCK_KEY)!);
    state.challenge.games[free].stake = 0;
    store.data.set(MOCK_KEY, JSON.stringify(state));
    const row = (await indexer.playerTournament("0x5f2", TODAY)).data;
    expect(row).toMatchObject({ bestGameId: free, bestScore: 0, free: true, name: null });
    expect((await indexer.leaderboard(TODAY)).data.total).toBe(board.total + 1);
    expect(chain.fixture.requests).toEqual([]);
  });

  it("lists the days newest first, each with its players, games and best; a day's detail carries the device's economy", async () => {
    const { ledger, indexer } = clocked();
    const { gameId } = await buyGame(ledger, PLAYER);
    const days = (await indexer.tournaments({ limit: 3 })).data;
    expect(days.tournaments.map((t) => t.id)).toEqual([TODAY, TODAY - 1, TODAY - 2]);
    expect(days.next).toBe(TODAY - 2);
    const older = (await indexer.tournaments({ limit: 2, before: days.next! })).data;
    expect(older.tournaments.map((t) => t.id)).toEqual([TODAY - 3, TODAY - 4]);
    const yesterday = days.tournaments[1]!;
    const rows = SEEDED_PLAYERS.map((p) => seededDay(p, TODAY - 1, TODAY * DAY)).filter((g) => g.length > 0);
    expect(yesterday).toMatchObject({ players: rows.length, gamesSpawned: rows.flat().length, bestScore: Math.max(...rows.flat().map((g) => g.score)) });
    // Today: the game bought counts as spawned, not finished, and its day holds it unsettled until it is recorded.
    const detail = (await indexer.tournament(TODAY)).data;
    expect(detail.economy).toMatchObject({ gamesPurchased: 1, gamesRecorded: 0, gamesSettled: 0, unsettled: [], closed: false });
    const seededToday = SEEDED_PLAYERS.flatMap((p) => seededDay(p, TODAY, TODAY * DAY + 9 * 3_600));
    expect(detail).toMatchObject({ gamesSpawned: seededToday.length + 1, gamesFinished: seededToday.length });
    await ledger.writesFor(PLAYER).surrender({ mode: "challenge", gameId });
    expect((await indexer.tournament(TODAY)).data.economy).toMatchObject({ gamesRecorded: 1, unsettled: [gameId] });
    // The last page ends at the seeded players' first day.
    const last = (await indexer.tournaments({ limit: 100, before: SEEDED_FROM_DAY + 2 })).data;
    expect(last).toEqual({ tournaments: [expect.objectContaining({ id: SEEDED_FROM_DAY + 1 }), expect.objectContaining({ id: SEEDED_FROM_DAY })], next: null });
  });

  it("answers a player's profile and games from the ledger: the device's, a seeded player's, and none for an address never seen", async () => {
    const { ledger, indexer, clock } = clocked();
    expect((await indexer.player(PLAYER)).data).toEqual({ player: null, stats: null });
    const first = await playGame(ledger, PLAYER);
    clock.now += 600;
    const second = await surrenderedGame(ledger, PLAYER);
    clock.now += 600;
    const open = (await buyGame(ledger, PLAYER)).gameId;
    const profile = (await indexer.player(PLAYER)).data;
    expect(profile.player).toMatchObject({ name: null, created: TODAY * DAY + 9 * 3_600 });
    expect(profile.stats).toEqual({ challengeGames: 3, challengeFinished: 2, bestScore: first.score, paidGames: 3, settledGames: 0, rewards: "0" });
    // Newest first, paged by `before`.
    const games = (await indexer.playerGames(PLAYER, { limit: 2 })).data;
    expect(games.games.map((g) => g.gameId)).toEqual([open, second]);
    expect(games.games[0]).toMatchObject({ over: false, score: 0, endTime: 0, countedDayId: 0, free: false, economy: expect.objectContaining({ stake: 1, recorded: false, settled: false, threshold: null }) });
    expect(games.next).toBe(String(second));
    const rest = (await indexer.playerGames(PLAYER, { limit: 2, before: games.next! })).data;
    expect(rest).toMatchObject({ games: [expect.objectContaining({ gameId: first.gameId, over: true, score: first.score, countedDayId: TODAY })], next: null });
    expect((await indexer.game("challenge", first.gameId)).data).toEqual(rest.games[0]);
    await expect(indexer.game("challenge", 999)).rejects.toMatchObject({ kind: "not-found" });

    // A seeded player: its days since its first, its games' rows readable one by one.
    const seeded = SEEDED_PLAYERS[19]!;
    const theirs = (await indexer.player(seeded.address)).data;
    expect(theirs.player).toMatchObject({ name: seeded.name, created: SEEDED_FROM_DAY * DAY });
    const rows = (await indexer.playerGames(seeded.address, { limit: 100 })).data.games;
    expect(theirs.stats).toMatchObject({ challengeGames: rows.length, bestScore: Math.max(...rows.map((g) => g.score)) });
    expect((await indexer.game("challenge", rows[0]!.gameId)).data).toEqual(rows[0]);
    // A PvP rival plays no Challenge: its name alone.
    expect((await indexer.player(mockRivalsV2()[0]!.address)).data).toMatchObject({ player: { name: mockRivalsV2()[0]!.name }, stats: null });
  });

  it("gives a settled game the threshold its day closed on, and counts its reward in the player's stats", async () => {
    const { ledger, indexer, clock } = clocked();
    const { gameId } = await playGame(ledger, PLAYER, 2);
    clock.now = (TODAY + 2) * DAY + 3_600;
    await ledger.writesFor(PLAYER).settle([gameId]);
    const row = (await indexer.game("challenge", gameId)).data;
    const terms = await ledger.terms(gameId);
    expect(row.economy).toMatchObject({ stake: 2, recorded: true, settled: true, reward: terms.reward.toString() });
    expect(row.economy!.threshold).toBeGreaterThan(0);
    expect((await indexer.player(PLAYER)).data.stats).toMatchObject({ settledGames: 1, rewards: terms.reward.toString() });
  });

  it("counts the achievements from every game over, free ones too, and the podium of a closed day the player ranked in", async () => {
    const { ledger, indexer, clock } = clocked();
    const before = (await indexer.playerAchievements(PLAYER)).data;
    expect(before.points).toBe(0);
    expect(before.achievements).toHaveLength(16);
    const { score } = await playGame(ledger, PLAYER);
    const rank = (await indexer.playerTournament(PLAYER, TODAY)).data!.rank;
    let done = (await indexer.playerAchievements(PLAYER)).data;
    const of = (id: number) => done.achievements.find((a) => a.achievementId === id)!;
    expect(of(2)).toMatchObject({ completed: true, tasks: [{ count: 1 }] });
    expect(of(8).completed).toBe(score >= 4_000);
    // The podium waits for the day to close.
    expect(of(9).completed).toBe(false);
    clock.now = (TODAY + 1) * DAY + 60;
    done = (await indexer.playerAchievements(PLAYER)).data;
    expect(of(9)).toMatchObject({ completed: rank <= 3, completedAt: rank <= 3 ? (TODAY + 1) * DAY : null });
    expect(done.points).toBe(done.achievements.filter((a) => a.completed).reduce((sum, a) => sum + a.points, 0));
  });

  it("defines the quests the stories' fixtures show (`mocks/quests.ts`), the fifth daily included", async () => {
    const { indexer } = clocked();
    const defined = (await indexer.definitions()).data.quests.map((d) => ({ questId: d.questId, taskId: d.tasks[0]!.taskId, total: d.tasks[0]!.total, start: d.startTime, interval: d.interval, duration: d.duration }));
    expect(defined).toEqual(QUEST_DEFINITIONS.map((d) => ({ ...d })));
    const achievements = (await indexer.definitions()).data.achievements.map((a) => [a.achievementId, a.points, a.tasks]);
    expect(achievements).toEqual(ACHIEVEMENTS_NEW.achievements.map((a) => [a.achievementId, a.points, a.tasks.map(({ taskId, total }) => ({ taskId, total }))]));
  });

  it("answers the head on the ledger's clock, never behind", async () => {
    const { indexer, clock } = clocked();
    const head = await indexer.head();
    expect(head).toMatchObject({ head: { timestamp: clock.now }, behind: 0, freshness: { kind: "ok", blocks: 0 } });
  });
});

preloadPages("home");
beforeAll(async () => {
  await Promise.all([import("../src/routes/pages/village"), import("../src/routes/village-visit-board")]);
}, slow(60_000));
beforeEach(() => {
  queryClient.clear();
  resetWelcomedForTests();
  markWelcomed();
});
afterEach(() => {
  queryClient.clear();
  resetWelcomedForTests();
});

describe("a seeded player's page on the mock (#927)", () => {
  it("/village/:player of a seeded player: its name and village, read-only", async () => {
    const s = mockImplementation();
    const me = s.sources.signer!.address;
    const wallet = fakeWallet({ address: me, restored: true });
    wallet.connector.signer = () => s.sources.signer as GameSigner;
    const seeded = SEEDED_PLAYERS[4]!;
    render(<App router={createTestRouter(`/village/${seeded.address}`)} sources={s.sources} connector={wallet.load} />);
    expect(await screen.findByText(`${seeded.name}'s village`, undefined, WAIT)).toBeInTheDocument();
    expect(await screen.findByText(/Read-only/, undefined, WAIT)).toBeInTheDocument();
    expect(s.chain.fixture.requests).toEqual([]);
  }, slow(30_000));
});
