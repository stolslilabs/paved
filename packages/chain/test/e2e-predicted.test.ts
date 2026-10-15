/**
 * End-to-end check of `PredictedSession` (`@paved/game-core`, P5) on a local devnet, through the client's own code
 * (PavedClient, PavedWriter, EconomyWriter, RpcGameViews), no browser: a real Challenge game is bought, opened with the
 * engine's replay of `initial_seed` and `tiles()`, then played with prediction. Every predicted move is checked against
 * the chain's receipt and `game()` (no mismatch, no resync); two moves are queued before the first receipt; a move the
 * chain refuses rolls back; a move made behind the session's back (another tab of the same player) makes the next
 * prediction differ, and the session resyncs to the chain. On demand only: `PAVED_E2E_PREDICTED=1`. CI has no devnet.
 *
 *   starknet-devnet --host 127.0.0.1 --port 5050 --seed 42     # a node
 *   scripts/deploy.sh devnet                                   # writes contracts/deployments/devnet.json
 *   PAVED_E2E_PREDICTED=1 bunx vitest run test/e2e-predicted.test.ts    # in packages/chain
 *
 * The node need not be fresh and no indexer is read: the player is the predeployed account 5 (accounts 1 to 3 are
 * `e2e-devnet.test.ts`'s), who takes the faucet's USDC if it has none and buys a game at stake 1.
 *
 * Env: `E2E_DEPLOYMENT` (file, default contracts/deployments/devnet.json), `E2E_TABLE` (a path: the evidence, markdown).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { CENTER, MAX_UNCONFIRMED, PredictedSession, type Mismatch, type PredictedState } from "@paved/game-core";
import { Account, RpcProvider } from "starknet";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { resolveDeployment, type DeploymentFile } from "../src/deployment";
import { createEconomyClient, resolveEconomyDeployment, type EconomyDeploymentFile, type EconomyWriter } from "../src/economy";
import { PavedClient, type PavedRpc } from "../src/paved-client";
import type { GameKey } from "../src/views";
import { GameExpiredError, InvalidPositionError, type PavedWriter, type WriteResult } from "../src/writer";

const enabled = process.env.PAVED_E2E_PREDICTED === "1";
const REPO = resolve(__dirname, "../../..");
const ACCOUNT_INDEX = 5;
/** Moves played with prediction before the queued pair, the refusal and the forced mismatch. */
const PREDICTED_MOVES = 16;

async function rpc(url: string, method: string, params: unknown = {}): Promise<any> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const body = await res.json();
  if (body.error) throw new Error(`${method}: ${JSON.stringify(body.error)}`);
  return body.result;
}

