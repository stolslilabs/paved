/**
 * End-to-end check of the client on a local devnet, through the client's own code (PavedClient,
 * PavedWriter, GameViews, EventReader, IndexerClient), no browser. On demand only: `PAVED_E2E=1`
 * (`bun run test:e2e`). CI has no devnet.
 *
 * It does not start anything. Start the stack first (packages/README.md, "End-to-end check on devnet"):
 *   starknet-devnet --host 127.0.0.1 --port 5050 --seed 42     # fresh node
 *   scripts/deploy.sh devnet                                   # writes contracts/deployments/devnet.json
 *   node packages/indexer/src/main.ts run --deployment contracts/deployments/devnet.json --db <file> --port 8787
 * The node must be fresh (the test moves its clock one day forward), and the three players are the
 * predeployed accounts 1 to 3 (account 0 is the deployer, whose smoke game stays in the chain).
 *
 * Env: `E2E_DEPLOYMENT` (file, default contracts/deployments/devnet.json), `E2E_INDEXER_URL` (default
 * http://127.0.0.1:8787), `E2E_TABLE` (a path: the table of steps and evidence is written there, markdown).
 */
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Account, RpcProvider } from "starknet";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { resolveDeployment, type DeploymentFile } from "../src/deployment";
import { IndexerClient, indexerPlayerId, type IndexedGame, type LeaderboardEntry } from "../src/indexer";
import { PavedClient, type PavedRpc } from "../src/paved-client";
import { placementOutcome } from "../src/placement";
import { claimableRanks, rewardOf, type Rank } from "../src/prize";
import { TILE_STATUS, type GameKey, type TournamentView } from "../src/views";
import type { BuildMove, PavedWriter } from "../src/writer";

const enabled = process.env.PAVED_E2E === "1";
const DAY = 86400;
const REPO = resolve(__dirname, "../../..");

interface Player {
  name: string;
  address: string;
  account: Account;
  writer: PavedWriter;
}

const steps: Array<{ step: string; pass: boolean; evidence: string }> = [];

async function rpc(url: string, method: string, params: unknown = {}): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = await res.json();
  if (body.error) throw new Error(`${method}: ${JSON.stringify(body.error)}`);
  return body.result;
}

const hex = (v: string | bigint | number) => `0x${BigInt(v).toString(16).padStart(64, "0")}`;
const short = (h: string) => `${h.slice(0, 10)}…${h.slice(-4)}`;

