import { slow } from "../test-slow";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { settlesAfter, type GameKey } from "@paved/chain";
import { CENTER, INITIAL_MEAN, OrientationType, replayVrfChallenge, rewardOf, thresholdOfMean } from "@paved/game-core";
import { App } from "../src/App";
import { MOCK_KEY, MockLedger } from "../src/data/mock/ledger";
import { mockConnector } from "../src/data/mock/overlay";
import { replayGame } from "../src/data/over";
import { queryClient } from "../src/lib/query-client";
import { createTestRouter } from "../src/routes/router";
import { markWelcomed, resetWelcomedForTests } from "../src/routes/welcomed";
import { memoryStore } from "./data-fakes";
import { buyGame, mockImplementation } from "./mock-fakes";
import { discardTile, preloadPages } from "./route-helpers";
import { fakeWallet } from "./wallet-fakes";

// The games on the mock (#927, PR 4 of 6): a Challenge game's purchase, spawn, moves, end and settlement on the device, by
// game-core's rules, with a random kept with each game in place of the VRF's (open point 3). Nothing is read from or sent to
// the chain.

const ORIENTATIONS = Object.values(OrientationType);
const PLAYER = "0x5f1";
const USDC = 1_000_000n;
const DAY = 86_400;
const WAIT = { timeout: slow(8000) };

/** A ledger on `store` whose clock is `clock.now` (seconds). */
function ledgerAt(clock: { now: number }, store = memoryStore()) {
  return new MockLedger({ store: () => store, seller: "0x3", latencyMs: 0, now: () => clock.now });
}

/** The first legal move of the tile in hand, from the game's reads as the board opens it (`replayVrfChallenge`), else a discard. */
async function nextMove(ledger: MockLedger, key: GameKey) {
  const [game, tiles, draw] = await Promise.all([ledger.game(key), ledger.tiles(key), ledger.draw(key)]);
  const engine = replayVrfChallenge(BigInt(await ledger.initialSeed(key)), tiles, game, draw);
  const [first] = engine.legalPlacements(engine.hand!.plan);
  return first ? { orientation: ORIENTATIONS.indexOf(first.orientation), x: CENTER + first.x, y: CENTER + first.y } : null;
}

/** Plays the game of `key` to the deck's end through the ledger's writes; the receipts' events, in order. */
async function playOut(ledger: MockLedger, key: GameKey) {
  const writes = ledger.writesFor(PLAYER);
  const names: string[] = [];
  while (!(await ledger.game(key)).over) {
    const move = await nextMove(ledger, key);
    const result = move ? await writes.build(key, move) : await writes.discard(key);
    names.push(...result.events.map((e) => e.name));
  }
  return names;
}

