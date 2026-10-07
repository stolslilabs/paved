/**
 * The whole path on a local starknet-devnet 0.10 (docs/architecture/indexer.md, "Devnet run and tests"): `scripts/deploy.sh
 * devnet` deploys the contracts on a seeded fresh node, three accounts play complete Daily games over two days, the indexer
 * (the real process, `src/main.ts`) follows live, is stopped and restarted mid-run, sees a replaced block, and a second
 * indexer rebuilt from the chain answers the same. The API is compared with the contracts' own views, and the cross-check
 * against the `tournament` view must report no mismatch.
 *
 * Runs only with PAVED_DEVNET=1 (`bun run test:devnet`): CI has no devnet. Needs `starknet-devnet` 0.10 (DEVNET_BIN, else the
 * asdf install), the toolchain of `scripts/deploy.sh`, and a built `contracts/` (the script builds it). Every process it
 * starts is stopped by its PID, and `contracts/deployments/devnet.json` is written back as it was.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { HeadAnswer, LeaderboardAnswer, PlayerGamesAnswer } from "../../src/api.ts";
import { padded } from "../../src/events.ts";
import { deploy, Game, type Node, type Player, players, ROOT, rpc, startNode } from "./devnet.ts";

const enabled = process.env.PAVED_DEVNET === "1";
const NODE_PORT = Number(process.env.DEVNET_PORT || 5072);
const API = [8788, 8789];
const MAIN = resolve(import.meta.dirname, "../../src/main.ts");
const COMMITTED = resolve(ROOT, "contracts/deployments/devnet.json");
const DAY = 86400;

describe.skipIf(!enabled)("devnet scenario", () => {
  let node: Node;
  let work: string;
  let committed: string;
  let deployment: { contracts: Record<"Account" | "Daily" | "Tutorial" | "Token", { address: string }> };
  let file: string;
  let alice: Player;
  let bo: Player;
  let cy: Player;
  const children = new Map<number, ChildProcess>();
  const api = (port: number) => async <T>(path: string): Promise<T> => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`);
    return (await response.json()) as T;
  };
  const get = api(API[0]!);

  const startIndexer = (command: "run" | "rebuild", port: number, db: string) => {
    const log = openSync(join(work, `indexer-${port}.log`), "a");
    const child = spawn(
      process.execPath,
      [MAIN, command, "--deployment", file, "--db", db, "--port", String(port), "--poll", "200", "--recheck-every", "500"],
      { stdio: ["ignore", log, log], env: { PATH: process.env.PATH ?? "" } },
    );
    closeSync(log);
    children.set(port, child);
    return child;
  };
  const stopIndexer = async (port: number) => {
    const child = children.get(port);
    if (!child || child.exitCode !== null) return;
    const exited = new Promise((resolve) => child.once("exit", resolve));
    child.kill("SIGTERM");
    await exited;
    children.delete(port);
  };
  const latest = async () => (await rpc(node.url, "starknet_blockNumber")) as number;
  const caught = async (port: number) => {
    const target = await latest();
    const deadline = Date.now() + 60_000;
    for (;;) {
      try {
        const head = await api(port)<HeadAnswer>("/v1/head");
        if (head.status === "ok" && head.head.number >= target && head.behind === 0) return head;
      } catch {
        // not listening yet
      }
      if (Date.now() > deadline) throw new Error(`indexer on ${port} did not reach block ${target}`);
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  };

  const send = (p: Player, address: string, entrypoint: string, calldata: (string | number | bigint)[] = []) =>
    p.send({ contractAddress: address, entrypoint, calldata });
  const register = async (p: Player, name: string) => {
    await send(p, deployment.contracts.Token.address, "mint");
    await send(p, deployment.contracts.Account.address, "create", [`0x${Buffer.from(name).toString("hex")}`, p.address]);
  };
  const spawn_ = async (p: Player): Promise<Game> => {
    const daily = deployment.contracts.Daily.address;
    const [token, low, high] = await p.call(daily, "entry_price");
    await send(p, `0x${token!.toString(16)}`, "approve", [daily, low!, high!]);
    const receipt = await send(p, daily, "spawn");
    const spawned = receipt.events.find((e) => BigInt(e.from_address) === BigInt(daily) && e.keys.length === 3)!;
    return new Game(p, daily, Number(BigInt(spawned.keys[1]!)));
  };
  const view = async (p: Player, id: number) => {
    const g = await p.call(deployment.contracts.Daily.address, "game", [id]);
    return { score: Number(g[4]), over: g[5] === 1n, startTime: Number(g[13]), endTime: Number(g[14]), tournamentId: Number(g[15]) };
  };
  /**
   * Plays `moves` placements (a character on the first `characters`), then gives up; `Infinity` plays the deck to its end,
   * which scores the characters' structures.
   */
  const play = async (g: Game, moves: number, characters: number, p: Player) => {
    for (let i = 0; i < moves; i++) {
      if (!(await g.build(i < characters))) break;
      if (moves === Infinity && (await view(p, g.id)).over) return;
    }
    if (!(await view(p, g.id)).over) await send(p, deployment.contracts.Daily.address, "surrender", [g.id]);
  };
  /** The API without what depends on the process (its head moves), for two indexers to compare. */
  const stable = async (port: number, paths: string[]) =>
    Promise.all(
      paths.map(async (path) => {
        const { head, behind: _behind, ...rest } = await api(port)<Record<string, unknown> & { head: unknown; behind: unknown }>(path);
        return { path, head, rest };
      }),
    );

  beforeAll(async () => {
    work = mkdtempSync(join(tmpdir(), "paved-devnet-"));
    committed = readFileSync(COMMITTED, "utf8");
    node = await startNode(NODE_PORT, 42, true);
    try {
      deploy(node.url);
    } finally {
      file = join(work, "devnet.json");
      writeFileSync(file, readFileSync(COMMITTED, "utf8"));
      writeFileSync(COMMITTED, committed); // the repository's file, as it was
    }
    deployment = JSON.parse(readFileSync(file, "utf8"));
    const accounts = await players(node.url, 3);
    alice = accounts[0]!;
    bo = accounts[1]!;
    cy = accounts[2]!;
  });

  afterAll(async () => {
    for (const port of [...children.keys()]) await stopIndexer(port);
    node?.stop();
    if (committed !== undefined) writeFileSync(COMMITTED, committed);
    if (work) rmSync(work, { recursive: true, force: true });
  });

  test("the indexer follows the deployment: the smoke game is in the API", async () => {
    startIndexer("run", API[0]!, join(work, "a.db"));
    const head = await caught(API[0]!);
    expect(head.from_block).toBeGreaterThan(0);
    expect(head.chain_id).toBe("0x534e5f5345504f4c4941");
    expect(BigInt(head.contracts.daily)).toBe(BigInt(deployment.contracts.Daily.address));
    const smoke = await get<PlayerGamesAnswer>(`/v1/players/${padded(alice.address)}/games`);
    expect(smoke.games).toMatchObject([{ contract: "daily", game_id: 1, over: false, score: null }]);
    expect((await get<{ player: { name: string } }>(`/v1/players/${padded(alice.address)}`)).player.name).toBe("smoke");
  });

  let day0 = 0;
  let late: Game;
  const played: { id: number; player: Player }[] = [];

  test("complete games of two players are ranked as the contract ranks them", async () => {
    await register(bo, "Bo");
    await register(cy, "Cy");
    day0 = Math.floor(Number((await view(alice, 1)).startTime) / DAY);
    const games: [Player, number, number][] = [
      [bo, Infinity, 3],
      [bo, 3, 3],
      [cy, Infinity, 6],
      [cy, 0, 0],
    ];
    for (const [p, moves, characters] of games) {
      const g = await spawn_(p);
      await play(g, moves, characters, p);
      played.push({ id: g.id, player: p });
    }
    late = await spawn_(cy); // left running across the end of the day
    await caught(API[0]!);

    for (const { id, player } of played) {
      const chain = await view(player, id);
      expect(chain.over).toBe(true);
      expect(chain.tournamentId).toBe(day0);
      const api_ = await get<{ game: { score: number; end_time: number; counted_tournament_id: number } }>(`/v1/games/daily/${id}`);
      expect(api_.game).toMatchObject({ score: chain.score, end_time: chain.endTime, counted_tournament_id: day0 });
    }
    const board = await get<LeaderboardAnswer>(`/v1/tournaments/${day0}/leaderboard`);
    const view_ = await alice.call(deployment.contracts.Daily.address, "tournament", [day0]);
    // TournamentView: id, start, end, over, prize (2), then player, score, claimed per rank.
    const slots = [0, 1, 2].map((rank) => ({ player: padded(view_[6 + rank * 3]!), score: Number(view_[7 + rank * 3]!) }));
    const chainSlots = slots.filter((slot) => slot.score > 0);
    expect(chainSlots.length).toBeGreaterThan(0);
    chainSlots.forEach((slot, index) => {
      const entry = board.entries.find((e) => e.player_id === slot.player);
      expect(entry?.prize_ranks, `slot ${index + 1}`).toContain(index + 1);
    });
    const claimed = board.entries.flatMap((e) => e.prize_ranks).sort();
    expect(claimed).toEqual(chainSlots.map((_, index) => index + 1));
    // One row per player, best game; ranks are 1..n in score order.
    expect(board.entries.map((e) => e.rank)).toEqual(board.entries.map((_, i) => i + 1));
    expect(board.entries.map((e) => e.best_score)).toEqual([...board.entries.map((e) => e.best_score)].sort((x, y) => y - x));
    const bos = board.entries.find((e) => e.player_id === padded(bo.address))!;
    expect(bos).toMatchObject({ games_played: 2, games_finished: 2, name: "Bo" });
    const cys = board.entries.find((e) => e.player_id === padded(cy.address));
    expect(cys).toMatchObject({ games_played: 3, games_finished: 2 }); // the running one counts as an entry only
  });

  test("a restart mid-run resumes from the stored tip; a game over after the day does not count", async () => {
    await stopIndexer(API[0]!);
    // While the indexer is down: the day ends, and the running game ends after it.
    await rpc(node.url, "devnet_increaseTime", { time: DAY });
    const lateOver = (await send(cy, deployment.contracts.Daily.address, "surrender", [late.id])).events.filter(
      (e) => BigInt(e.from_address) === BigInt(deployment.contracts.Daily.address) && e.keys.length === 4,
    );
    expect(lateOver).toHaveLength(1);
    expect(BigInt(lateOver[0]!.keys[3]!)).toBe(0n); // tournament_id 0: it did not count
    const next = await spawn_(alice);
    await play(next, 4, 3, alice);
    played.push({ id: next.id, player: alice });
    await rpc(node.url, "devnet_createBlock"); // a block after the last game, so the head is not the game's block

    startIndexer("run", API[0]!, join(work, "a.db"));
    const head = await caught(API[0]!);
    expect(head.checks.last_mismatch).toBeNull();
    const lateGame = await get<{ game: { counted_tournament_id: number; score: number } }>(`/v1/games/daily/${late.id}`);
    expect(lateGame.game.counted_tournament_id).toBe(0);
    const board = await get<LeaderboardAnswer>(`/v1/tournaments/${day0}/leaderboard`);
    expect(board.entries.find((e) => e.player_id === padded(cy.address))).toMatchObject({ games_played: 3, games_finished: 2 });
    const day1 = Math.floor(Number((await view(alice, next.id)).startTime) / DAY);
    expect(day1).toBe(day0 + 1);
    expect((await get<LeaderboardAnswer>(`/v1/tournaments/${day1}/leaderboard`)).entries).toMatchObject([
      { player_id: padded(alice.address), games_played: 1, games_finished: 1 },
    ]);
  });

  test("the cross-check against the tournament view ran for the closed day, with no mismatch", async () => {
    const deadline = Date.now() + 30_000;
    let head = await get<HeadAnswer>("/v1/head");
    while (head.checks.tournaments_checked < 1 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      head = await get<HeadAnswer>("/v1/head");
    }
    expect(head.checks.tournaments_checked).toBeGreaterThanOrEqual(1);
    expect(head.checks.last_mismatch).toBeNull();
  });

  test("a replaced block is rewound, and the answers follow the new chain", async () => {
    const before = await caught(API[0]!);
    const tip = await latest();
    await rpc(node.url, "devnet_abortBlocks", { starting_block_id: { block_number: tip } });
    // The aborted block was empty (devnet_createBlock): the replacement holds a game, so the old tip's commitments are gone.
    const g = await spawn_(bo);
    await rpc(node.url, "devnet_createBlock");
    const head = await caught(API[0]!);
    expect(head.head.number).toBeGreaterThanOrEqual(before.head.number);
    const mine = await get<PlayerGamesAnswer>(`/v1/players/${padded(bo.address)}/games?contract=daily&limit=1`);
    expect(mine.games[0]).toMatchObject({ game_id: g.id, over: false });
    expect(head.checks.last_mismatch).toBeNull();
  });

  test("an indexer rebuilt from the chain answers what the one that followed it answers", async () => {
    const followed = await caught(API[0]!);
    startIndexer("rebuild", API[1]!, join(work, "b.db"));
    await caught(API[1]!);
    const day1 = day0 + 1;
    const paths = [
      "/v1/tournaments",
      `/v1/tournaments/${day0}`,
      `/v1/tournaments/${day0}/leaderboard`,
      `/v1/tournaments/${day1}/leaderboard`,
      ...[alice, bo, cy].flatMap((p) => [`/v1/players/${padded(p.address)}`, `/v1/players/${padded(p.address)}/games`]),
    ];
    const first = await stable(API[0]!, paths);
    const second = await stable(API[1]!, paths);
    expect((await get<HeadAnswer>("/v1/head")).head.hash).toBe(followed.head.hash);
    expect(second).toEqual(first);
    expect(first.find((r) => r.path.endsWith("/leaderboard"))!.rest).toHaveProperty("entries");
    if (process.env.PAVED_TRANSCRIPT) {
      const answers = [...(await stable(API[0]!, ["/v1/head", ...paths])), ...(await stable(API[0]!, [`/v1/tournaments/${day0}/leaderboard?limit=2`]))];
      writeFileSync(process.env.PAVED_TRANSCRIPT, JSON.stringify(answers, null, 2));
    }
    await stopIndexer(API[1]!);
    await stopIndexer(API[0]!);
  });
});
