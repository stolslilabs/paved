/**
 * End-to-end check of the client on a local devnet, through the client's own code (PavedClient,
 * PavedWriter, EconomyWriter, GameViews, EventReader, IndexerClient), no browser. It covers the economy (P8): the faucet,
 * a paid purchase with a referrer, play, the settlement, the Vault and an expired game. On demand only: `PAVED_E2E=1`
 * (`bun run test:e2e`). CI has no devnet.
 *
 * alice plays her Daily game with the search player of `daily-player.ts` and must score above the day's threshold, so
 * her settlement mints a positive PAVED reward, checked against `R x h(score / mean)` (`economy-curve.ts`); bob and
 * carol play naively and stay under it (reward 0). carol then stakes her own 1,000 test PAVED (P-38) in the Vault.
 *
 * It does not start anything. Start the stack first (packages/README.md, "End-to-end check on devnet"):
 *   starknet-devnet --host 127.0.0.1 --port 5050 --seed 42     # fresh node
 *   scripts/deploy.sh devnet                                   # writes contracts/deployments/devnet.json
 *   node packages/indexer/src/main.ts run --deployment contracts/deployments/devnet.json --db <file> --port 8787
 * The node must be fresh (the test moves its clock several days forward), and the three players are the
 * predeployed accounts 1 to 3 (account 0 is the deployer, whose smoke game stays in the chain).
 *
 * Env: `E2E_DEPLOYMENT` (file, default contracts/deployments/devnet.json), `E2E_INDEXER_URL` (default
 * http://127.0.0.1:8787), `E2E_TABLE` (a path: the table of steps and evidence is written there, markdown).
 */
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Account, RpcProvider } from "starknet";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { FAUCET_USDC_AMOUNT } from "../src/abis";
import { sameAddress, type DecodedEvent } from "../src/codec";
import { resolveDeployment, type DeploymentFile } from "../src/deployment";
import {
  createEconomyClient,
  expiresAt,
  resolveEconomyDeployment,
  settlesAfter,
  type EconomyClient,
  type EconomyDeploymentFile,
  type EconomyWriter,
} from "../src/economy";
import { IndexerClient, indexerPlayerId, type IndexedGame, type LeaderboardEntry } from "../src/indexer";
import { PavedClient, type PavedRpc } from "../src/paved-client";
import { placementOutcome } from "../src/placement";
import { TILE_STATUS, type GameKey } from "../src/views";
import { type BuildMove, type PavedWriter } from "../src/writer";
import { DailyPlayer } from "./daily-player";
import { dayMean, payout, threshold } from "./economy-curve";

const enabled = process.env.PAVED_E2E === "1";
const DAY = 86400;
const REPO = resolve(__dirname, "../../..");

