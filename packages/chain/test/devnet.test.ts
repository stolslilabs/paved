/**
 * Integration test against a local starknet-devnet that `scripts/deploy.sh devnet` has deployed to (see
 * `devnet/devnet.ts`), through the client layer on the paid Daily path: the faucet, `EconomyWriter.purchase`, then play.
 * Runs only with PAVED_DEVNET=1 (`bun run test:devnet`): CI has no devnet. It uses the first two
 * predeployed accounts after account 0 (the deployer, whose smoke game is another game) that are not registered players
 * yet, so it re-runs on one node and can run after the end-to-end test on it.
 * With PAVED_RECORD=1 it also rewrites `fixtures/devnet.json`, which the unit tests replay.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { FAUCET_USDC_AMOUNT } from "../src/abis";
import { createEconomyClient, type EconomyClient, type EconomyWriter } from "../src/economy";
import { PavedClient, type PavedRpc } from "../src/paved-client";
import { placementOutcome } from "../src/placement";
import { ViewError, type GameKey } from "../src/views";
import type { PavedWriter } from "../src/writer";
import { connectDevnet, type Devnet } from "./devnet/devnet";
import { recording, type Recording } from "./recorder";

const enabled = process.env.PAVED_DEVNET === "1";

describe.skipIf(!enabled)("devnet integration", () => {
  let devnet: Devnet;
  let client: PavedClient;
  let other: PavedClient;
  let writer: PavedWriter;
  let econ: EconomyWriter;
  let economy: EconomyClient;
  let player: string;
  let bystander: string;
  let gameId = 0;
  const record: Recording = { calls: [], events: [], receipts: {}, errors: {} };

  beforeAll(async () => {
    devnet = await connectDevnet();
    expect(devnet.deployment.configured).toBe(true);
    expect(devnet.deployment.mockUsdc).not.toBe("");
    expect(devnet.economy.configured, devnet.economy.missing.join(", ")).toBe(true);
    const provider = recording(devnet.provider as unknown as PavedRpc, record);
    client = new PavedClient(devnet.deployment, provider);
    other = new PavedClient(devnet.deployment, devnet.provider as unknown as PavedRpc);
    const free: typeof devnet.accounts = [];
    for (const a of devnet.accounts.slice(1)) {
      if (free.length < 2 && (await other.player(a.address)) === null) free.push(a);
    }
    if (free.length < 2) throw new Error("devnet: fewer than two predeployed accounts after account 0 are unregistered; start a fresh node");
    player = free[0].address;
    bystander = free[1].address;
    writer = client.writer(free[0].account, { tip: 0n });
    // Built on the raw provider: the economy checks the chain id, which the recording wrapper does not forward.
    economy = createEconomyClient(devnet.economy, other)!;
    econ = economy.writer(writer);
  }, 60_000);

  afterAll(() => {
    if (enabled && process.env.PAVED_RECORD === "1" && devnet) {
      record.addresses = devnet.deployment.addresses;
      record.player = player;
      record.other = bystander;
      record.gameId = gameId;
      writeFileSync(resolve(__dirname, "fixtures/devnet.json"), JSON.stringify(record, null, 2) + "\n");
    }
  });

  // Was "registers a player and mints the test token": the faucet is MockUSDC.mint(self, N), the entry token.
  test("registers a player and mints the faucet USDC", async () => {
    expect(await client.player(player)).toBeNull();
    const result = await writer.createPlayer("alice", { mintTestToken: true });
    record.receipts.create = result.transactionHash;
    expect(result.events.map((e) => e.name)).toEqual(["PlayerCreated"]);
    expect((await client.player(player))?.name).toBe("alice");
    const price = await client.views.entryPrice();
    expect(BigInt(price.token)).toBe(BigInt(devnet.deployment.mockUsdc));
    expect(price.amount).toBeGreaterThan(0n);
    expect(await economy.views.usdcBalance(player)).toBe(FAUCET_USDC_AMOUNT);
    expect(await client.balance(player)).toBeGreaterThan(price.amount);
  });

  test("claims the tutorial (D-21): the first claim credits task 10, a second one changes nothing", async () => {
    expect(await client.views.tutorialClaimed(player)).toBe(false);
    const first = await writer.claimTutorial();
    expect(first.events.map((e) => [e.name, e.fields.taskId, e.fields.count])).toEqual([["AchievementProgressed", 10, 1]]);
    expect(await client.views.tutorialClaimed(player)).toBe(true);
    const second = await writer.claimTutorial();
    expect(second.events).toEqual([]);
    expect(await client.views.tutorialClaimed(bystander)).toBe(false);
  }, 60_000);

  // Was "spawns, discards and surrenders ... paying the entry price": a Daily game is bought (P8), not spawned.
  test("buys a Daily game with stake 1, then discards and surrenders it", async () => {
    expect(await client.views.currentDay()).toBeGreaterThan(0);
    const quote = await economy.views.quote(1);
    const price = (await client.views.entryPrice()).amount;
    expect(quote.price).toBe(price);
    const before = await economy.views.usdcBalance(player);
    const planned = await econ.planPurchase({ stake: 1, confirmedPrice: quote.price, confirmedMinOut: 1n, referrer: null });
    const bought = await econ.purchase({ stake: 1, confirmedPrice: quote.price, confirmedMinOut: planned.minOut, referrer: null });
    record.receipts.spawnDaily = bought.transactionHash;
    gameId = bought.gameId;
    expect(bought.events.map((e) => e.name)).toContain("GameSpawned");
    expect(before - (await economy.views.usdcBalance(player))).toBe(quote.price);
    expect(await economy.views.terms(gameId)).toMatchObject({ stake: 1, recorded: false, settled: false, expired: false });
    const key: GameKey = { mode: "daily", gameId };

    const held = (await client.views.game(key)).tileId;
    const discarded = await writer.discard(key);
    record.receipts.discardDaily = discarded.transactionHash;
    expect(placementOutcome(discarded.events, gameId).discarded?.tileId).toBe(held);

    const surrendered = await writer.surrender(key);
    record.receipts.surrenderDaily = surrendered.transactionHash;
    expect(placementOutcome(surrendered.events, gameId).over).not.toBeNull();
    expect((await client.views.game(key)).over).toBe(true);
    // The game is recorded in the Economy when it ends (the settlement reads it).
    expect(await economy.views.terms(gameId)).toMatchObject({ recorded: true, settled: false });
  }, 120_000);

  test("lists the player's games from GameSpawned and GameOver keyed by player", async () => {
    const games = await client.events.playerGames(player);
    expect(games.map((g) => [g.mode, g.gameId, g.over])).toEqual([["daily", gameId, true]]);
    expect(await client.events.playerGames(bystander)).toEqual([]);
  });

  test("maps the views' reverts to typed errors", async () => {
    const missing = await client.views.game({ mode: "daily", gameId: 99999 }).catch((e) => e);
    expect(missing).toBeInstanceOf(ViewError);
    expect(missing.kind).toBe("game-not-found");
    record.errors.gameNotFound = String(missing.cause?.message ?? missing.message);

    const notMine = await other.views.builder({ mode: "daily", gameId }, bystander).catch((e) => e);
    expect(notMine.kind).toBe("not-player");
    record.errors.notPlayer = String(notMine.cause?.message ?? notMine.message);
  });
});
