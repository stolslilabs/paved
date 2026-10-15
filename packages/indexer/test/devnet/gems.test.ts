/**
 * Gems v1 part 1 on a local starknet-devnet 0.10 (IX-GEMS1): `scripts/deploy.sh devnet` deploys the working tree, the owner
 * gives gems to Daily Run (quest 1) and to Settler I (achievement 2), one account plays a paid game, claims the quest, the
 * achievement and the day's credit, then spends the credit on a free game; a second account plays a paid game. The real
 * indexer (`src/main.ts`) follows live. The API must rank both players with the free game marked, and its gems, credits and
 * claims must equal the contract's own views (`Setup.account`, `Setup.day_progress`, `Setup.quest_gems`,
 * `Setup.achievement_gems`).
 *
 * Runs only with PAVED_DEVNET=1 (`bun run test:devnet`), as the scenario does; the same prerequisites, and one Cairo build at a
 * time (the deploy builds the contracts through the `scarb` shim).
 */
import { type ChildProcess, spawn } from "node:child_process";
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type {
  DefinitionsAnswer,
  GameAnswer,
  HeadAnswer,
  LeaderboardAnswer,
  PlayerClaimsAnswer,
  PlayerGamesAnswer,
  PlayerGemsAnswer,
} from "../../src/api.ts";
import { padded } from "../../src/events.ts";
import { deploy, Game, type Node, type Player, players, ROOT, rpc, startNode, writtenFile } from "./devnet.ts";

const enabled = process.env.PAVED_DEVNET === "1";
const NODE_PORT = Number(process.env.DEVNET_GEMS_PORT || 5073);
const API_PORT = 8790;
const MAIN = resolve(import.meta.dirname, "../../src/main.ts");
const COMMITTED = resolve(ROOT, "contracts/deployments/devnet.json");
const DAY = 86400;