interface Player {
  name: string;
  address: string;
  account: Account;
  writer: PavedWriter;
  econ: EconomyWriter;
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

const short = (h: string) => `${h.slice(0, 10)}…${h.slice(-4)}`;

describe.skipIf(!enabled)("client end-to-end on devnet", () => {
  let rpcUrl: string;
  let provider: RpcProvider;
  let client: PavedClient;
  let indexer: IndexerClient;
  let players: Player[];
  let price: bigint;
  let dayId: number;
  const dailyGames = new Map<string, number>(); // player name -> daily game id
  const tutorialGames = new Map<string, number>();
  const scores = new Map<string, number>(); // player name -> final Daily score
  let economy: EconomyClient;
  const stakes = new Map<string, number>(); // player name -> stake k
  const settledReward = new Map<string, bigint>();
  let prior = 0; // the day's prior, points x 1,000
  let cliff = 0n; // the threshold the settlement will use, points x 1,000
  let bobSecondGame = 0;

  const pass = (step: string, evidence: string) => steps.push({ step, pass: true, evidence });

  const usdc = (address: string) => economy.views.usdcBalance(address);
  const paved = (address: string) => economy.views.pavedBalance(address);
  const pavedSupply = async (): Promise<bigint> => {
    const codec = economy.codecs.PavedToken;
    const felts = await provider.callContract({ contractAddress: economy.deployment.addresses.PavedToken, entrypoint: "total_supply", calldata: [] });
    return codec.decodeResult("total_supply", felts) as bigint;
  };
  /** The events of the Economy in a transaction's receipt, decoded with its ABI (the writer returns Daily's). */
  async function economyEvents(hash: string): Promise<DecodedEvent[]> {
    const receipt = (await provider.getTransactionReceipt(hash)) as unknown as { events?: Array<{ from_address: string; keys: string[]; data: string[] }> };
    return (receipt.events ?? []).flatMap((raw) =>
      sameAddress(raw.from_address, economy.deployment.addresses.Economy) ? (economy.codecs.Economy.decodeEvent(raw) ?? []) : [],
    );
  }
  const advance = async (seconds: number) => rpc(rpcUrl, "devnet_increaseTime", { time: seconds });
  /** Moves the node past the end of the chain's current day, `extra` seconds into the next. */
  const toNextDay = async (extra = 5) => {
    const t = await chainTime();
    await advance(DAY - (t % DAY) + extra);
  };

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
      calldata: client.codecs.Daily.encodeCall("build", [key.gameId, move.orientation, move.x, move.y]),
    };
    try {
      await player.account.estimateInvokeFee([call], { tip: 0n });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * The naive player (bob and carol): a Daily game for at most `maxMoves` placements, a legal placement next to the tiles placed
   * (found by probing the node), then sent through the writer. It
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
            const move = { orientation, x, y };
            if (!(await legal(player, key, move))) continue;
            chosen = move;
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
    expect(deployment.mockUsdc).not.toBe("");
    rpcUrl = deployment.rpcUrl;
    provider = new RpcProvider({ nodeUrl: rpcUrl });
    client = new PavedClient(deployment, provider as unknown as PavedRpc);
    const economyDeployment = resolveEconomyDeployment({ base: deployment, file: file as EconomyDeploymentFile });
    expect(economyDeployment.configured, economyDeployment.missing.join(", ")).toBe(true);
    economy = createEconomyClient(economyDeployment, client)!;
    indexer = new IndexerClient({ url: process.env.E2E_INDEXER_URL ?? "http://127.0.0.1:8787" });

    const predeployed: Array<{ address: string; private_key: string }> = await rpc(rpcUrl, "devnet_getPredeployedAccounts");
    players = ["alice", "bob", "carol"].map((name, i) => {
      const a = predeployed[i + 1];
      const account = new Account({ provider, address: a.address, signer: a.private_key });
      const writer = client.writer(account, { tip: 0n });
      return { name, address: a.address, account, writer, econ: economy.writer(writer) };
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
    pass("deployment, node and indexer agree", `chain ${head.data.chainId}, from_block ${head.data.fromBlock}, indexer head ${head.head.number}`);
  });

  test("creates three players", async () => {
    const hashes: string[] = [];
    for (const p of players) {
      expect(await client.player(p.address)).toBeNull();
      expect(await usdc(p.address)).toBe(0n);
      const result = await p.writer.createPlayer(p.name, { mintTestToken: true });
      expect(result.events.map((e) => e.name)).toEqual(["PlayerCreated"]);
      // The faucet is MockUSDC.mint(self, N): the entry token, not the old Token.
      expect(await usdc(p.address)).toBe(FAUCET_USDC_AMOUNT);
      expect(await client.balance(p.address)).toBe(FAUCET_USDC_AMOUNT);
      expect((await client.player(p.address))?.name).toBe(p.name);
      hashes.push(`${p.name} ${short(result.transactionHash)}`);
    }
    price = (await client.views.entryPrice()).amount;
    expect(price).toBeGreaterThan(0n);
    pass("faucet: MockUSDC.mint(self, N) through createPlayer", `${FAUCET_USDC_AMOUNT} base units each; ${hashes.join(", ")}`);
  }, 60_000);

  test("spawns a Tutorial game and plays it to game over", async () => {
    const [alice] = players;
    const spawned = await alice.writer.spawn("tutorial");
    tutorialGames.set(alice.name, spawned.gameId);
    const key: GameKey = { mode: "tutorial", gameId: spawned.gameId };
    let moves = 0;
    let hash = spawned.transactionHash;
    for (let game = await client.views.game(key); !game.over && moves < 20; game = await client.views.game(key)) {
      const result = await alice.writer.build(key, { orientation: 0, x: 0, y: 0 }).catch((error) => {
        if (!String(error?.message).includes("Orientation: not valid")) throw error;
        return alice.writer.discard(key);
      });
      hash = result.transactionHash;
      moves++;
    }
    const game = await client.views.game(key);
    expect(game.over).toBe(true);
    expect(game.dayId).toBe(0);
    pass("Tutorial: spawn and play to game over", `game ${key.gameId}, ${moves} moves, score ${game.score}, spawn ${short(spawned.transactionHash)}, last ${short(hash)}`);
  }, 120_000);

  test("buys three Daily games with stake k and a referrer, and the price, burn, referral and margin match the balances", async () => {
    dayId = await client.views.currentDay();
    const [alice, bob, carol] = players;
    const plan: Array<[Player, number, Player | null]> = [[alice, 3, bob], [bob, 2, null], [carol, 1, alice]];
    const vaultAddress = economy.deployment.addresses.Vault;
    const evidence: string[] = [];
    for (const [p, k, referrer] of plan) {
      const quote = await economy.views.quote(k);
      expect(quote.price).toBe(price * BigInt(k));
      const refAddress = referrer?.address ?? null;
      const before = {
        player: await usdc(p.address),
        referrer: referrer ? await usdc(referrer.address) : 0n,
        vault: await usdc(vaultAddress),
        supply: await pavedSupply(),
      };
      const planned = await p.econ.planPurchase({ stake: k, confirmedPrice: quote.price, confirmedMinOut: 1n, referrer: refAddress });
      // The floor the player confirmed: the plan's own min_out, as the purchase screen carries it.
      const bought = await p.econ.purchase({ stake: k, confirmedPrice: quote.price, confirmedMinOut: planned.minOut, referrer: refAddress });
      dailyGames.set(p.name, bought.gameId);
      stakes.set(p.name, k);
      expect(bought.events.find((e) => e.name === "GameSpawned")?.fields.dayId).toBe(dayId);
      const purchased = (await economyEvents(bought.transactionHash)).find((e) => e.name === "Purchased")!;
      expect(purchased, "Economy.Purchased in the receipt").toBeDefined();
      const f = purchased.fields as Record<string, bigint | number | string>;
      const burnedQuote = BigInt(f.burnedQuote as bigint);
      const burned = BigInt(f.burned as bigint);
      const referral = BigInt(f.referral as bigint);
      const margin = BigInt(f.margin as bigint);
      // price: the player paid exactly k x unit
      expect(before.player - (await usdc(p.address))).toBe(quote.price);
      expect(BigInt(f.price as bigint)).toBe(quote.price);
      expect(Number(f.stake)).toBe(k);
      // referral: 5 % of the price, paid to the referrer, out of the margin
      expect(referral).toBe(referrer ? quote.referral : 0n);
      if (referrer) expect(referral).toBe((quote.price * 500n) / 10_000n);
      expect((referrer ? await usdc(referrer.address) : 0n) - before.referrer).toBe(referral);
      // margin: to the Vault, on the same call
      expect((await usdc(vaultAddress)) - before.vault).toBe(margin);
      expect(margin).toBe(quote.margin - referral);
      // burn: the USDC swapped (burn_quote) buys PAVED, which is burned; the swap respects min_out
      expect(burnedQuote).toBe(quote.burnQuote);
      expect(before.supply - (await pavedSupply())).toBe(burned);
      expect(burned).toBeGreaterThanOrEqual(planned.minOut);
      expect(burnedQuote + referral + margin).toBe(quote.price);
      const terms = await economy.views.terms(bought.gameId);
      expect(terms).toMatchObject({ stake: k, recorded: false, settled: false, expired: false });
      expect(BigInt(terms.player)).toBe(BigInt(p.address));
      evidence.push(`${p.name} k=${k} game ${bought.gameId} price ${quote.price} = burn ${burnedQuote} (-> ${burned} PAVED burned, min_out ${planned.minOut}) + referral ${referral} + margin ${margin}, ${short(bought.transactionHash)}`);
    }
    pass("buy: approve + spawn with stake k and referrer; price, burn, referral, margin vs balances", `day ${dayId}: ${evidence.join("; ")}`);
  }, 120_000);

  test("the threshold the settlement will use: the day's prior and the formula", async () => {
    // Option B (economy.md section 2): the day's mean blends its prior (the EMA at its first purchase, weight 100)
    // with its games (stake x min(score, 4 x prior)); the threshold is that mean shifted by sigma.
    const day = await economy.views.day(dayId);
    const quote = await economy.views.quote(1);
    const terms = await economy.views.terms(dailyGames.get(players[0].name)!);
    prior = day.prior;
    expect(day.closed).toBe(false);
    expect(prior).toBeGreaterThan(0);
    // Before any game of the day is in, the threshold is the prior's (the quote shows the same reference).
    expect(threshold(dayMean(prior, []), terms.sigmaBps)).toBe(BigInt(quote.threshold));
    pass("threshold before play", `day ${dayId}: prior ${prior / 1000} points, sigma ${terms.sigmaBps} bps, c ${terms.slopeBps} bps, H ${terms.cap}: threshold now ${quote.threshold / 1000} points (Quote.threshold), and the day's games move it by stake x min(score, 4 x prior) at weight 100 + sum k`);
  }, 30_000);

  test("plays the Daily games to game over: alice with the search player, bob and carol naively", async () => {
    const evidence: string[] = [];
    // alice (stake 3) plays the whole game with the player of daily-player.ts, which asks the node for every candidate.
    {
      const [alice] = players;
      const key: GameKey = { mode: "daily", gameId: dailyGames.get(alice.name)! };
      const player = new DailyPlayer({ rpcUrl, client, daily: client.deployment.addresses.Daily, codec: client.codecs.Daily, address: alice.address, writer: alice.writer });
      const done = await player.play(key, {
        onMove: process.env.E2E_VERBOSE ? (line) => appendFileSync(process.env.E2E_VERBOSE!, `alice ${line}\n`) : undefined,
      });
      scores.set(alice.name, done.score);
      const terms = await economy.views.terms(key.gameId);
      expect(terms).toMatchObject({ recorded: true, expired: false, settled: false, score: done.score });
      evidence.push(`alice (search player) ${done.moves} moves ${done.discards} discards score ${done.score} in ${(done.ms / 1000).toFixed(0)} s, ${done.simulations} simulations, recorded ${short(done.hash)}`);
    }
    for (const [p, maxMoves] of [[players[1], 36], [players[2], 25]] as const) {
      const key: GameKey = { mode: "daily", gameId: dailyGames.get(p.name)! };
      const done = await playDaily(p, key, maxMoves);
      scores.set(p.name, done.score);
      const terms = await economy.views.terms(key.gameId);
      // The game is recorded in the Economy when it ends, with its score (the settlement reads it).
      expect(terms).toMatchObject({ recorded: true, expired: false, settled: false, score: done.score });
      evidence.push(`${p.name} ${done.moves} moves score ${done.score} recorded ${short(done.hash)}`);
    }
    // The threshold the settlement will use, from the formula: alice must beat it, bob and carol stay under it.
    const games = players.map((p) => ({ score: scores.get(p.name)!, stake: stakes.get(p.name)! }));
    cliff = threshold(dayMean(prior, games), (await economy.views.terms(dailyGames.get(players[0].name)!)).sigmaBps);
    expect(BigInt(scores.get("alice")!) * 1000n, `alice's score against the threshold ${cliff / 1000n}`).toBeGreaterThanOrEqual(cliff);
    expect(BigInt(scores.get("bob")!) * 1000n).toBeLessThan(cliff);
    expect(BigInt(scores.get("carol")!) * 1000n).toBeLessThan(cliff);
    pass("Daily: play to game over; the game is recorded in the Economy", `${evidence.join(", ")}; threshold from the formula ${Number(cliff) / 1000} points: alice above, bob and carol below`);
  }, 1_800_000);

  test("the indexer matches the contract views while the day is open", async () => {
    await caughtUp();
    const board = await indexer.leaderboard(dayId);
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
    expect(await client.views.currentDay()).toBe(dayId);
    const detail = await indexer.tournament(dayId);
    expect(detail.data).toMatchObject({ id: dayId, startTime: dayId * DAY, endTime: (dayId + 1) * DAY, gamesSpawned: players.length, gamesFinished: 3, players: 3 });
    pass("indexer vs views, open day", `leaderboard ${board.data.entries.map((e) => `#${e.rank} ${e.name} ${e.bestScore}`).join(", ")}; behind ${board.behind}`);
  }, 60_000);

  test("ends the day with devnet time travel", async () => {
    const t = await chainTime();
    await rpc(rpcUrl, "devnet_increaseTime", { time: DAY - (t % DAY) + 5 });
    const next = await client.views.currentDay();
    expect(next).toBe(dayId + 1);
    // A bought game settles after the end of the NEXT day (P-34): now, one day too early, the writer sends nothing.
    const [alice] = players;
    const blockBefore = (await provider.getBlockNumber()) as number;
    const early = await alice.econ.settle([dailyGames.get(alice.name)!]).catch((e: unknown) => e);
    expect(String((early as Error).message)).toMatch(/settles after/);
    expect((await provider.getBlockNumber()) as number).toBe(blockBefore);
    expect((await economy.views.terms(dailyGames.get(alice.name)!)).settled).toBe(false);
    pass("end the day (devnet_increaseTime)", `chain time ${t} -> ${await chainTime()}, current day ${dayId} -> ${next}`);
  }, 30_000);

  test("the indexer's leaderboard of the closed day: one row per player, ranked by best score", async () => {
    await caughtUp();
    const board = await indexer.leaderboard(dayId);
    const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
    expect(board.data.entries.map((e) => e.bestScore)).toEqual(ranked.map(([, score]) => score));
    expect(board.data.entries.map((e) => e.rank)).toEqual(board.data.entries.map((_, i) => i + 1));
    pass("indexer leaderboard, closed day", board.data.entries.map((e) => `#${e.rank} ${e.name} ${e.bestScore}`).join(", "));
  }, 60_000);

  test("the indexer's players and games match the views and the events", async () => {
    await caughtUp();
    const lines: string[] = [];
    for (const p of players) {
      const profile = await indexer.player(p.address);
      expect(profile.data.player?.name).toBe(p.name);
      expect(profile.data.stats).toMatchObject({ dailyGames: 1, dailyFinished: 1, bestScore: scores.get(p.name), tutorialGames: tutorialGames.has(p.name) ? 1 : 0 });
      const row = await indexer.playerTournament(p.address, dayId);
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
        expect(g).toMatchObject({ mode: view.mode, over: view.over, score: view.score, startTime: view.startTime, dayId: view.dayId });
        if (g.contract === "daily") expect(g.countedDayId).toBe(dayId);
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

  test("the deploy script's smoke games are the deployer's: a paid Daily game, finished and settled, and a running Tutorial game", async () => {
    // deploy.sh buys a paid Daily game (stake 1), plays it, settles it two days later and starts a Tutorial game.
    // The step fails when they are missing: a node not deployed by scripts/deploy.sh is not what this check is run on.
    const predeployed: Array<{ address: string }> = await rpc(rpcUrl, "devnet_getPredeployedAccounts");
    const deployer = predeployed[0].address;
    const daily = (await indexer.playerGames(deployer, { contract: "daily" })).data.games;
    expect(daily).toHaveLength(1);
    expect(daily[0]).toMatchObject({ contract: "daily", over: true });
    const smoke = await economy.views.terms(daily[0].gameId);
    expect(smoke).toMatchObject({ stake: 1, recorded: true, settled: true });
    const games = (await indexer.playerGames(deployer, { contract: "tutorial" })).data.games;
    expect(games).toHaveLength(1);
    expect(games[0]).toMatchObject({ contract: "tutorial", countedDayId: 0, dayId: 0 });
    const view = await client.views.game({ mode: "tutorial", gameId: games[0].gameId });
    expect(BigInt(view.playerId)).toBe(BigInt(deployer));
    pass("deployer's smoke games seen by the indexer", `Daily game ${daily[0].gameId} (stake 1, settled, reward ${smoke.reward}), Tutorial game ${games[0].gameId} over ${view.over}`);
  }, 120_000);

  test("past the end of the next day, each bought game settles and its PAVED reward is the chain's", async () => {
    await toNextDay(); // the end of D+1: the day of the purchases may be settled now (P-34)
    const evidence: string[] = [];
    for (const p of players) {
      const gameId = dailyGames.get(p.name)!;
      const before = await economy.views.terms(gameId);
      expect(before.settled).toBe(false);
      expect(await chainTime()).toBeGreaterThanOrEqual(settlesAfter(before.day));
      const balance = await paved(p.address);
      const result = await p.econ.settle([gameId]);
      const after = await economy.views.terms(gameId);
      expect(after.settled).toBe(true);
      const settled = (await economyEvents(result.transactionHash)).find((e) => e.name === "Settled")!;
      expect(BigInt(settled.fields.reward as bigint)).toBe(after.reward);
      expect((await paved(p.address)) - balance).toBe(after.reward);
      // The minted PAVED is R x h(score / mean) from the chain's own terms and the day's closed mean.
      const day = await economy.views.day(after.day);
      expect(day.closed).toBe(true);
      const dayCliff = threshold(BigInt(day.mean), after.sigmaBps);
      expect(dayCliff, "the settlement's threshold is the one computed before it").toBe(cliff);
      expect(after.reward).toBe(payout(after.reference, after.score, dayCliff, after.slopeBps, after.cap));
      settledReward.set(p.name, after.reward);
      evidence.push(`${p.name} k=${stakes.get(p.name)} score ${after.score} vs threshold ${Number(dayCliff) / 1000}: R ${after.reference} -> reward ${after.reward} PAVED${after.reward === 0n ? " (below the threshold: stake lost)" : ` = R x ${after.slopeBps} x ${after.score}000 / (${dayCliff} x 10000)`} (Settled = terms = balance change), ${short(result.transactionHash)}`);
      // settling twice sends nothing
      await expect(p.econ.settle([gameId])).rejects.toThrow(/already settled/);
    }
    // Both cases: a positive reward above the threshold, 0 below it.
    expect(settledReward.get("alice")).toBeGreaterThan(0n);
    expect(settledReward.get("bob")).toBe(0n);
    expect(settledReward.get("carol")).toBe(0n);
    pass("settle after D+1: PAVED reward = R x h(score / mean) (Settled event = terms = balance change), positive above the threshold, 0 below", evidence.join("; "));
  }, 120_000);

  test("the Vault: a test account stakes its own PAVED, earns dividends from a later purchase, claims them", async () => {
    const [, bob, carol] = players;
    // carol stakes the 1,000 test PAVED that deploy.sh gives each predeployed account but the deployer (P-38): her
    // own, not the deployer's stake. Her game was under the threshold, so that is all the PAVED she holds.
    const testPaved = 1_000n * 10n ** 18n;
    expect(settledReward.get(carol.name)).toBe(0n);
    expect(await paved(carol.address)).toBe(testPaved);
    const amount = testPaved;
    const staked = await carol.econ.stake(amount, { confirmedAmount: amount });
    const position = await economy.views.vault(carol.address);
    expect(position.staked).toBe(amount);
    expect(await paved(carol.address)).toBe(0n);
    expect(position.pending).toBe(0n);

    // A later purchase (bob, stake 1, no referrer: its whole margin goes to the Vault) earns dividends.
    // It is bob's second game: bought on the day D+2, never played (the expired game below).
    const quote = await economy.views.quote(1);
    const purchase = await bob.econ.purchase({ stake: 1, confirmedPrice: quote.price, confirmedMinOut: 1n, referrer: null });
    bobSecondGame = purchase.gameId;
    const margin = BigInt(((await economyEvents(purchase.transactionHash)).find((e) => e.name === "Purchased")!.fields as { margin: bigint }).margin);
    const earned = await economy.views.vault(carol.address);
    // carol's share of the margin, as the Vault accounts it: staked x (margin x 1e36 / total staked) / 1e36.
    const scale = 10n ** 36n;
    const share = (amount * ((margin * scale) / earned.totalStaked)) / scale;
    expect(earned.pending, "dividends pending after a later purchase").toBeGreaterThan(0n);
    expect(earned.pending).toBe(share);
    const before = await usdc(carol.address);
    const claimed = await carol.econ.claimDividends({ confirmedAmount: earned.pending });
    expect((await usdc(carol.address)) - before).toBe(earned.pending);
    expect((await economy.views.vault(carol.address)).pending).toBe(0n);
    pass("Vault: a test account stakes its own PAVED, dividends from a later purchase, claim", `carol staked her ${amount} test PAVED ${short(staked.transactionHash)}; bob's purchase margin ${margin} USDC -> carol's pending ${earned.pending} = ${amount} x (margin x 1e36 / ${earned.totalStaked}) / 1e36; claimed ${short(claimed.transactionHash)}, USDC +${earned.pending} = pending`);
  }, 120_000);

  test("a day nobody plays passes: the current day moves on", async () => {
    const before = await client.views.currentDay();
    await toNextDay(3600); // past the end of the day, and past 24 h after bob's purchase on it
    expect(await client.views.currentDay()).toBe(before + 1);
    pass("a day nobody plays", `current day ${before} -> ${before + 1}`);
  }, 120_000);

  test("a game bought and not played within 24 h is expired: no reward, no settle", async () => {
    const [, bob] = players;
    await toNextDay(); // past the end of the day after the purchase's, so that "too early" cannot be the reason
    const terms = await economy.views.terms(bobSecondGame);
    expect(terms).toMatchObject({ stake: 1, recorded: false, settled: false });
    const now = await chainTime();
    expect(now).toBeGreaterThanOrEqual(expiresAt(terms.time));
    expect(now).toBeGreaterThanOrEqual(settlesAfter(terms.day));
    const blockBefore = (await provider.getBlockNumber()) as number;
    const error = await bob.econ.settle([bobSecondGame]).catch((e: unknown) => e);
    expect((error as Error).message).toBe(`Game ${bobSecondGame} is expired: no reward`);
    expect((await provider.getBlockNumber()) as number).toBe(blockBefore);
    expect(await economy.views.terms(bobSecondGame)).toMatchObject({ settled: false, reward: 0n });
    pass("expired game: bought, not played within 24 h", `game ${bobSecondGame} bought at ${terms.time}, expired at ${expiresAt(terms.time)}, chain time ${now}: "Game ${bobSecondGame} is expired: no reward", settle sent nothing (block ${blockBefore} unchanged), terms settled false reward 0`);
  }, 60_000);

  test("the indexer ends in agreement with the chain", async () => {
    await caughtUp();
    const head = await indexer.head();
    expect(head.data.state).toBe("ok");
    pass("indexer after the economy steps", `head ${head.head.number}, state ${head.data.state}`);
  }, 60_000);
});