describe("a Challenge game on the mock (#927)", () => {
  it("from its purchase to its settlement: paid in USDC, played by the rules, recorded, settled after its day, the reward minted", async () => {
    const start = 20_000 * DAY + 3_600;
    const clock = { now: start };
    const store = memoryStore();
    const ledger = ledgerAt(clock, store);
    const writes = ledger.writesFor(PLAYER);

    // The purchase: 2 USDC a stake, from the faucet's 100.
    const quote = await ledger.quote(3);
    expect(quote).toMatchObject({ price: 6n * USDC, mean: INITIAL_MEAN, threshold: INITIAL_MEAN, slope: 12_220, cap: 5 });
    const bought = await writes.purchase({ stake: 3, confirmedPrice: 6n * USDC, confirmedMinOut: 1n, referrer: null });
    expect(bought.transactionHash).toMatch(/^0x6d6f636b/);
    expect(bought.events.map((e) => e.name)).toEqual(["GameSpawned", "Purchased"]);
    expect(bought.events[0]!.fields).toMatchObject({ gameId: bought.gameId, playerId: PLAYER, mode: 1, startTime: start, price: 6n * USDC });
    expect(await ledger.usdcBalance(PLAYER)).toBe(94n * USDC);
    const key: GameKey = { mode: "challenge", gameId: bought.gameId };

    // The spawn: a game of the VRF's queue, its terms frozen, its day given its prior.
    const game = await ledger.game(key);
    expect(game).toMatchObject({ id: bought.gameId, playerId: PLAYER, mode: 1, score: 0, over: false, startTime: start, endTime: 0, dayId: 20_000, expiresAt: start + DAY });
    expect((await ledger.draw(key)).vrf).toBe(true);
    const terms = await ledger.terms(bought.gameId);
    expect(terms).toMatchObject({ player: PLAYER, time: start, day: 20_000, stake: 3, sigmaBps: 0, slopeBps: 12_220, cap: 5, recorded: false, settled: false });
    expect(terms.reference).toBeGreaterThan(0n);
    expect(await ledger.day(20_000)).toEqual({ prior: INITIAL_MEAN, sum: 0n, weight: 0, mean: 0, closed: false });
    expect(await ledger.playerGames(PLAYER)).toEqual([{ mode: "challenge", gameId: bought.gameId, startTime: start, dayId: 20_000, over: false, score: null, countedDayId: null }]);

    // The moves to the deck's end, then the end: recorded before its 24 h.
    clock.now = start + 600;
    const events = await playOut(ledger, key);
    expect(events.filter((n) => n === "GameOver")).toHaveLength(1);
    expect(events.at(-1)).toBe("Recorded");
    const over = await ledger.game(key);
    expect(over).toMatchObject({ over: true, endTime: start + 600, tileId: 0 });
    expect(over.tileCount).toBe(over.deckSize);
    // The over page's replay of its tiles gives the same score.
    expect(replayGame(BigInt(await ledger.initialSeed(key)), await ledger.tiles(key), over).stats).toBeTruthy();
    expect(await ledger.terms(bought.gameId)).toMatchObject({ recorded: true, expired: false, score: over.score });
    await expect(writes.discard(key)).rejects.toThrow("Game: is over");

    // The settlement: refused until the end of the next day, then the reward of the curve against the day's mean.
    await expect(writes.settle([bought.gameId])).rejects.toMatchObject({ name: "SettleTooEarlyError" });
    clock.now = settlesAfter(20_000);
    const settled = await writes.settle([bought.gameId]);
    const mean = Math.floor((100 * INITIAL_MEAN + 3 * Math.min(over.score * 1_000, 4 * INITIAL_MEAN)) / 103);
    const threshold = thresholdOfMean(mean, 0);
    const reward = rewardOf(terms.reference, over.score, threshold, 12_220, 5);
    expect(settled.events).toEqual([expect.objectContaining({ name: "Settled", fields: { gameId: bought.gameId, playerId: PLAYER, day: 20_000, score: over.score, threshold, reward } })]);
    expect(settled.noReward).toEqual([]);
    expect(await ledger.pavedBalance(PLAYER)).toBe(reward);
    expect(await ledger.terms(bought.gameId)).toMatchObject({ settled: true, reward });
    expect(await ledger.day(20_000)).toMatchObject({ closed: true, mean });
    await expect(writes.settle([bought.gameId])).rejects.toThrow(/already settled/);

    // A reload reads the same game, its tiles and its settlement.
    const reloaded = ledgerAt(clock, store);
    expect(await reloaded.game(key)).toEqual(over);
    expect(await reloaded.tiles(key)).toEqual(await ledger.tiles(key));
    expect(await reloaded.terms(bought.gameId)).toMatchObject({ settled: true, reward });
  });

  it("mints PAVED above the threshold: a day whose prior is low pays the curve, capped at R x H", async () => {
    const clock = { now: 20_000 * DAY + 60 };
    const store = memoryStore();
    const ledger = ledgerAt(clock, store);
    const { gameId } = await buyGame(ledger, PLAYER, 10);
    const key: GameKey = { mode: "challenge", gameId };
    await playOut(ledger, key);
    // The day's prior at 100 points (the stored state edited): the game's score beats it.
    const state = JSON.parse(store.data.get(MOCK_KEY)!);
    state.challenge.days["20000"].prior = 100_000;
    store.data.set(MOCK_KEY, JSON.stringify(state));
    clock.now = settlesAfter(20_000);
    const { score } = await ledger.game(key);
    const { reference } = await ledger.terms(gameId);
    const settled = await ledger.writesFor(PLAYER).settle([gameId]);
    const reward = settled.events[0]!.fields.reward as bigint;
    expect(reward).toBeGreaterThan(0n);
    expect(reward).toBe(rewardOf(reference, score, Number(settled.events[0]!.fields.threshold), 12_220, 5));
    expect(await ledger.pavedBalance(PLAYER)).toBe(reward);
    // The day closed into the EMA: the next day's quote is priced against it.
    clock.now = settlesAfter(20_000) + 60;
    expect((await ledger.quote(1)).mean).not.toBe(INITIAL_MEAN);
  });

  it("replays the same after a reload: the seed is kept with the game, every draw comes from it", async () => {
    const clock = { now: 20_000 * DAY };
    const store = memoryStore();
    const ledger = ledgerAt(clock, store);
    const { gameId } = await buyGame(ledger, PLAYER);
    const key: GameKey = { mode: "challenge", gameId };
    for (let i = 0; i < 6; i++) {
      const move = await nextMove(ledger, key);
      await (move ? ledger.writesFor(PLAYER).build(key, move) : ledger.writesFor(PLAYER).discard(key));
    }
    const reloaded = ledgerAt(clock, store);
    expect(await reloaded.game(key)).toEqual(await ledger.game(key));
    expect(await reloaded.draw(key)).toEqual(await ledger.draw(key));
    // A second game is another draw.
    const second = await buyGame(ledger, PLAYER);
    expect(await ledger.initialSeed({ mode: "challenge", gameId: second.gameId })).not.toBe(await ledger.initialSeed(key));
  });

  it("refuses what the contracts refuse, and nothing moves", async () => {
    const clock = { now: 20_000 * DAY };
    const ledger = ledgerAt(clock);
    const writes = ledger.writesFor(PLAYER);
    // The purchase: a price or a min_out the player did not confirm, a stake out of range, USDC short.
    await expect(writes.purchase({ stake: 1, confirmedPrice: 1n, confirmedMinOut: 1n, referrer: null })).rejects.toMatchObject({ name: "PurchasePriceChangedError" });
    await expect(writes.purchase({ stake: 1, confirmedPrice: 2n * USDC, confirmedMinOut: 10n ** 30n, referrer: null })).rejects.toMatchObject({ name: "PoolPriceMovedError" });
    await expect(writes.purchase({ stake: 11, confirmedPrice: 22n * USDC, confirmedMinOut: 1n, referrer: null })).rejects.toThrow(/stake is 1 to 10/);
    for (let i = 0; i < 10; i++) await buyGame(ledger, PLAYER, 5);
    expect(await ledger.usdcBalance(PLAYER)).toBe(0n);
    await expect(buyGame(ledger, PLAYER)).rejects.toThrow(/get test USDC first/);
    expect(await ledger.playerGames(PLAYER)).toHaveLength(10);

    // The moves: another player's game, an illegal placement, past the 24 h (but the surrender).
    const key: GameKey = { mode: "challenge", gameId: 1 };
    await expect(ledger.writesFor("0x999").discard(key)).rejects.toThrow("Game: not the game player");
    await expect(writes.build(key, { orientation: 1, x: CENTER + 9, y: CENTER + 9 })).rejects.toThrow();
    expect((await ledger.game(key)).placedCount).toBe(1);
    clock.now = 20_001 * DAY;
    await expect(writes.discard(key)).rejects.toMatchObject({ name: "GameExpiredError" });
    // Unrecorded past its 24 h: not settled, said so; a surrender records it expired, settled for no reward.
    clock.now = settlesAfter(20_000);
    await expect(writes.settle([1])).rejects.toMatchObject({ name: "SettleNotRecordedError", expired: true });
    await writes.surrender(key);
    expect(await ledger.terms(1)).toMatchObject({ recorded: true, expired: true });
    const settled = await writes.settle([1]);
    expect(settled.noReward).toEqual([1]);
    expect(settled.events[0]!.fields.reward).toBe(0n);
    // A game never bought, or none at all.
    await expect(writes.settle([99])).rejects.toMatchObject({ name: "SettleUnknownGameError" });
    await expect(writes.settle([])).rejects.toThrow("No game to settle");
    await expect(ledger.game({ mode: "challenge", gameId: 99 })).rejects.toMatchObject({ kind: "game-not-found" });
  });

  it("a free game spends a credit: no stake, no terms, nothing to settle", async () => {
    const clock = { now: 20_000 * DAY };
    const store = memoryStore();
    const ledger = ledgerAt(clock, store);
    await expect(ledger.writesFor(PLAYER).spawnFree()).rejects.toMatchObject({ name: "NoCreditError" });
    // One credit, as the missions' claim gives it (the stored state edited).
    await ledger.writesFor(PLAYER).mint();
    const stored = JSON.parse(store.data.get(MOCK_KEY)!);
    Object.values(stored.players as Record<string, { credits: number }>)[0]!.credits = 1;
    store.data.set(MOCK_KEY, JSON.stringify(stored));
    const free = await ledger.writesFor(PLAYER).spawnFree();
    expect(free.events).toEqual([expect.objectContaining({ name: "GameSpawned", fields: expect.objectContaining({ gameId: free.gameId, price: 0n }) })]);
    expect((await ledger.account(PLAYER)).credits).toBe(0);
    expect(await ledger.terms(free.gameId)).toMatchObject({ stake: 0, recorded: false });
    expect(await ledger.usdcBalance(PLAYER)).toBe(200n * USDC);
    const surrendered = await ledger.writesFor(PLAYER).surrender({ mode: "challenge", gameId: free.gameId });
    expect(surrendered.events.map((e) => e.name)).toEqual(["GameOver"]);
    clock.now = settlesAfter(20_000);
    await expect(ledger.writesFor(PLAYER).settle([free.gameId])).rejects.toMatchObject({ name: "SettleUnknownGameError" });
  });

  it("Reset's forget takes the account's games with it", async () => {
    const ledger = ledgerAt({ now: 20_000 * DAY });
    await buyGame(ledger, PLAYER);
    await ledger.forget(PLAYER);
    expect(await ledger.playerGames(PLAYER)).toEqual([]);
  });
});

