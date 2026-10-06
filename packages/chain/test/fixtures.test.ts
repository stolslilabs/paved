/**
 * Unit tests of the clients and the event reader on RPC answers recorded from devnet
 * (`fixtures/devnet.json`, rewritten by `PAVED_RECORD=1 bun run test:devnet`).
 */
import { describe, expect, test } from "vitest";
import recordJson from "./fixtures/devnet.json";
import { resolveDeployment } from "../src/deployment";
import { PavedClient } from "../src/paved-client";
import { placementOutcome } from "../src/placement";
import { toViewError, type GameKey } from "../src/views";
import { DAILY_PRICE, WriteError, type Call, type WriteAccount } from "../src/writer";
import type { Recording } from "./recorder";
import { replay } from "./replay";

const record = recordJson as unknown as Recording;
const deployment = resolveDeployment({
  network: "devnet",
  env: { rpcUrl: "http://replay", addresses: record.addresses as Record<"Account" | "Daily" | "Tutorial" | "Token", string> },
});
const player = record.player!;
const tutorial: GameKey = { mode: "tutorial", gameId: 1 };
const daily: GameKey = { mode: "daily", gameId: 1 };

function client() {
  const provider = replay(record);
  return { provider, client: new PavedClient(deployment, provider) };
}

/** An account that "sends" the recorded transaction of each write, in order. */
function account(hashes: string[]): WriteAccount & { sent: Call[][] } {
  const sent: Call[][] = [];
  return {
    address: player,
    sent,
    async execute(calls) {
      sent.push(calls);
      const hash = hashes.shift();
      if (!hash) throw new Error("no more recorded transactions");
      return { transaction_hash: hash };
    },
  };
}

describe("views on recorded answers", () => {
  test("game of a finished tutorial", async () => {
    const game = await client().client.views.game(tutorial);
    expect(game).toMatchObject({ id: 1, mode: 3, over: true, tileCount: 10, placedCount: 9, discardedCount: 1, tileId: 0, plan: 0, deckSize: 10 });
    expect(BigInt(game.playerId)).toBe(BigInt(player));
    expect(game.score).toBeGreaterThan(0);
  });

  test("tiles of a fresh tutorial game: the starter tile and the tile in hand", async () => {
    const tiles = await client().client.views.tiles(tutorial);
    // The recording holds the last `tiles` answer: the finished game, one page.
    expect(tiles).toHaveLength(10);
    expect(tiles[0]).toMatchObject({ id: 1, status: 1, x: 0x7fffffff, y: 0x7fffffff });
    expect(tiles.map((t) => t.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  test("builder and characters of the player", async () => {
    const { client: c } = client();
    expect(await c.views.builder(tutorial, player)).toMatchObject({ gameId: 1, placedCount: 0, availableCount: 5 });
    const characters = await c.views.characters(tutorial, player);
    expect(characters.map((ch) => ch.role)).toEqual([1, 2, 3, 4, 5]);
    expect(characters.every((ch) => !ch.placed && ch.tileId === 0)).toBe(true);
  });

  test("the current tournament holds the Daily entry price", async () => {
    const { client: c } = client();
    const id = await c.views.currentTournamentId();
    expect(id).toBeGreaterThan(20000);
    const t = await c.views.tournament(id);
    expect(t).toMatchObject({ id, startTime: id * 86400, endTime: (id + 1) * 86400, over: false, prize: DAILY_PRICE });
  });

  test("player and balance", async () => {
    const { client: c } = client();
    const p = await c.player(player);
    expect(p?.name).toBe("alice");
    expect(await c.balance(player)).toBeGreaterThan(DAILY_PRICE);
  });

  test("the node's revert messages map to typed errors", () => {
    expect(toViewError(new Error(record.errors.gameNotFound)).kind).toBe("game-not-found");
    expect(toViewError(new Error(record.errors.notPlayer)).kind).toBe("not-player");
  });
});

describe("event reader on recorded events", () => {
  test("lists the player's games, filtered by player key on the node", async () => {
    const { client: c, provider } = client();
    const games = await c.events.playerGames(player);
    expect(games).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ mode: "tutorial", gameId: 1, over: true, tournamentId: 0, countedTournamentId: 0 }),
        expect.objectContaining({ mode: "daily", gameId: 1, over: true }),
      ]),
    );
    expect(games).toHaveLength(2);
    // Four reads: GameSpawned and GameOver on each game contract.
    expect(provider.asked.filter((a) => a === "getEvents")).toHaveLength(4);
  });

  test("the filter puts the player in the second key of GameSpawned", () => {
    const spawned = record.events.find((e) => e.events.some((ev) => ev.keys.length === 3));
    expect(spawned?.keys[1]).toEqual([]);
    expect(BigInt(spawned!.keys[2][0])).toBe(BigInt(player));
  });
});