describe.skipIf(!enabled)("client end-to-end on devnet", () => {
  let rpcUrl: string;
  let provider: RpcProvider;
  let client: PavedClient;
  let indexer: IndexerClient;
  let players: Player[];
  let price: bigint;
  let tournamentId: number;
  const dailyGames = new Map<string, number>(); // player name -> daily game id
  const tutorialGames = new Map<string, number>();
  const scores = new Map<string, number>(); // player name -> final Daily score
  const tournamentAfter: { view?: TournamentView } = {};
  let prizeAtStart = 0n;

  const pass = (step: string, evidence: string) => steps.push({ step, pass: true, evidence });

  /** The chain's head timestamp, from the node. */
  const chainTime = async (): Promise<number> => ((await provider.getBlock("latest")) as { timestamp: number }).timestamp;

  /** Waits until the indexer has applied the node's latest block, then returns its head. */
  async function caughtUp(): Promise<void> {
    const target = (await provider.getBlockNumber()) as number;
    const deadline = Date.now() + 30_000;
    for (;;) {
      try {
        const head = (await indexer.head()).head.number;
        if (head >= target) return;
      } catch (error) {
        if (Date.now() > deadline) throw error;
      }
      if (Date.now() > deadline) throw new Error(`indexer did not reach block ${target}`);
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  /** Whether the node accepts this placement (fee estimation runs the call): nothing is sent. */
  async function legal(player: Player, key: GameKey, move: BuildMove): Promise<boolean> {
    const call = {
      contractAddress: client.deployment.addresses.Daily,
      entrypoint: "build",
      calldata: client.codecs.Daily.encodeCall("build", [key.gameId, move.orientation, move.x, move.y, move.role, move.spot]),
    };
    try {
      await player.account.estimateInvokeFee([call], { tip: 0n });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Plays a Daily game for at most `maxMoves` placements: a legal placement next to the tiles placed
   * (found by probing the node), with a character when one fits, then sent through the writer. It
   * surrenders if the game is still running after that.
   */
  async function playDaily(player: Player, key: GameKey, maxMoves: number): Promise<{ moves: number; score: number; hash: string }> {
    let moves = 0;
    let hash = "";
    for (let game = await client.views.game(key); !game.over && moves < maxMoves; game = await client.views.game(key)) {
      const tiles = (await client.views.tiles(key)).filter((t) => t.status === TILE_STATUS.placed);
      const taken = new Set(tiles.map((t) => `${t.x},${t.y}`));
      let chosen: BuildMove | null = null;
      search: for (const t of tiles) {
        for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
          const x = t.x + dx;
          const y = t.y + dy;
          if (taken.has(`${x},${y}`)) continue;
          for (let orientation = 0; orientation < 4; orientation++) {
            const bare = { orientation, x, y, role: 0, spot: 0 };
            if (!(await legal(player, key, bare))) continue;
            chosen = bare;
            const builder = await client.views.builder(key, player.address);
            if (builder.availableCount > 0) {
              for (let role = 1; role <= 5 && chosen === bare; role++) {
                for (let spot = 1; spot <= 9; spot++) {
                  if (await legal(player, key, { ...bare, role, spot })) {
                    chosen = { ...bare, role, spot };
                    break;
                  }
                }
              }
            }
            break search;
          }
        }
      }
      if (chosen) {
        const result = await player.writer.build(key, chosen);
        hash = result.transactionHash;
        moves++;
        if (process.env.E2E_VERBOSE) {
          // a path: one line per placement
          const outcome = placementOutcome(result.events, key.gameId);
          appendFileSync(process.env.E2E_VERBOSE, `${player.name} move ${moves} ${JSON.stringify(chosen)} scored ${outcome.scoredPoints} game score ${(await client.views.game(key)).score}\n`);
        }
      } else {
        try {
          hash = (await player.writer.discard(key)).transactionHash;
        } catch {
          break;
        }
      }
    }
    let game = await client.views.game(key);
    if (!game.over) {
      const result = await player.writer.surrender(key);
      hash = result.transactionHash;
      expect(placementOutcome(result.events, key.gameId).over).not.toBeNull();
      game = await client.views.game(key);
    }
    expect(game.over).toBe(true);
    return { moves, score: game.score, hash };
  }

  beforeAll(async () => {
    const file = JSON.parse(readFileSync(process.env.E2E_DEPLOYMENT ?? resolve(REPO, "contracts/deployments/devnet.json"), "utf8")) as DeploymentFile;
    const deployment = resolveDeployment({ network: "devnet", file });
    expect(deployment.configured).toBe(true);
    rpcUrl = deployment.rpcUrl;
    provider = new RpcProvider({ nodeUrl: rpcUrl });
    client = new PavedClient(deployment, provider as unknown as PavedRpc);
    indexer = new IndexerClient({ url: process.env.E2E_INDEXER_URL ?? "http://127.0.0.1:8787" });

    const predeployed: Array<{ address: string; private_key: string }> = await rpc(rpcUrl, "devnet_getPredeployedAccounts");
    players = ["alice", "bob", "carol"].map((name, i) => {
      const a = predeployed[i + 1];
      const account = new Account({ provider, address: a.address, signer: a.private_key });
      return { name, address: a.address, account, writer: client.writer(account, { tip: 0n }) };
    });

    // Keep the three Daily games inside one day, whatever the wall clock says.
    const t = await chainTime();
    if (DAY - (t % DAY) < 1800) await rpc(rpcUrl, "devnet_increaseTime", { time: DAY - (t % DAY) + 60 });
  }, 60_000);

  afterAll(() => {
    if (enabled && process.env.E2E_TABLE) {
      const rows = steps.map((s) => `| ${s.step} | ${s.pass ? "pass" : "fail"} | ${s.evidence.replace(/\|/g, "/")} |`);
      writeFileSync(process.env.E2E_TABLE, ["| Step | Result | Evidence |", "|---|---|---|", ...rows, ""].join("\n"));
    }
  });

  test("the node, the deployment and the indexer agree", async () => {
    const head = await indexer.head();
    expect(head.data.state).toBe("ok");
    expect(BigInt(head.data.chainId)).toBe(BigInt(await provider.getChainId()));
    expect(head.data.fromBlock).toBe(client.deployment.deployedBlock);
    expect(BigInt(head.data.contracts.daily)).toBe(BigInt(client.deployment.addresses.Daily));
    expect(BigInt(head.data.contracts.tutorial)).toBe(BigInt(client.deployment.addresses.Tutorial));
    expect(BigInt(head.data.contracts.account)).toBe(BigInt(client.deployment.addresses.Account));
    pass("deployment, node and indexer agree", `chain ${head.data.chainId}, from_block ${head.data.fromBlock}, indexer head ${head.head.number}, lastMismatch ${head.data.lastMismatch}`);
  });

  test("creates three players", async () => {
    const hashes: string[] = [];
    for (const p of players) {
      expect(await client.player(p.address)).toBeNull();
      const result = await p.writer.createPlayer(p.name, { mintTestToken: true });
      expect(result.events.map((e) => e.name)).toEqual(["PlayerCreated"]);
      expect((await client.player(p.address))?.name).toBe(p.name);
      hashes.push(`${p.name} ${short(result.transactionHash)}`);
    }
    price = (await client.views.entryPrice()).amount;
    expect(price).toBeGreaterThan(0n);
    pass("create players (with faucet mint)", hashes.join(", "));
  }, 60_000);

  test("spawns a Tutorial game and plays it to game over", async () => {
    const [alice] = players;
    const spawned = await alice.writer.spawn("tutorial");
    tutorialGames.set(alice.name, spawned.gameId);
    const key: GameKey = { mode: "tutorial", gameId: spawned.gameId };
    let moves = 0;
    let hash = spawned.transactionHash;
    for (let game = await client.views.game(key); !game.over && moves < 20; game = await client.views.game(key)) {
      const result = await alice.writer.build(key, { orientation: 0, x: 0, y: 0, role: 0, spot: 0 }).catch((error) => {
        if (!String(error?.message).includes("Orientation: not valid")) throw error;
        return alice.writer.discard(key);
      });
      hash = result.transactionHash;
      moves++;
    }
    const game = await client.views.game(key);
    expect(game.over).toBe(true);
    expect(game.tournamentId).toBe(0);
    pass("Tutorial: spawn and play to game over", `game ${key.gameId}, ${moves} moves, score ${game.score}, spawn ${short(spawned.transactionHash)}, last ${short(hash)}`);
  }, 120_000);

  test("spawns three Daily games at the entry price", async () => {
    tournamentId = await client.views.currentTournamentId();
    prizeAtStart = (await client.views.tournament(tournamentId)).prize; // the deploy script plays no Daily game, so the prize is 0 on a fresh node
    const evidence: string[] = [];
    for (const p of players) {
      const before = await client.balance(p.address);
      const prizeBefore = (await client.views.tournament(tournamentId)).prize;
      const spawned = await p.writer.spawn("daily");
      dailyGames.set(p.name, spawned.gameId);
      expect(spawned.events.find((e) => e.name === "GameSpawned")?.fields.tournamentId).toBe(tournamentId);
      expect(before - (await client.balance(p.address))).toBe(price);
      expect((await client.views.tournament(tournamentId)).prize).toBe(prizeBefore + price);
      evidence.push(`${p.name} game ${spawned.gameId} ${short(spawned.transactionHash)}`);
    }
    pass("Daily: approve and spawn at entry_price", `price ${price}, tournament ${tournamentId}: ${evidence.join(", ")}`);
  }, 60_000);

  test("plays the Daily games to game over, with different move counts", async () => {
    const evidence: string[] = [];
    for (const [p, maxMoves] of [[players[0], 40], [players[1], 36], [players[2], 25]] as const) {
      const key: GameKey = { mode: "daily", gameId: dailyGames.get(p.name)! };
      const done = await playDaily(p, key, maxMoves);
      scores.set(p.name, done.score);
      evidence.push(`${p.name} ${done.moves} moves score ${done.score} ${short(done.hash)}`);
    }
    pass("Daily: play to game over", evidence.join(", "));
  }, 1_200_000);

  test("the indexer matches the contract views while the day is open", async () => {
    await caughtUp();
    const board = await indexer.leaderboard(tournamentId);
    const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
    expect(board.data.total).toBe(players.length);
    expect(board.data.entries.map((e) => e.bestScore)).toEqual(ranked.map(([, s]) => s));
    for (const e of board.data.entries) {
      const p = players.find((x) => BigInt(x.address) === BigInt(e.playerId))!;
      expect(e.name).toBe(p.name);
      expect(e.bestScore).toBe(scores.get(p.name));
      expect(e.bestGameId).toBe(dailyGames.get(p.name));
      expect(e.gamesFinished).toBe(1);
    }
    const view = await client.views.tournament(tournamentId);
    expect(view.over).toBe(false);
    expect(view.prize).toBe(prizeAtStart + price * BigInt(players.length));
    const detail = await indexer.tournament(tournamentId);
    expect(detail.data).toMatchObject({ id: tournamentId, startTime: view.startTime, endTime: view.endTime, gamesSpawned: players.length + (prizeAtStart > 0n ? 1 : 0), gamesFinished: 3, players: 3 });
    pass("indexer vs views, open day", `leaderboard ${board.data.entries.map((e) => `#${e.rank} ${e.name} ${e.bestScore} slots [${e.prizeRanks}]`).join(", ")}; prize ${view.prize}; behind ${board.behind}`);
  }, 60_000);

  test("ends the day with devnet time travel", async () => {
    const t = await chainTime();
    await rpc(rpcUrl, "devnet_increaseTime", { time: DAY - (t % DAY) + 5 });
    const next = await client.views.currentTournamentId();
    expect(next).toBe(tournamentId + 1);
    const view = await client.views.tournament(tournamentId);
    expect(view.over).toBe(true);
    tournamentAfter.view = view;
    pass("end the day (devnet_increaseTime)", `chain time ${t} -> ${await chainTime()}, current tournament ${tournamentId} -> ${next}, over ${view.over}`);
  }, 30_000);

  test("claims the prizes through the contract view", async () => {
    const view = tournamentAfter.view!;
    const evidence: string[] = [];
    let paid = 0n;
    for (const p of players) {
      for (const { rank, reward } of claimableRanks(view, p.address)) {
        const before = await client.balance(p.address);
        const result = await p.writer.claim(tournamentId, rank, { confirmedReward: reward });
        expect(await client.balance(p.address)).toBe(before + reward);
        paid += reward;
        evidence.push(`${p.name} rank ${rank} reward ${reward} ${short(result.transactionHash)}`);
      }
    }
    const after = await client.views.tournament(tournamentId);
    for (const rank of [1, 2, 3] as Rank[]) {
      const holder = [after.top1PlayerId, after.top2PlayerId, after.top3PlayerId][rank - 1];
      if (BigInt(holder) !== 0n) expect([after.top1Claimed, after.top2Claimed, after.top3Claimed][rank - 1]).toBe(true);
    }
    expect(paid).toBe(rewardOf(view, 1) + rewardOf(view, 2) + rewardOf(view, 3));
    expect(paid).toBe(view.prize);
    pass("claim prizes", `prize ${view.prize}, paid ${paid}: ${evidence.join(", ")}`);
  }, 60_000);

  test("the indexer matches the contract views once the day is closed", async () => {
    await caughtUp();
    const view = (await client.views.tournament(tournamentId));
    const board = await indexer.leaderboard(tournamentId);
    const slots = new Map<string, number[]>();
    [view.top1PlayerId, view.top2PlayerId, view.top3PlayerId].forEach((id, i) => {
      if (BigInt(id) !== 0n) slots.set(hex(id), [...(slots.get(hex(id)) ?? []), i + 1]);
    });
    for (const e of board.data.entries) expect(e.prizeRanks, `prize_ranks of ${e.name}`).toEqual(slots.get(hex(e.playerId)) ?? []);
    const top = [view.top1Score, view.top2Score, view.top3Score];
    board.data.entries.slice(0, 3).forEach((e, i) => expect(e.bestScore).toBe(top[i]));
    expect(board.data.entries.map((e) => e.rank)).toEqual(board.data.entries.map((_, i) => i + 1));
    const head = await indexer.head();
    expect(head.data.lastMismatch).toBeNull();
    pass("indexer vs views, closed day", `prize_ranks ${board.data.entries.map((e) => `${e.name}:[${e.prizeRanks}]`).join(" ")}; view tops ${[view.top1PlayerId, view.top2PlayerId, view.top3PlayerId].map(short).join(",")} scores ${top}; tournaments_checked ${head.data.tournamentsChecked}, last_mismatch ${head.data.lastMismatch}`);
  }, 60_000);

  test("the indexer's players and games match the views and the events", async () => {
    await caughtUp();
    const lines: string[] = [];
    for (const p of players) {
      const profile = await indexer.player(p.address);
      expect(profile.data.player?.name).toBe(p.name);
      expect(profile.data.stats).toMatchObject({ dailyGames: 1, dailyFinished: 1, bestScore: scores.get(p.name), tutorialGames: tutorialGames.has(p.name) ? 1 : 0 });
      const row = await indexer.playerTournament(p.address, tournamentId);
      expect(row.data).not.toBeNull();
      expect((row.data as LeaderboardEntry).bestScore).toBe(scores.get(p.name));

      const indexed = (await indexer.playerGames(p.address)).data.games;
      const fromEvents = await client.events.playerGames(p.address);
      expect(indexed.map((g) => [g.contract, g.gameId, g.over, g.score])).toEqual(
        expect.arrayContaining(fromEvents.map((g) => [g.mode, g.gameId, g.over, g.score ?? 0])),
      );
      expect(indexed).toHaveLength(fromEvents.length);
      for (const g of indexed as IndexedGame[]) {
        const view = await client.views.game({ mode: g.contract, gameId: g.gameId });
        expect(BigInt(view.playerId)).toBe(BigInt(p.address));
        expect(g).toMatchObject({ mode: view.mode, over: view.over, score: view.score, startTime: view.startTime, tournamentId: view.tournamentId });
        if (g.contract === "daily") expect(g.countedTournamentId).toBe(tournamentId);
        const one = (await indexer.game(g.contract, g.gameId)).data;
        // Daily and Tutorial both number their games from 1: the contract is part of the key.
        expect(one.gameId).toBe(g.gameId);
      }
      lines.push(`${p.name}: ${indexed.length} games, id ${short(indexerPlayerId(p.address))}`);
    }
    const unknown = await indexer.player(1n);
    expect(unknown.data.player).toBeNull();
    pass("indexer players and games vs views and events", lines.join("; "));
  }, 120_000);

  test("the smoke game of the deploy script is a running Tutorial game of the deployer", async () => {
    // deploy.sh plays no Daily game (P-24): its smoke game is Tutorial game 1, spawned by the deployer and never finished.
    // The step fails when it is missing: a node not deployed by scripts/deploy.sh is not what this check is run on.
    const predeployed: Array<{ address: string }> = await rpc(rpcUrl, "devnet_getPredeployedAccounts");
    const deployer = predeployed[0].address;
    expect((await indexer.playerGames(deployer, { contract: "daily" })).data.games).toEqual([]);
    const games = (await indexer.playerGames(deployer, { contract: "tutorial" })).data.games;
    expect(games.map((g) => g.gameId)).toEqual([1]);
    expect(games[0]).toMatchObject({ contract: "tutorial", over: false, score: 0, endTime: 0, countedTournamentId: 0, tournamentId: 0 });
    const view = await client.views.game({ mode: "tutorial", gameId: 1 });
    expect(BigInt(view.playerId)).toBe(BigInt(deployer));
    expect(view.over).toBe(false);
    pass("deployer's smoke game seen by the indexer", "Tutorial game 1, running: score 0, end_time 0 (null read as 0); no Daily game");
  });
});
