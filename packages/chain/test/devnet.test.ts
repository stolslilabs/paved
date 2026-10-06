/**
 * Integration test against a local starknet-devnet: declares and deploys the four contracts in its
 * setup, then plays through the client layer. Runs only with PAVED_DEVNET=1 (`bun run test:devnet`):
 * CI has no devnet. With PAVED_RECORD=1 it also rewrites `fixtures/devnet.json`, which the unit tests
 * replay.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { resolveDeployment } from "../src/deployment";
import { PavedClient, type PavedRpc } from "../src/paved-client";
import { placementOutcome } from "../src/placement";
import { ViewError, type GameKey } from "../src/views";
import { DAILY_PRICE, type PavedWriter } from "../src/writer";
import { startDevnet, type Devnet } from "./devnet/devnet";
import { recording, type Recording } from "./recorder";

const enabled = process.env.PAVED_DEVNET === "1";
const MAX_TOURNAMENT_ID = 213503982334600;

describe.skipIf(!enabled)("devnet integration", () => {
  let devnet: Devnet;
  let client: PavedClient;
  let other: PavedClient;
  let writer: PavedWriter;
  let player: string;
  const record: Recording = { calls: [], events: [], receipts: {}, errors: {} };

  beforeAll(async () => {
    devnet = await startDevnet(Number(process.env.DEVNET_PORT || 5090));
    const deployment = resolveDeployment({
      network: "devnet",
      env: { rpcUrl: devnet.rpcUrl, addresses: devnet.addresses, deployedBlock: devnet.deployedBlock },
    });
    expect(deployment.configured).toBe(true);
    const provider = recording(devnet.provider as unknown as PavedRpc, record);
    client = new PavedClient(deployment, provider);
    other = new PavedClient(deployment, devnet.provider as unknown as PavedRpc);
    player = devnet.accounts[0].address;
    writer = client.writer(devnet.accounts[0].account, { tip: 0n });
  }, 180_000);

  afterAll(() => {
    devnet?.stop();
    if (enabled && process.env.PAVED_RECORD === "1") {
      record.addresses = devnet.addresses;
      record.player = player;
      record.other = devnet.accounts[1].address;
      writeFileSync(resolve(__dirname, "fixtures/devnet.json"), JSON.stringify(record, null, 2) + "\n");
    }
  });

  test("registers a player and mints the test token", async () => {
    expect(await client.player(player)).toBeNull();
    const result = await writer.createPlayer("alice", { mintTestToken: true });
    record.receipts.create = result.transactionHash;
    expect(result.events.map((e) => e.name)).toEqual(["PlayerCreated"]);
    const registered = await client.player(player);
    expect(registered?.name).toBe("alice");
    expect(await client.balance(player)).toBeGreaterThan(DAILY_PRICE);
  });

  test("plays a tutorial game to its end from receipts and views", async () => {
    const spawned = await writer.spawn("tutorial");
    record.receipts.spawnTutorial = spawned.transactionHash;
    expect(spawned.gameId).toBe(1);
    const key: GameKey = { mode: "tutorial", gameId: spawned.gameId };

    let game = await client.views.game(key);
    expect(game).toMatchObject({ id: 1, mode: 3, over: false, placedCount: 1, deckSize: 10 });
    expect(BigInt(game.playerId)).toBe(BigInt(player));
    const tiles = await client.views.tiles(key);
    expect(tiles.map((t) => t.id)).toEqual([1, 2]);
    expect(tiles[0]).toMatchObject({ status: 1, x: 0x7fffffff, y: 0x7fffffff });
    expect(tiles[1]).toMatchObject({ status: 3, id: game.tileId, plan: game.plan });
    expect((await client.views.builder(key, player)).availableCount).toBe(5);
    expect((await client.views.characters(key, player)).map((c) => c.role)).toEqual([1, 2, 3, 4, 5]);

    // The tutorial is scripted (contracts/src/elements/decks/tutorial.cairo): every drawn plan has
    // its move, except one that must be discarded; `build` refuses it with 'Orientation: not valid'.
    let moves = 0;
    let scored = 0;
    while (!game.over && moves < 20) {
      const held = game.tileId;
      let discard = false;
      const result = await writer.build(key, { orientation: 0, x: 0, y: 0, role: 0, spot: 0 }).catch((error) => {
        if (!String(error?.message).includes("Orientation: not valid")) throw error;
        discard = true;
        return writer.discard(key);
      });
      if (moves === 0) record.receipts.buildTutorial = result.transactionHash;
      const outcome = placementOutcome(result.events, key.gameId);
      if (discard) expect(outcome.discarded?.tileId).toBe(held);
      else expect(outcome.built?.tileId).toBe(held);
      scored += outcome.scoredPoints;
      moves++;
      game = await client.views.game(key);
      if (outcome.over) {
        record.receipts.lastBuildTutorial = result.transactionHash;
        expect(outcome.over.score).toBe(game.score);
      }
    }
    expect(game).toMatchObject({ over: true, placedCount: 9, discardedCount: 1, tileId: 0 });
    expect(moves).toBe(9);
    expect(scored).toBeGreaterThan(0);
    const statuses = (await client.views.tiles(key)).map((t) => t.status);
    expect(statuses.filter((st) => st === 2)).toHaveLength(1);
    expect(statuses.filter((st) => st === 1)).toHaveLength(9);
  }, 120_000);

  test("spawns, discards and surrenders a Daily game, paying the entry price", async () => {
    const tournamentId = await client.views.currentTournamentId();
    const before = await client.views.tournament(tournamentId);
    const spawned = await writer.spawn("daily");
    record.receipts.spawnDaily = spawned.transactionHash;
    expect(spawned.gameId).toBe(1);
    const key: GameKey = { mode: "daily", gameId: 1 };
    expect((await client.views.tournament(tournamentId)).prize).toBe(before.prize + DAILY_PRICE);

    const held = (await client.views.game(key)).tileId;
    const discarded = await writer.discard(key);
    record.receipts.discardDaily = discarded.transactionHash;
    expect(placementOutcome(discarded.events, 1).discarded?.tileId).toBe(held);

    const surrendered = await writer.surrender(key);
    record.receipts.surrenderDaily = surrendered.transactionHash;
    const over = placementOutcome(surrendered.events, 1).over;
    expect(over).not.toBeNull();
    expect((await client.views.game(key)).over).toBe(true);
  }, 60_000);

  test("lists the player's games from GameSpawned and GameOver keyed by player", async () => {
    const games = await client.events.playerGames(player);
    expect(games.map((g) => [g.mode, g.gameId, g.over])).toEqual(
      expect.arrayContaining([
        ["tutorial", 1, true],
        ["daily", 1, true],
      ]),
    );
    expect(games).toHaveLength(2);
    expect(await client.events.playerGames(devnet.accounts[1].address)).toEqual([]);
  });

  test("maps the views' reverts to typed errors", async () => {
    const missing = await client.views.game({ mode: "daily", gameId: 99 }).catch((e) => e);
    expect(missing).toBeInstanceOf(ViewError);
    expect(missing.kind).toBe("game-not-found");
    record.errors.gameNotFound = String(missing.cause?.message ?? missing.message);

    const notMine = await other.views.builder({ mode: "tutorial", gameId: 1 }, devnet.accounts[1].address).catch((e) => e);
    expect(notMine.kind).toBe("not-player");
    record.errors.notPlayer = String(notMine.cause?.message ?? notMine.message);
  });

  test("reads a zeroed tournament above MAX_TOURNAMENT_ID", async () => {
    const t = await client.views.tournament(MAX_TOURNAMENT_ID + 1);
    expect(t).toMatchObject({ id: MAX_TOURNAMENT_ID + 1, startTime: 0, endTime: 0, prize: 0n });
  });
});