describe("writer on recorded receipts", () => {
  test("spawn returns the game id from GameSpawned; Daily approves the price in the same call", async () => {
    const { client: c } = client();
    const acc = account([record.receipts.spawnDaily]);
    const result = await c.writer(acc).spawn("daily");
    expect(result.gameId).toBe(1);
    expect(acc.sent[0].map((call) => call.entrypoint)).toEqual(["approve", "spawn"]);
    expect(acc.sent[0][0].calldata).toEqual([deployment.addresses.Daily, "0xde0b6b3a7640000", "0x0"]);
  });

  test("a tutorial build: Built, then the last one ends the game with GameOver", async () => {
    const { client: c } = client();
    const writer = c.writer(account([record.receipts.buildTutorial, record.receipts.lastBuildTutorial]));
    const first = placementOutcome((await writer.build(tutorial, { orientation: 0, x: 0, y: 0, role: 0, spot: 0 })).events, 1);
    expect(first.built).toMatchObject({ tileId: 2 });
    expect(first.built!.orientation).toBeGreaterThan(0);
    expect(first.over).toBeNull();

    const last = placementOutcome((await writer.build(tutorial, { orientation: 0, x: 0, y: 0, role: 0, spot: 0 })).events, 1);
    expect(last.built).toMatchObject({ tileId: 10 });
    expect(last.over?.score).toBe((await c.views.game(tutorial)).score);
    expect(last.over?.tournamentId).toBe(0);
  });

  test("discard and surrender of a Daily game", async () => {
    const { client: c } = client();
    const writer = c.writer(account([record.receipts.discardDaily, record.receipts.surrenderDaily]));
    expect(placementOutcome((await writer.discard(daily)).events, 1).discarded).not.toBeNull();
    expect(placementOutcome((await writer.surrender(daily)).events, 1).over).not.toBeNull();
  });

  test("Tutorial build sends the game id only; Daily build sends the move", async () => {
    const { client: c } = client();
    const acc = account([record.receipts.buildTutorial, record.receipts.buildTutorial]);
    const writer = c.writer(acc);
    await writer.build(tutorial, { orientation: 1, x: 2, y: 3, role: 4, spot: 5 });
    await writer.build(daily, { orientation: 1, x: 2, y: 3, role: 4, spot: 5 }).catch(() => undefined);
    expect(acc.sent[0][0].calldata).toEqual(["0x1"]);
    expect(acc.sent[1][0].calldata).toEqual(["0x1", "0x1", "0x2", "0x3", "0x4", "0x5"]);
  });

  test("a reverted receipt is a WriteError with its reason", async () => {
    const provider = {
      ...replay(record),
      async waitForTransaction() {
        return { execution_status: "REVERTED", revert_reason: "Builder: does not exist", events: [] };
      },
    };
    const writer = new PavedClient(deployment, provider).writer(account(["0x1"]));
    const error = await writer.discard(daily).catch((e) => e);
    expect(error).toBeInstanceOf(WriteError);
    expect(error).toMatchObject({ message: "Builder: does not exist", transactionHash: "0x1" });
  });

  test("no writer without a configured deployment", () => {
    const off = resolveDeployment({ network: "devnet" });
    expect(() => new PavedClient(off, replay(record)).writer(account([]))).toThrow(/Not connected/);
  });
});
