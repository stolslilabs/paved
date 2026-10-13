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
import { WriteError, type Call, type WriteAccount } from "../src/writer";

/** The Daily entry of the recorded deployment (1 token of the test ERC20). */
const DAILY_PRICE = 10n ** 18n;
import type { Recording } from "./recorder";
import { replay } from "./replay";

const record = recordJson as unknown as Recording;
const deployment = resolveDeployment({
  network: "devnet",
  env: { rpcUrl: "http://replay", addresses: record.addresses as Record<"Daily" | "Token", string> },
});
const player = record.player!;
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
  // The recording's views of a game were of the on-chain Tutorial, which left (D-21); a Daily game's view is read below.
  test("game of a Daily game", async () => {
    const game = await client().client.views.game(daily);
    expect(game).toMatchObject({ id: 1, mode: 1 });
    expect(BigInt(game.playerId)).toBe(BigInt(player));
    expect(game.dayId).toBeGreaterThan(20000);
  });

  test("the current day (`current_day`, recorded as `current_tournament_id` before D-20: same value)", async () => {
    const { client: c } = client();
    expect(await c.views.currentDay()).toBeGreaterThan(20000);
  });

  // The recording predates D-25 (E): its `Account.player` answer is no longer read (a player is the wallet address).
  test("balance", async () => {
    const { client: c } = client();
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
        expect.objectContaining({ mode: "daily", gameId: 1, over: true }),
      ]),
    );
    expect(games).toHaveLength(1);
    // Two reads: GameSpawned and GameOver on Daily, the one game contract (the on-chain Tutorial left, D-21).
    expect(provider.asked.filter((a) => a === "getEvents")).toHaveLength(2);
  });

  test("the filter puts the player in the second key of GameSpawned", () => {
    const spawned = record.events.find((e) => e.events.some((ev) => ev.keys.length === 3));
    expect(spawned?.keys[1]).toEqual([]);
    expect(BigInt(spawned!.keys[2][0])).toBe(BigInt(player));
  });
});

describe("writer on recorded receipts", () => {
  // The receipts were recorded from a pre-E3 devnet and cannot be re-recorded here (no devnet runs on this machine). The
  // paid Daily spawn is built from the committed ABI in `economy.test.ts` ("purchase": approve + spawn(stake, referrer,
  // min_out) in one multicall); the recorded Tutorial receipts left with the Tutorial (D-21).
  test("discard and surrender of a Daily game", async () => {
    const { client: c } = client();
    const writer = c.writer(account([record.receipts.discardDaily, record.receipts.surrenderDaily]));
    expect(placementOutcome((await writer.discard(daily)).events, 1).discarded).not.toBeNull();
    expect(placementOutcome((await writer.surrender(daily)).events, 1).over).not.toBeNull();
  });

  test("a Daily build sends the game id and the move", async () => {
    const { client: c } = client();
    const acc = account([record.receipts.discardDaily]);
    await c.writer(acc).build(daily, { orientation: 1, x: 2, y: 3 });
    expect(acc.sent[0][0].calldata).toEqual(["0x1", "0x1", "0x2", "0x3"]);
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