describe.skipIf(!enabled)("devnet gems and free games", () => {
  let node: Node;
  let work: string;
  let committed: string;
  let deployment: { contracts: Record<"Challenge" | "Setup" | "Economy" | "Faucet", { address: string }> };
  let owner: Player;
  let alice: Player;
  let bo: Player;
  let indexer: ChildProcess | undefined;
  const get = async <T>(path: string): Promise<T> => {
    const response = await fetch(`http://127.0.0.1:${API_PORT}${path}`);
    if (!response.ok) throw new Error(`GET ${path}: ${response.status}`);
    return (await response.json()) as T;
  };
  const challenge = () => deployment.contracts.Challenge.address;
  const setup = () => deployment.contracts.Setup.address;
  const send = (p: Player, address: string, entrypoint: string, calldata: (string | number | bigint)[] = []) =>
    p.send({ contractAddress: address, entrypoint, calldata });
  const u256 = (low: bigint, high: bigint) => low + (high << 128n);
  const caught = async () => {
    const target = (await rpc(node.url, "starknet_blockNumber")) as number;
    const deadline = Date.now() + 60_000;
    for (;;) {
      try {
        const head = await get<HeadAnswer>("/v1/head");
        if (head.status === "ok" && head.head.number >= target && head.behind === 0) return head;
      } catch {
        // not listening yet
      }
      if (Date.now() > deadline) throw new Error(`the indexer did not reach block ${target}`);
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  };
  /** A paid game, as the scenario buys it: approve, quote, `spawn(1, 0, min_out)`. */
  const spawnPaid = async (p: Player): Promise<Game> => {
    const economy = deployment.contracts.Economy.address;
    const [token, low, high] = await p.call(challenge(), "entry_price");
    await send(p, `0x${token!.toString(16)}`, "approve", [challenge(), u256(low!, high!), 0]);
    const quote = await p.call(economy, "quote", [1]);
    const swap = await p.call(economy, "quote_swap", [quote[2]!, quote[3]!]);
    const minOut = (u256(swap[0]!, swap[1]!) * 99n) / 100n;
    const receipt = await send(p, challenge(), "spawn", [1, 0, minOut & (2n ** 128n - 1n), minOut >> 128n]);
    const spawned = receipt.events.find((e) => BigInt(e.from_address) === BigInt(challenge()) && e.keys.length === 3)!;
    return new Game(p, challenge(), Number(BigInt(spawned.keys[1]!)));
  };
  /** A free game: `spawn_free()` spends one credit. */
  const spawnFree = async (p: Player): Promise<Game> => {
    const receipt = await send(p, challenge(), "spawn_free");
    const spawned = receipt.events.find((e) => BigInt(e.from_address) === BigInt(challenge()) && e.keys.length === 3)!;
    return new Game(p, challenge(), Number(BigInt(spawned.keys[1]!)));
  };
  const over = async (p: Player, id: number) => {
    const g = await p.call(challenge(), "game", [id]);
    return { score: Number(g[4]), over: g[5] === 1n };
  };
  /** Builds up to `moves` tiles (a discard when the tile fits nowhere), then gives up. */
  const play = async (g: Game, moves: number, p: Player) => {
    for (let i = 0; i < moves; i++) {
      if (!(await g.build()) && !(await g.discard())) break;
      if ((await over(p, g.id)).over) return;
    }
    if (!(await over(p, g.id)).over) await send(p, challenge(), "surrender", [g.id]);
  };

  beforeAll(async () => {
    work = mkdtempSync(join(tmpdir(), "paved-devnet-gems-"));
    committed = readFileSync(COMMITTED, "utf8");
    node = await startNode(NODE_PORT, 42);
    let written: string | null = null;
    try {
      process.env.PAVED_DEPLOY_UNMERGED ??= "1"; // a pull request's sources
      written = writtenFile(deploy(node.url));
    } finally {
      writeFileSync(join(work, "devnet.json"), readFileSync(written ?? COMMITTED, "utf8"));
      writeFileSync(COMMITTED, committed);
    }
    deployment = JSON.parse(readFileSync(join(work, "devnet.json"), "utf8"));
    [owner, bo, alice] = (await players(node.url, 3)) as [Player, Player, Player];
    for (const p of [alice, bo]) await send(p, deployment.contracts.Faucet.address, "mint", [p.address, 100_000_000n, 0]);
    const log = openSync(join(work, "indexer.log"), "a");
    indexer = spawn(
      process.execPath,
      [MAIN, "run", "--deployment", join(work, "devnet.json"), "--db", join(work, "a.db"), "--port", String(API_PORT), "--poll", "200", "--rate", "0", "--no-names"],
      { stdio: ["ignore", log, log], env: { PATH: process.env.PATH ?? "" } },
    );
    closeSync(log);
  }, 3_000_000); // the deploy builds and declares every class: far above the config's 300 s

  afterAll(() => {
    indexer?.kill("SIGTERM");
    node?.stop();
    if (committed !== undefined) writeFileSync(COMMITTED, committed);
    if (work) rmSync(work, { recursive: true, force: true });
  });

  test("a paid game, the claims, a credit, a free game: the API equals the contract's views", async () => {
    const aliceAddress = padded(alice.address);
    const boAddress = padded(bo.address);
    // The owner (the deployer) gives gems to Daily Run (the only daily with gems, so one paid game completes the day) and to Settler I.
    // deploy.sh sets the gems of every fresh quest; the rotating dailies (5 to 13) are cleared so the day's credit needs Daily Run alone.
    for (let id = 5; id <= 13; id++) await send(owner, setup(), "set_quest_gems", [id, 0]);
    await send(owner, setup(), "set_quest_gems", [1, 5]);
    await send(owner, setup(), "set_achievement_gems", [2, 10]);

    // Alice (not the deployer, whose smoke game would be in her lists): a paid game she gives up, then her claims.
    const paid = await spawnPaid(alice);
    await play(paid, 0, alice);
    await caught();
    const paidOver = await get<GameAnswer>(`/v1/games/challenge/${paid.id}`);
    const gameOver = (await alice.call(challenge(), "game", [paid.id]))!;
    const day = Math.floor(Number(gameOver[14]) / DAY);
    expect(paidOver.game.free).toBe(false);
    await send(alice, setup(), "claim_quest", [1, day]);
    await send(alice, setup(), "claim_achievement", [2]);
    await send(alice, setup(), "claim_daily_credit", [day]);

    // Alice's free game, with a few moves; Bo's paid game, with more.
    const free = await spawnFree(alice);
    await play(free, 4, alice);
    const boGame = await spawnPaid(bo);
    await play(boGame, 2, bo);
    await caught();

    // The leaderboard of the day the games ended in: both players, the free game marked on the row of its best game.
    const board = await get<LeaderboardAnswer>(`/v1/tournaments/${day}/leaderboard`);
    const rows = new Map(board.entries.map((entry) => [entry.player_id, entry]));
    expect(board.total).toBe(2);
    const aliceRow = rows.get(aliceAddress)!;
    const boRow = rows.get(boAddress)!;
    const freeScore = (await over(alice, free.id)).score;
    const paidScore = (await over(alice, paid.id)).score;
    // Alice's best game is the higher of her two; the flag follows it (a tie goes to the earlier game, the paid one).
    expect(aliceRow.best_game_id).toBe(freeScore > paidScore ? free.id : paid.id);
    expect(aliceRow.free).toBe(freeScore > paidScore);
    expect(aliceRow.games_played).toBe(2);
    expect(boRow.free).toBe(false);
    // The games list marks the free game and leaves it in: no purchase, no economy.
    const games = await get<PlayerGamesAnswer>(`/v1/players/${aliceAddress}/games`);
    expect(games.games.map((g) => [g.game_id, g.free, g.economy === null])).toEqual([
      [free.id, true, true],
      [paid.id, false, false],
    ]);
    expect(games.games[0]).toMatchObject({ over: true, score: freeScore, token_id: free.id });
    // Only bought games count for Economy.
    const aliceInfo = await get<{ stats: { challenge_games: number; paid_games: number }; unsettled: unknown[] }>(`/v1/players/${aliceAddress}`);
    expect(aliceInfo.stats).toMatchObject({ challenge_games: 2, paid_games: 1 });
    expect(aliceInfo.unsettled).toHaveLength(1); // the paid game only
    const dayEconomy = await get<{ economy: { games_purchased: number; games_recorded: number } }>(`/v1/tournaments/${day}`);
    expect(dayEconomy.economy).toMatchObject({ games_purchased: 2, games_recorded: 2 });

    // Gems, credits and claims against the contract's views. Account: gems, credits, games, forests, wonders, big, high, achievements_claimed.
    const account = await alice.call(setup(), "account", [alice.address]);
    const gems = await get<PlayerGemsAnswer>(`/v1/players/${aliceAddress}/gems`);
    expect(gems.gems).toBe(Number(account[0]));
    expect(gems.gems).toBe(15);
    expect(gems.credits).toBe(Number(account[1]));
    expect(gems.credits).toBe(0);
    expect(gems.credits_claimed).toBe(1);
    expect(gems.credits_spent).toBe(1);
    const claimedBits = account[account.length - 1]!;
    expect(gems.achievements_claimed).toEqual([2].filter((id) => ((claimedBits >> BigInt(id)) & 1n) === 1n));
    expect(gems.achievements_claimed).toEqual([2]);
    // Progress: games, structures, forests, points, claimed, credit. Quest 1 is bit 1; the credit bit is set.
    const progress = await alice.call(setup(), "day_progress", [alice.address, day]);
    const claims = await get<PlayerClaimsAnswer>(`/v1/players/${aliceAddress}/claims?day=${day}`);
    const questClaimed = ((progress[4]! >> 1n) & 1n) === 1n;
    expect(questClaimed).toBe(true);
    expect(claims.claims.some((c) => c.kind === "quest" && c.id === 1 && c.period === day)).toBe(questClaimed);
    expect(progress[5]).toBe(1n);
    expect(claims.credits.some((c) => c.kind === "daily" && c.period === day)).toBe(true);
    // Bo claimed nothing.
    const boAccount = await bo.call(setup(), "account", [bo.address]);
    expect(await get<PlayerGemsAnswer>(`/v1/players/${boAddress}/gems`)).toMatchObject({
      gems: Number(boAccount[0]),
      credits: Number(boAccount[1]),
    });
    // The amounts per quest and per achievement against `quest_gems` and `achievement_gems`.
    const definitions = await get<DefinitionsAnswer>("/v1/definitions");
    const questGems = await owner.call(setup(), "quest_gems", [1]);
    const achievementGems = await owner.call(setup(), "achievement_gems", [2]);
    expect(definitions.quests.find((q) => q.quest_id === 1)).toMatchObject({ gems: Number(questGems[0]), gems_kind: "daily" });
    expect(definitions.achievements.find((a) => a.achievement_id === 2)!.gems).toBe(Number(achievementGems[0]));
  });
});
