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
import type { PavedWriter } from "../src/writer";
import { startDevnet, type Devnet } from "./devnet/devnet";
import { recording, type Recording } from "./recorder";

const enabled = process.env.PAVED_DEVNET === "1";

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
    const price = await client.views.entryPrice();
    expect(BigInt(price.token)).toBe(BigInt(devnet.addresses.Token));
    expect(price.amount).toBeGreaterThan(0n);
    expect(await client.balance(player)).toBeGreaterThan(price.amount);
  });

  test("claims the tutorial (D-21): the first claim credits task 10, a second one changes nothing", async () => {
    expect(await client.views.tutorialClaimed(player)).toBe(false);
    const first = await writer.claimTutorial();
    expect(first.events.map((e) => [e.name, e.fields.taskId, e.fields.count])).toEqual([["AchievementProgressed", 10, 1]]);
    expect(await client.views.tutorialClaimed(player)).toBe(true);
    const second = await writer.claimTutorial();
    expect(second.events).toEqual([]);
    expect(await client.views.tutorialClaimed(devnet.accounts[1].address)).toBe(false);
  }, 60_000);

  test("spawns, discards and surrenders a Daily game, paying the entry price", async () => {
    expect(await client.views.currentDay()).toBeGreaterThan(0);
    const spawned = await writer.spawn("daily");
    record.receipts.spawnDaily = spawned.transactionHash;
    expect(spawned.gameId).toBe(1);
    const key: GameKey = { mode: "daily", gameId: 1 };

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
        ["daily", 1, true],
      ]),
    );
    expect(games).toHaveLength(1);
    expect(await client.events.playerGames(devnet.accounts[1].address)).toEqual([]);
  });

  test("maps the views' reverts to typed errors", async () => {
    const missing = await client.views.game({ mode: "daily", gameId: 99 }).catch((e) => e);
    expect(missing).toBeInstanceOf(ViewError);
    expect(missing.kind).toBe("game-not-found");
    record.errors.gameNotFound = String(missing.cause?.message ?? missing.message);

    const notMine = await other.views.builder({ mode: "daily", gameId: 1 }, devnet.accounts[1].address).catch((e) => e);
    expect(notMine.kind).toBe("not-player");
    record.errors.notPlayer = String(notMine.cause?.message ?? notMine.message);
  });
});