preloadPages("purchase", "board", "over");

beforeEach(() => {
  localStorage.clear();
  resetWelcomedForTests();
  markWelcomed();
});
afterEach(() => {
  vi.useRealTimers();
  queryClient.clear();
  localStorage.clear();
  resetWelcomedForTests();
});

describe("a Challenge game on the mock, in the app (#927)", () => {
  it("bought on the purchase page, played on the board, surrendered, then settled on its over page after its day", async () => {
    // The indexer down, as the deployed mock's is (#927): the pages' chain clock is the device's, the mock's own.
    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() });
    const s = mockImplementation();
    s.chain.fixture.state.down = true;
    const wallet = fakeWallet({ address: PLAYER, restored: true });
    const router = createTestRouter("/play/challenge");
    render(<App router={router} sources={{ ...s.sources, signer: null }} connector={async () => mockConnector(wallet.connector, s.ledger)} />);

    const pay = await screen.findByRole("button", { name: /Pay .*2\.00.* and play/ }, WAIT);
    await waitFor(() => expect(pay).toBeEnabled(), WAIT);
    await userEvent.click(pay);
    await waitFor(() => expect(router.state.location.pathname).toBe("/game/1"), WAIT);
    expect(await s.ledger.usdcBalance(PLAYER)).toBe(98n * USDC);

    // The board: the tile in hand is the ledger's; a discard is the ledger's move, and the next tile follows.
    await screen.findByRole("region", { name: "Your tile" }, WAIT);
    await waitFor(() => expect(within(screen.getByTestId("coming-tiles")).getAllByRole("listitem")).toHaveLength(2), WAIT);
    await discardTile();
    await waitFor(() => expect(s.ledger.tiles({ mode: "challenge", gameId: 1 }).then((t) => t.filter((x) => x.status === 2).length)).resolves.toBe(1), WAIT);
    await screen.findByRole("region", { name: "Your tile" }, WAIT);

    // The end: a surrender, then the over page, its reward pending until the day may close.
    await userEvent.click(screen.getByRole("button", { name: "Settings" }));
    const sheet = await screen.findByRole("dialog", { name: "Settings" }, WAIT);
    await userEvent.click(within(sheet).getByRole("button", { name: /Surrender/ }));
    const dialog = await screen.findByRole("dialog", { name: "Surrender this game?" }, WAIT);
    await userEvent.click(within(dialog).getByRole("button", { name: "Surrender" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/game/1/over"), WAIT);
    expect(await s.ledger.terms(1)).toMatchObject({ recorded: true, stake: 1 });
    expect(screen.queryByRole("button", { name: /Settle and claim/ })).toBeNull();

    // Two days on: the settle is offered, and taken by the ledger.
    expect(await screen.findByText(/The day's mean fixes the reward/, {}, WAIT)).toBeInTheDocument();
    vi.setSystemTime((settlesAfter((await s.ledger.terms(1)).day) + 60) * 1000);
    const settle = await screen.findByRole("button", { name: /Settle and claim/ }, WAIT);
    await userEvent.click(settle);
    await waitFor(async () => expect((await s.ledger.terms(1)).settled).toBe(true), WAIT);
    // Surrendered at 0 points: below the threshold, the stake is lost.
    expect((await s.ledger.terms(1)).reward).toBe(0n);
  }, slow(60_000));
});