describe.skipIf(!enabled)("PredictedSession end-to-end on devnet", () => {
  let client: PavedClient;
  let provider: RpcProvider;
  let writer: PavedWriter;
  let econ: EconomyWriter;
  let key: GameKey;
  let session: PredictedSession<GameKey, WriteResult>;
  const mismatches: Mismatch[] = [];
  const evidence: Array<{ step: string; detail: string }> = [];

  const chainTime = async (): Promise<number> => ((await provider.getBlock("latest")) as { timestamp: number }).timestamp;
  let blockTime = 0;

  /** The chain's game, as the session's state must show it after a confirmed move. */
  async function expectInStep(state: PredictedState, label: string): Promise<void> {
    const game = await client.views.game(key);
    expect(state.game?.score, `${label}: score`).toBe(game.score);
    expect(state.game?.over, `${label}: over`).toBe(game.over);
    expect(state.game?.discardedCount, `${label}: discards`).toBe(game.discardedCount);
    expect(state.game?.placedCount, `${label}: placed`).toBe(game.placedCount);
    if (!game.over) expect(state.hand, `${label}: hand`).toEqual({ tileId: game.tileId, plan: game.plan });
  }

  /**
   * The legal placement of the tile in hand that scores most by the engine's preview (so moves close structures and the
   * `Scored` events are checked too), in the chain's coordinates; null when none.
   */
  function legal(): { orientation: number; x: number; y: number } | null {
    let best: { move: { orientation: number; x: number; y: number }; points: number } | null = null;
    for (const orientation of [1, 2, 3, 4]) {
      for (const slot of session.slots(orientation)) {
        const move = { orientation, ...slot };
        const points = session.preview(move) ?? -1;
        if (!best || points > best.points) best = { move, points };
      }
    }
    return best?.move ?? null;
  }

  const build = (move: { orientation: number; x: number; y: number }) => () => writer.build(key, move);
  const discard = () => writer.discard(key);

  beforeAll(async () => {
    const file = JSON.parse(readFileSync(process.env.E2E_DEPLOYMENT ?? resolve(REPO, "contracts/deployments/devnet.json"), "utf8")) as DeploymentFile;
    const deployment = resolveDeployment({ network: "devnet", file });
    expect(deployment.configured).toBe(true);
    provider = new RpcProvider({ nodeUrl: deployment.rpcUrl });
    client = new PavedClient(deployment, provider as unknown as PavedRpc);
    const economy = createEconomyClient(resolveEconomyDeployment({ base: deployment, file: file as EconomyDeploymentFile }), client)!;
    const predeployed: Array<{ address: string; private_key: string }> = await rpc(deployment.rpcUrl, "devnet_getPredeployedAccounts");
    const a = predeployed[ACCOUNT_INDEX]!;
    const account = new Account({ provider, address: a.address, signer: a.private_key });
    writer = client.writer(account, { tip: 0n });
    econ = economy.writer(writer);

    if ((await economy.views.usdcBalance(a.address)) === 0n) await writer.mint();
    const quote = await economy.views.quote(1);
    const planned = await econ.planPurchase({ stake: 1, confirmedPrice: quote.price, confirmedMinOut: 1n, referrer: null });
    const bought = await econ.purchase({ stake: 1, confirmedPrice: quote.price, confirmedMinOut: planned.minOut, referrer: null });
    key = { mode: "challenge", gameId: bought.gameId };
    blockTime = await chainTime();
    session = new PredictedSession(client.views, key, a.address, {
      // The node's clock, read before each move: the game expires 24 h after its block.
      now: () => blockTime,
      expiredError: () => new GameExpiredError(),
      onMismatch: (m) => mismatches.push(m),
    });
    evidence.push({ step: "buy", detail: `game ${bought.gameId} at stake 1, ${bought.transactionHash.slice(0, 10)}…` });
  }, 120_000);

  afterAll(() => {
    if (enabled && process.env.E2E_TABLE) {
      const rows = evidence.map((e) => `| ${e.step} | ${e.detail.replace(/\|/g, "/")} |`);
      writeFileSync(process.env.E2E_TABLE, ["| Step | Evidence |", "|---|---|", ...rows, ""].join("\n"));
    }
  });

  test("open: the replay of initial_seed and tiles() is in step with game()", async () => {
    await session.open();
    expect(session.state).toMatchObject({ status: "ready", predicting: true, fallback: null, readonly: false });
    await expectInStep(session.state, "open");
    evidence.push({ step: "open", detail: `in step; hand ${session.state.hand?.tileId}/${session.state.hand?.plan}` });
  }, 60_000);

  test("every predicted move equals the chain's result: the next tile shows before the receipt", async () => {
    const lines: string[] = [];
    for (let i = 0; i < PREDICTED_MOVES && !session.state.game?.over; i++) {
      const move = i % 4 === 3 ? null : legal();
      const sent = move ? session.place(move, build(move)) : session.discard(discard);
      // At once, from the engine: the next tile, pending until the receipt.
      const predicted = session.state;
      expect(predicted.unconfirmed).toBe(1);
      expect(await sent).toBe(true);
      expect(session.state.hand).toEqual(predicted.hand);
      expect(session.state.game?.score).toBe(predicted.game?.score);
      await expectInStep(session.state, `move ${i + 1}`);
      const closed = predicted.lastScored.map((c) => `${c.category}:${c.size}:${c.points}`).join(" ");
      lines.push(`${move ? `build ${move.orientation}@${move.x - CENTER},${move.y - CENTER}` : "discard"} -> ${predicted.game?.score} pts${closed ? ` (closed ${closed})` : ""}, next ${predicted.hand?.tileId}/${predicted.hand?.plan}`);
    }
    expect(mismatches).toEqual([]);
    expect(session.state.resynced).toBe(0);
    // Scoring was exercised: some move closed a structure for points.
    expect(session.state.game?.score).toBeGreaterThan(0);
    evidence.push({ step: "predicted moves", detail: `${lines.length} moves, each prediction equal to the receipt and game(): ${lines.join("; ")}` });
  }, 300_000);

  test("two moves queued before the first receipt are confirmed in order", async () => {
    const first = legal();
    const a = first ? session.place(first, build(first)) : session.discard(discard);
    const second = legal();
    const b = second ? session.place(second, build(second)) : session.discard(discard);
    expect(session.state.unconfirmed).toBe(MAX_UNCONFIRMED);
    expect(await a).toBe(true);
    expect(await b).toBe(true);
    await expectInStep(session.state, "queued pair");
    expect(mismatches).toEqual([]);
    evidence.push({ step: "queue", detail: `two moves queued, both confirmed; score ${session.state.game?.score}` });
  }, 120_000);

  test("a move the chain refuses rolls the engine back and shows the typed error", async () => {
    const before = session.state;
    const move = legal()!;
    // The engine plays `move`; the chain is sent a square off the board (CORE #391) and refuses it.
    expect(await session.place(move, () => writer.build(key, { ...move, x: 0, y: 0 }))).toBe(false);
    expect(session.state.writeError).toBe(new InvalidPositionError().message);
    expect(session.state.hand).toEqual(before.hand);
    expect(session.state.tiles).toEqual(before.tiles);
    await expectInStep(session.state, "after the refusal");
    evidence.push({ step: "refused", detail: `InvalidPositionError, rolled back to hand ${before.hand?.tileId}` });
  }, 120_000);

  test("a move made behind the session's back: the next prediction differs, the chain wins, the board resyncs", async () => {
    // Another tab of the same player discards: the session's hand is stale.
    await writer.discard(key);
    expect(await session.discard(discard)).toBe(true);
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]).toMatchObject({ gameId: key.gameId, move: { kind: "discard" } });
    expect(session.state).toMatchObject({ resynced: 1, predicting: true });
    await expectInStep(session.state, "after the resync");
    evidence.push({ step: "forced mismatch", detail: `resynced: ${mismatches[0]!.reason}` });

    // In step again: the next move is predicted and confirmed.
    const move = legal();
    expect(await (move ? session.place(move, build(move)) : session.discard(discard))).toBe(true);
    expect(mismatches).toHaveLength(1);
    await expectInStep(session.state, "after the resync, one more move");
  }, 120_000);

  test("past expires_at the session refuses a move and sends nothing; a surrender closes the game", async () => {
    const game = await client.views.game(key);
    await rpc(client.deployment.rpcUrl, "devnet_increaseTime", { time: game.expiresAt - (await chainTime()) + 5 });
    await rpc(client.deployment.rpcUrl, "devnet_createBlock");
    blockTime = await chainTime();
    expect(session.expired).toBe(true);
    expect(await session.discard(discard)).toBe(false);
    expect(session.state.writeError).toBe(new GameExpiredError().message);
    expect((await client.views.game(key)).discardedCount).toBe(game.discardedCount);
    expect(await session.surrender(() => writer.surrender(key))).toBe(true);
    expect(session.state.game?.over).toBe(true);
    expect((await client.views.game(key)).over).toBe(true);
    expect(mismatches).toHaveLength(1);
    evidence.push({ step: "expiry", detail: `discard refused before sending; surrender closed the game at ${session.state.game?.score} pts` });
  }, 120_000);
});
