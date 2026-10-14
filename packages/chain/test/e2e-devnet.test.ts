/**
 * End-to-end check of the client on a local devnet, through the client's own code (PavedClient,
 * PavedWriter, EconomyWriter, GameViews, EventReader, IndexerClient), no browser. It covers the economy (P8): the faucet,
 * a paid purchase with a referrer, play, the settlement, the Vault and an expired game. On demand only: `PAVED_E2E=1`
 * (`bun run test:e2e`). CI has no devnet.
 *
 * Each Challenge game's deck, and so every score, comes from its token id since D-23b (Poseidon(0, Challenge's address,
 * game id), no longer the UTC day): the test proves the same economics whatever the decks of the game ids the node hands out, on any day.
 * alice plays her Challenge game with the search player of `challenge-player.ts` and must score above the day's threshold, so
 * her settlement mints a positive PAVED reward, checked against `R x h(score / mean)` (`economy-curve.ts`); the test
 * fails, naming the day, the game ids and the scores, on a deck where she does not. bob and carol cannot reach the threshold whatever
 * the deck: they stop after a handful of placements (`NAIVE_MAX_MOVES`) and surrender, and their scores are checked
 * against a floor under any threshold of the day (the prior alone, diluted by every stake), so their reward is 0.
 * carol then deposits her own 1,000 test PAVED (P-38) in the Vault (vPAVED, P-56): a later purchase's margin raises its
 * rate with no share minted, and her withdraws pay the exit fee, which stays in the Vault.
 *
 * It does not start anything. Start the stack first (packages/README.md, "End-to-end check on devnet"):
 *   starknet-devnet --host 127.0.0.1 --port 5050 --seed 42     # fresh node
 *   scripts/deploy.sh devnet                                   # writes contracts/deployments/devnet.json
 *   node packages/indexer/src/main.ts run --deployment contracts/deployments/devnet.json --db <file> --port 8787 --no-names
 * The node must be fresh (the test moves its clock several days forward), and the three players are the
 * predeployed accounts 1 to 3 (account 0 is the deployer, whose smoke game stays in the chain).
 *
 * Env: `E2E_DEPLOYMENT` (file, default contracts/deployments/devnet.json), `E2E_INDEXER_URL` (default
 * http://127.0.0.1:8787), `E2E_TABLE` (a path: the table of steps and evidence is written there, markdown).
 */
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { EngineGame } from "@paved/game-core";
import { Account, RpcProvider, hash } from "starknet";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { FAUCET_USDC_AMOUNT } from "../src/abis";
import { sameAddress, type DecodedEvent } from "../src/codec";
import { resolveDeployment, type DeploymentFile } from "../src/deployment";
import {
  PoolPriceMovedError,
  VaultOverMaxWithdrawError,
  createEconomyClient,
  vaultRate,
  expiresAt,
  resolveEconomyDeployment,
  RefusedReferrerError,
  SpawnPausedError,
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
import { ChallengePlayer } from "./challenge-player";
import { dayMean, payout, PRIOR_WEIGHT, threshold } from "./economy-curve";

const enabled = process.env.PAVED_E2E === "1";
const DAY = 86400;
const REPO = resolve(__dirname, "../../..");
/** Placements the naive players make before they surrender: too few to score near any day's threshold. */
const NAIVE_MAX_MOVES: Record<string, number> = { bob: 3, carol: 2 };
/**
 * The token ids the scenario buys on a fresh seed-42 node after `deploy.sh devnet` (D-23b): a Challenge game's token id
 * is its game id, drawn from Challenge's counter, and the deploy's smoke game takes the first. So the decks are known.
 */
const EXPECTED_GAME_IDS: Record<string, number> = { alice: 2, bob: 3, carol: 4 };
/** bob's second game, bought on the day D+2 and never played (the expired game). */
const EXPECTED_BOB_SECOND_GAME = 5;
/** The salt of every game (`Game::new` sets 0). */
const SALT = 0n;
/**
 * A Challenge game's seed since D-23b: Poseidon(salt, the Challenge contract, token id), the token id being the game id
 * (`TokenSeed`, `contracts/src/seed.cairo`). The contract's address is the deployment file's: on a fresh seed-42 node it is
 * deterministic too, so are the decks.
 */
const tokenSeed = (challenge: string, gameId: number): bigint =>
  BigInt(hash.computePoseidonHashOnElements([SALT, BigInt(challenge), BigInt(gameId)]));
/**
 * The seed the game view shows right after the spawn: the stored seed is the one after the first draw (`spawn_with` starts
 * the game and draws the tile in hand, which moves the seed on), so the spawn is replayed off chain from `tokenSeed` with
 * the engine, which the parity goldens pin to the contract.
 */
const spawnedSeed = (challenge: string, gameId: number): bigint => EngineGame.start({ deck: "simple", seed: tokenSeed(challenge, gameId) }).seed;

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
  const challengeGames = new Map<string, number>(); // player name -> challenge game id
  const scores = new Map<string, number>(); // player name -> final Challenge score
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
  /** The events of the Economy in a transaction's receipt, decoded with its ABI (the writer returns Challenge's). */
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
      contractAddress: client.deployment.addresses.Challenge,
      entrypoint: "build",
      calldata: client.codecs.Challenge.encodeCall("build", [key.gameId, move.orientation, move.x, move.y]),
    };
    try {
      await player.account.estimateInvokeFee([call], { tip: 0n });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * The naive player (bob and carol): a Challenge game for at most `maxMoves` placements, a legal placement next to the tiles placed
   * (found by probing the node), then sent through the writer. It
   * surrenders if the game is still running after that.
   */
  async function playChallenge(player: Player, key: GameKey, maxMoves: number): Promise<{ moves: number; score: number; hash: string }> {
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
    expect(deployment.faucet).not.toBe("");
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

    // Keep the three Challenge games inside one day, whatever the wall clock says.
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
    expect(BigInt(head.data.contracts.challenge)).toBe(BigInt(client.deployment.addresses.Challenge));
    expect(BigInt(head.data.contracts.setup)).toBe(BigInt(client.deployment.addresses.Setup));
    // D-25 (E): no Account in the deployment nor in the indexer's sources.
    expect(head.data.contracts).not.toHaveProperty("account");
    pass("deployment, node and indexer agree", `chain ${head.data.chainId}, from_block ${head.data.fromBlock}, indexer head ${head.head.number}`);
  });

  // D-25 (E): no registration. Three fresh wallets take the faucet's USDC and nothing else before they buy and play.
  test("three wallets take the faucet's USDC, with no registration", async () => {
    const hashes: string[] = [];
    for (const p of players) {
      expect(await usdc(p.address)).toBe(0n);
      const result = await p.writer.mint();
      // The faucet mints the entry token (USDC), not the old Token.
      expect(await usdc(p.address)).toBe(FAUCET_USDC_AMOUNT);
      expect(await client.balance(p.address)).toBe(FAUCET_USDC_AMOUNT);
      hashes.push(`${p.name} ${short(result.transactionHash)}`);
    }
    const entry = await client.views.entryPrice();
    price = entry.amount;
    expect(price).toBeGreaterThan(0n);
    // The entry token Challenge charges is contracts.Faucet, explicitly (the client has no other entry token to prefer).
    expect(BigInt(entry.token)).toBe(BigInt(client.deployment.faucet));
    pass("faucet: mint(self, N), no registration", `${FAUCET_USDC_AMOUNT} base units each; ${hashes.join(", ")}`);
  }, 60_000);

  test("claims the tutorial on Setup (D-21): task 10 once, then nothing", async () => {
    const [alice] = players;
    expect(await client.views.tutorialClaimed(alice.address)).toBe(false);
    const first = await alice.writer.claimTutorial();
    expect(first.events.map((e) => [e.name, e.fields.taskId, e.fields.count])).toEqual([["AchievementProgressed", 10, 1]]);
    expect(await client.views.tutorialClaimed(alice.address)).toBe(true);
    const second = await alice.writer.claimTutorial();
    expect(second.events).toEqual([]);
    pass("tutorial claim: credited once, idempotent", `first ${short(first.transactionHash)}, second ${short(second.transactionHash)} (no event)`);
  }, 60_000);

  test("buys three Challenge games with stake k and a referrer, and the price, burn, referral and margin match the balances", async () => {
    dayId = await client.views.currentDay();
    const [alice, bob, carol] = players;
    // D-25 (E): a referrer is any non-zero address other than the payer, the Challenge and the Economy. Those three are refused
    // here before anything is sent: alice's USDC does not move.
    const refusedCases: Array<[string, string]> = [
      ["payer", alice.address],
      ["challenge", client.deployment.addresses.Challenge],
      ["economy", economy.deployment.addresses.Economy],
    ];
    for (const [who, address] of refusedCases) {
      const refused = await alice.econ.purchase({ stake: 1, confirmedPrice: price, confirmedMinOut: 1n, referrer: address }).catch((e: unknown) => e);
      expect(refused, who).toBeInstanceOf(RefusedReferrerError);
      expect((refused as RefusedReferrerError).who).toBe(who);
    }
    expect(await usdc(alice.address)).toBe(FAUCET_USDC_AMOUNT);
    pass("referrer refused client-side: the payer, Challenge, Economy", "RefusedReferrerError x3, nothing sent, USDC unchanged");
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
        vaultUsdc: await usdc(vaultAddress),
        vault: await economy.views.vault(vaultAddress),
        supply: await pavedSupply(),
      };
      const planned = await p.econ.planPurchase({ stake: k, confirmedPrice: quote.price, confirmedMinOut: 1n, referrer: refAddress });
      // The floor the player confirmed: the plan's own min_out, as the purchase screen carries it.
      const purchase = await p.econ.purchase({ stake: k, confirmedPrice: quote.price, confirmedMinOut: planned.minOut, referrer: refAddress });
      const purchaseHash = purchase.transactionHash;
      // The token id is pinned (a fresh node), and so is the seed of its deck: the view's seed is the spawn's, replayed.
      expect(purchase.gameId, `${p.name}'s token id on a fresh node after deploy.sh devnet`).toBe(EXPECTED_GAME_IDS[p.name]);
      const seed = BigInt((await client.views.game({ mode: "challenge", gameId: purchase.gameId })).seed);
      expect(seed, `${p.name}'s game started from Poseidon(${SALT}, Challenge, ${purchase.gameId}) (the view's seed is after the first draw)`).toBe(spawnedSeed(client.deployment.addresses.Challenge, purchase.gameId));
      challengeGames.set(p.name, purchase.gameId);
      stakes.set(p.name, k);
      expect(purchase.events.find((e) => e.name === "GameSpawned")?.fields.dayId).toBe(dayId);
      const purchased = (await economyEvents(purchase.transactionHash)).find((e) => e.name === "Purchased")!;
      expect(purchased, "Economy.Purchased in the receipt").toBeDefined();
      const f = purchased.fields as Record<string, bigint | number | string>;
      const burnedQuote = BigInt(f.burnedQuote as bigint);
      const burned = BigInt(f.burned as bigint);
      const referral = BigInt(f.referral as bigint);
      const margin = BigInt(f.margin as bigint);
      const vaultPaved = BigInt(f.vaultPaved as bigint);
      // price: the player paid exactly k x unit
      expect(before.player - (await usdc(p.address))).toBe(quote.price);
      expect(BigInt(f.price as bigint)).toBe(quote.price);
      expect(Number(f.stake)).toBe(k);
      // referral: 5 % of the price, paid to the referrer, out of the margin
      expect(referral).toBe(referrer ? quote.referral : 0n);
      if (referrer) expect(referral).toBe((quote.price * 500n) / 10_000n);
      expect((referrer ? await usdc(referrer.address) : 0n) - before.referrer).toBe(referral);
      // margin: swapped with the burn quote in one swap (P-56); no USDC reaches the Vault
      expect(margin).toBe(quote.margin - referral);
      expect(await usdc(vaultAddress)).toBe(before.vaultUsdc);
      expect(burnedQuote).toBe(quote.burnQuote);
      expect(burnedQuote + referral + margin).toBe(quote.price);
      // min_out against the contract's own computation: the client quoted exactly the USDC the contract swapped, and the
      // swap paid that quote (nothing moved the pool in between); the PAVED it bought is at least min_out.
      const bought = burned + vaultPaved;
      expect(planned.swapIn, "the client's swap input = the contract's (burn quote + margin)").toBe(burnedQuote + margin);
      expect(bought, "the swap paid the pool's quote of that input").toBe(planned.poolOut);
      expect(bought).toBeGreaterThanOrEqual(planned.minOut);
      // the split by input: the margin's PAVED to the Vault (rounded down), the rest burned
      expect(vaultPaved).toBe((bought * margin) / (burnedQuote + margin));
      expect(before.supply - (await pavedSupply())).toBe(burned);
      // the rate rises: total_assets grows by the margin's PAVED, with no share minted
      const vaultAfter = await economy.views.vault(vaultAddress);
      expect(vaultAfter.totalAssets - before.vault.totalAssets).toBe(vaultPaved);
      expect(vaultAfter.totalSupply).toBe(before.vault.totalSupply);
      expect(vaultRate(vaultAfter.totalAssets, vaultAfter.totalSupply)).toBeGreaterThan(vaultRate(before.vault.totalAssets, before.vault.totalSupply));
      const terms = await economy.views.terms(purchase.gameId);
      expect(terms).toMatchObject({ stake: k, recorded: false, settled: false, expired: false });
      expect(BigInt(terms.player)).toBe(BigInt(p.address));
      evidence.push(`${p.name} k=${k} game ${purchase.gameId} initial seed 0x${tokenSeed(client.deployment.addresses.Challenge, purchase.gameId).toString(16)} price ${quote.price} = burn ${burnedQuote} + referral ${referral} + margin ${margin}; one swap of ${planned.swapIn} USDC -> ${bought} PAVED (quote ${planned.poolOut}, min_out ${planned.minOut}): ${burned} burned, ${vaultPaved} to the Vault (total_assets +${vaultPaved}, supply unchanged), ${short(purchaseHash)}`);
    }
    pass("buy: approve + spawn with stake k and referrer; one swap of burn quote + margin (P-56); price, burn, referral, Vault PAVED vs balances", `day ${dayId}: ${evidence.join("; ")}`);
  }, 120_000);

  test("the threshold the settlement will use: the day's prior and the formula", async () => {
    // Option B (economy.md section 2): the day's mean blends its prior (the EMA at its first purchase, weight 100)
    // with its games (stake x min(score, 4 x prior)); the threshold is that mean shifted by sigma.
    const day = await economy.views.day(dayId);
    const quote = await economy.views.quote(1);
    const terms = await economy.views.terms(challengeGames.get(players[0].name)!);
    prior = day.prior;
    expect(day.closed).toBe(false);
    expect(prior).toBeGreaterThan(0);
    // Before any game of the day is in, the threshold is the prior's (the quote shows the same reference).
    expect(threshold(dayMean(prior, []), terms.sigmaBps)).toBe(BigInt(quote.threshold));
    pass("threshold before play", `day ${dayId}: prior ${prior / 1000} points, sigma ${terms.sigmaBps} bps, c ${terms.slopeBps} bps, H ${terms.cap}: threshold now ${quote.threshold / 1000} points (Quote.threshold), and the day's games move it by stake x min(score, 4 x prior) at weight 100 + sum k`);
  }, 30_000);

  test("plays the Challenge games to game over: alice with the search player, bob and carol naively", async () => {
    const evidence: string[] = [];
    // alice (stake 3) plays the whole game with the player of challenge-player.ts, which asks the node for every candidate.
    {
      const [alice] = players;
      const key: GameKey = { mode: "challenge", gameId: challengeGames.get(alice.name)! };
      const player = new ChallengePlayer({ rpcUrl, client, challenge: client.deployment.addresses.Challenge, codec: client.codecs.Challenge, address: alice.address, writer: alice.writer });
      const done = await player.play(key, {
        onMove: process.env.E2E_VERBOSE ? (line) => appendFileSync(process.env.E2E_VERBOSE!, `alice ${line}\n`) : undefined,
      });
      scores.set(alice.name, done.score);
      const terms = await economy.views.terms(key.gameId);
      expect(terms).toMatchObject({ recorded: true, expired: false, settled: false, score: done.score });
      evidence.push(`alice (search player) ${done.moves} moves ${done.discards} discards score ${done.score} in ${(done.ms / 1000).toFixed(0)} s, ${done.simulations} simulations, recorded ${short(done.hash)}`);
    }
    for (const p of [players[1], players[2]]) {
      const maxMoves = NAIVE_MAX_MOVES[p.name];
      const key: GameKey = { mode: "challenge", gameId: challengeGames.get(p.name)! };
      const done = await playChallenge(p, key, maxMoves);
      scores.set(p.name, done.score);
      const terms = await economy.views.terms(key.gameId);
      // The game is recorded in the Economy when it ends, with its score (the settlement reads it).
      expect(terms).toMatchObject({ recorded: true, expired: false, settled: false, score: done.score });
      evidence.push(`${p.name} ${done.moves} moves score ${done.score} recorded ${short(done.hash)}`);
    }
    // The threshold the settlement will use, from the formula: alice must beat it, bob and carol stay under it.
    // The deck depends on the game id (D-23b), so a failure names the day, the game ids and the scores.
    const games = players.map((p) => ({ score: scores.get(p.name)!, stake: stakes.get(p.name)! }));
    cliff = threshold(dayMean(prior, games), (await economy.views.terms(challengeGames.get(players[0].name)!)).sigmaBps);
    const where = `day ${dayId}, games ${[...challengeGames].map(([n, id]) => `${n} ${id}`).join(", ")}, prior ${prior / 1000}, threshold ${Number(cliff) / 1000}, scores ${[...scores].map(([n, s]) => `${n} ${s}`).join(", ")}`;
    expect(BigInt(scores.get("alice")!) * 1000n, `alice's search player must beat the threshold (${where})`).toBeGreaterThanOrEqual(cliff);
    // bob and carol cannot reach it by construction: the day's mean is at least the prior diluted by every stake (a
    // game enters it at 0 or more), so no threshold of the day is under this floor; their scores stay under the floor.
    const sigma = (await economy.views.terms(challengeGames.get(players[0].name)!)).sigmaBps;
    const totalStake = [...stakes.values()].reduce((a, b) => a + b, 0);
    const floor = threshold((PRIOR_WEIGHT * BigInt(prior)) / (PRIOR_WEIGHT + BigInt(totalStake)), sigma);
    expect(cliff, `the threshold is not under its floor (${where})`).toBeGreaterThanOrEqual(floor);
    for (const name of ["bob", "carol"]) {
      expect(BigInt(scores.get(name)!) * 1000n, `${name} cannot reach the threshold floor ${Number(floor) / 1000} (${where})`).toBeLessThan(floor);
    }
    const aliceMargin = BigInt(scores.get("alice")!) * 1000n - cliff;
    pass("Challenge: play to game over; the game is recorded in the Economy", `${evidence.join(", ")}; threshold from the formula ${Number(cliff) / 1000} points (floor ${Number(floor) / 1000}): alice above by ${Number(aliceMargin) / 1000}, bob and carol below (day ${dayId})`);
  }, 1_800_000);

  test("the indexer matches the contract views while the day is open", async () => {
    await caughtUp();
    const board = await indexer.leaderboard(dayId);
    const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
    expect(board.data.total).toBe(players.length);
    expect(board.data.entries.map((e) => e.bestScore)).toEqual(ranked.map(([, s]) => s));
    for (const e of board.data.entries) {
      // Each row is one of the three wallets, by address: no name on chain since D-25 (E); N1's off-chain name is null with the lookup off (`--no-names`).
      const p = players.find((x) => BigInt(x.address) === BigInt(e.playerId))!;
      expect(p).toBeDefined();
      expect(e.name).toBeNull();
      expect(e.bestScore).toBe(scores.get(p.name));
      expect(e.bestGameId).toBe(challengeGames.get(p.name));
      expect(e.gamesFinished).toBe(1);
    }
    expect(await client.views.currentDay()).toBe(dayId);
    const detail = await indexer.tournament(dayId);
    expect(detail.data).toMatchObject({ id: dayId, startTime: dayId * DAY, endTime: (dayId + 1) * DAY, gamesSpawned: players.length, gamesFinished: 3, players: 3 });
    pass("indexer vs views, open day", `leaderboard ${board.data.entries.map((e) => `#${e.rank} ${short(e.playerId)} ${e.bestScore}`).join(", ")}; behind ${board.behind}`);
  }, 60_000);

  test("ends the day with devnet time travel", async () => {
    const t = await chainTime();
    await rpc(rpcUrl, "devnet_increaseTime", { time: DAY - (t % DAY) + 5 });
    const next = await client.views.currentDay();
    expect(next).toBe(dayId + 1);
    // A bought game settles after the end of the NEXT day (P-34): now, one day too early, the writer sends nothing.
    const [alice] = players;
    const blockBefore = (await provider.getBlockNumber()) as number;
    const early = await alice.econ.settle([challengeGames.get(alice.name)!]).catch((e: unknown) => e);
    expect(String((early as Error).message)).toMatch(/settles after/);
    expect((await provider.getBlockNumber()) as number).toBe(blockBefore);
    expect((await economy.views.terms(challengeGames.get(alice.name)!)).settled).toBe(false);
    pass("end the day (devnet_increaseTime)", `chain time ${t} -> ${await chainTime()}, current day ${dayId} -> ${next}`);
  }, 30_000);

  test("the indexer's leaderboard of the closed day: one row per player, ranked by best score", async () => {
    await caughtUp();
    const board = await indexer.leaderboard(dayId);
    const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
    expect(board.data.entries.map((e) => e.bestScore)).toEqual(ranked.map(([, score]) => score));
    expect(board.data.entries.map((e) => e.rank)).toEqual(board.data.entries.map((_, i) => i + 1));
    pass("indexer leaderboard, closed day", board.data.entries.map((e) => `#${e.rank} ${short(e.playerId)} ${e.bestScore}`).join(", "));
  }, 60_000);

  test("the indexer's players and games match the views and the events", async () => {
    await caughtUp();
    const lines: string[] = [];
    for (const p of players) {
      const profile = await indexer.player(p.address);
      // Known from the first event that names the address (its purchase), with no name (D-25 (E)).
      expect(profile.data.player?.playerId).toBe(indexerPlayerId(p.address));
      expect(profile.data.stats).toMatchObject({ challengeGames: 1, challengeFinished: 1, bestScore: scores.get(p.name) });
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
        if (g.contract === "challenge") expect(g.countedDayId).toBe(dayId);
        const one = (await indexer.game(g.contract, g.gameId)).data;
        expect(one.gameId).toBe(g.gameId);
      }
      lines.push(`${p.name}: ${indexed.length} games, id ${short(indexerPlayerId(p.address))}`);
    }
    const unknown = await indexer.player(1n);
    expect(unknown.data.player).toBeNull();
    pass("indexer players and games vs views and events", lines.join("; "));
  }, 120_000);

  test("the deploy script's smoke game is the deployer's: a paid Challenge game, finished and settled", async () => {
    // deploy.sh buys a paid Challenge game (stake 1), plays it and settles it two days later (no Tutorial since D-21).
    // The step fails when they are missing: a node not deployed by scripts/deploy.sh is not what this check is run on.
    const predeployed: Array<{ address: string }> = await rpc(rpcUrl, "devnet_getPredeployedAccounts");
    const deployer = predeployed[0].address;
    const challenge = (await indexer.playerGames(deployer, { contract: "challenge" })).data.games;
    expect(challenge).toHaveLength(1);
    expect(challenge[0]).toMatchObject({ contract: "challenge", over: true });
    const smoke = await economy.views.terms(challenge[0].gameId);
    expect(smoke).toMatchObject({ stake: 1, recorded: true, settled: true });
    pass("deployer's smoke game seen by the indexer", `Challenge game ${challenge[0].gameId} (stake 1, settled, reward ${smoke.reward})`);
  }, 120_000);

  test("past the end of the next day, each bought game settles and its PAVED reward is the chain's", async () => {
    await toNextDay(); // the end of D+1: the day of the purchases may be settled now (P-34)
    const evidence: string[] = [];
    for (const p of players) {
      const gameId = challengeGames.get(p.name)!;
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
      // Whichever side of the threshold the score fell on, the reward follows it: positive at or above, 0 below.
      if (BigInt(after.score) * 1000n >= dayCliff) expect(after.reward, `${p.name} at or above the threshold (day ${dayId})`).toBeGreaterThan(0n);
      else expect(after.reward, `${p.name} below the threshold (day ${dayId})`).toBe(0n);
      settledReward.set(p.name, after.reward);
      evidence.push(`${p.name} k=${stakes.get(p.name)} score ${after.score} vs threshold ${Number(dayCliff) / 1000}: R ${after.reference} -> reward ${after.reward} PAVED${after.reward === 0n ? " (below the threshold: stake lost)" : ` = R x ${after.slopeBps} x ${after.score}000 / (${dayCliff} x 10000)`} (Settled = terms = balance change), ${short(result.transactionHash)}`);
      // settling twice sends nothing
      await expect(p.econ.settle([gameId])).rejects.toThrow(/already settled/);
    }
    // Both cases on every run: alice's search player is above the threshold, bob and carol cannot reach it.
    expect(settledReward.get("alice")).toBeGreaterThan(0n);
    expect(settledReward.get("bob")).toBe(0n);
    expect(settledReward.get("carol")).toBe(0n);
    pass("settle after D+1: PAVED reward = R x h(score / mean) (Settled event = terms = balance change), positive above the threshold, 0 below", evidence.join("; "));
  }, 120_000);

  test("the Vault (vPAVED): a deposit; a later purchase raises the rate with no share minted; withdraws pay the exit fee into the Vault", async () => {
    const [, bob, carol] = players;
    const vaultAddress = economy.deployment.addresses.Vault;
    // carol deposits the 1,000 test PAVED that deploy.sh gives each predeployed account but the deployer (P-38): her
    // own, not the deployer's stake. Her game was under the threshold, so that is all the PAVED she holds.
    const testPaved = 1_000n * 10n ** 18n;
    expect(settledReward.get(carol.name)).toBe(0n);
    expect(await paved(carol.address)).toBe(testPaved);
    const expectedShares = await economy.views.previewDeposit(testPaved);
    const deposited = await carol.econ.deposit(testPaved, { confirmedAmount: testPaved });
    const held = await economy.views.vault(carol.address);
    expect(held.shares).toBe(expectedShares);
    expect(await paved(carol.address)).toBe(0n);
    const fee = BigInt(held.exitFeeBps);
    expect(fee, "the default exit fee (deploy.sh: DEFAULT_EXIT_FEE_BPS, 5 %, owner 2026-10-14)").toBe(500n);

    // The slippage bound holds. Client side: a floor above the fresh quote sends nothing. On chain: a spawn whose min_out is
    // one above what the swap pays reverts ('Economy: swap below min_out'), and bob's USDC does not move.
    const quote = await economy.views.quote(1);
    const planned = await bob.econ.planPurchase({ stake: 1, confirmedPrice: quote.price, confirmedMinOut: 1n, referrer: null });
    const usdcBefore = await usdc(bob.address);
    await expect(bob.econ.purchase({ stake: 1, confirmedPrice: quote.price, confirmedMinOut: planned.minOut + 1n, referrer: null })).rejects.toBeInstanceOf(PoolPriceMovedError);
    const tooHigh = planned.calls.map((call) =>
      call.entrypoint === "spawn" ? { ...call, calldata: [call.calldata[0], call.calldata[1], `0x${(planned.poolOut + 1n).toString(16)}`, "0x0"] } : call,
    );
    const below = await bob.writer.sendCalls(async () => ({ calls: tooHigh, events: "Challenge" })).catch((e: unknown) => e);
    expect(String((below as Error).message)).toMatch(/swap below min_out|73776170652062656c6f77206d696e5f6f7574/i);
    expect(await usdc(bob.address)).toBe(usdcBefore);

    // A later purchase (bob, stake 1, no referrer) raises the rate: its margin's PAVED reaches the Vault, no share minted.
    // It is bob's second game: bought on the day D+2, never played (the expired game below).
    const v0 = await economy.views.vault(vaultAddress);
    const valueBefore = (await economy.views.vault(carol.address)).value;
    const purchase = await bob.econ.purchase({ stake: 1, confirmedPrice: quote.price, confirmedMinOut: planned.minOut, referrer: null });
    bobSecondGame = purchase.gameId;
    expect(bobSecondGame, "bob's second token id on a fresh node").toBe(EXPECTED_BOB_SECOND_GAME);
    expect(BigInt((await client.views.game({ mode: "challenge", gameId: bobSecondGame })).seed)).toBe(spawnedSeed(client.deployment.addresses.Challenge, bobSecondGame));
    const vaultPaved = BigInt(((await economyEvents(purchase.transactionHash)).find((e) => e.name === "Purchased")!.fields as { vaultPaved: bigint }).vaultPaved);
    const v1 = await economy.views.vault(vaultAddress);
    expect(vaultPaved).toBeGreaterThan(0n);
    expect(v1.totalAssets - v0.totalAssets, "total_assets grows by the margin's PAVED").toBe(vaultPaved);
    expect(v1.totalSupply, "no share minted").toBe(v0.totalSupply);
    expect(vaultRate(v1.totalAssets, v1.totalSupply)).toBeGreaterThan(vaultRate(v0.totalAssets, v0.totalSupply));
    const position = await economy.views.vault(carol.address);
    expect(position.shares).toBe(held.shares);
    expect(position.value).toBeGreaterThan(valueBefore);

    // Above max_withdraw: refused client-side, nothing sent.
    const refused = await carol.econ.withdraw(position.maxWithdraw + 1n, { confirmedAmount: position.maxWithdraw + 1n }).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(VaultOverMaxWithdrawError);
    expect((await economy.views.vault(carol.address)).shares).toBe(position.shares);

    // A withdraw of half of max_withdraw: carol receives exactly the amount; the shares burned are preview_withdraw's, which
    // is OpenZeppelin's formula with the fee on top, rounded up; total_assets falls by the amount only: the fee stays.
    const amount = position.maxWithdraw / 2n;
    const ceil = (a: bigint, b: bigint) => (a + b - 1n) / b;
    const expectedBurn = ceil((amount + ceil(amount * fee, 10_000n)) * (v1.totalSupply + 1n), v1.totalAssets + 1n);
    expect(await economy.views.previewWithdraw(amount)).toBe(expectedBurn);
    const withdrew = await carol.econ.withdraw(amount, { confirmedAmount: amount });
    const v2 = await economy.views.vault(vaultAddress);
    const afterWithdraw = await economy.views.vault(carol.address);
    expect(await paved(carol.address)).toBe(amount);
    expect(position.shares - afterWithdraw.shares).toBe(expectedBurn);
    expect(v1.totalAssets - v2.totalAssets, "only the amount leaves: the exit fee stays in the Vault").toBe(amount);
    expect(v1.totalSupply - v2.totalSupply).toBe(expectedBurn);
    expect(vaultRate(v2.totalAssets, v2.totalSupply), "the fee raises the rate of those who stay").toBeGreaterThan(vaultRate(v1.totalAssets, v1.totalSupply));

    // Withdraw all: every vPAVED redeemed for preview_redeem's PAVED, the fee taken.
    const redeemable = await economy.views.previewRedeem(afterWithdraw.shares);
    expect(redeemable).toBe(afterWithdraw.maxWithdraw);
    const redeemed = await carol.econ.withdrawAll({ confirmedShares: afterWithdraw.shares });
    expect(await paved(carol.address)).toBe(amount + redeemable);
    expect((await economy.views.vault(carol.address)).shares).toBe(0n);
    const v3 = await economy.views.vault(vaultAddress);
    expect(v2.totalAssets - v3.totalAssets).toBe(redeemable);
    expect(v3.totalAssets).toBeGreaterThan(v0.totalAssets - testPaved); // the fees and the margin stay

    pass(
      "Vault (vPAVED): deposit; a purchase raises the rate (no share minted); the slippage bound; withdraw and withdraw all pay the exit fee into the Vault",
      `carol deposited ${testPaved} PAVED for ${held.shares} vPAVED ${short(deposited.transactionHash)}; min_out ${planned.poolOut + 1n} (quote + 1) reverted on chain, USDC unchanged; bob's purchase sent ${vaultPaved} PAVED: total_assets ${v0.totalAssets} -> ${v1.totalAssets}, supply ${v1.totalSupply} unchanged; withdraw ${amount} burned ${expectedBurn} vPAVED (= preview_withdraw, fee ${fee} bps on top), total_assets -${amount} only ${short(withdrew.transactionHash)}; withdraw all redeemed ${afterWithdraw.shares} vPAVED for ${redeemable} PAVED ${short(redeemed.transactionHash)}`,
    );
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

  test("G4: the owner pauses spawn: the client refuses the purchase, the indexer runs on, unpausing lets the purchase through", async () => {
    // The deployer is the node's first predeployed account (`deploy.sh devnet`), Challenge's owner. It makes itself the guardian
    // first (owner-only `set_guardian`), so that `pause_spawn` is the guardian's call whether or not CORE lets the owner pause.
    const predeployed: Array<{ address: string; private_key: string }> = await rpc(rpcUrl, "devnet_getPredeployedAccounts");
    const owner = new Account({ provider, address: predeployed[0].address, signer: predeployed[0].private_key });
    const challenge = client.deployment.addresses.Challenge;
    const codec = client.codecs.Challenge;
    const ownerCall = async (entrypoint: string, args: Array<string | number | bigint> = []) => {
      const sent = await owner.execute([{ contractAddress: challenge, entrypoint, calldata: codec.encodeCall(entrypoint, args) }], { tip: 0n });
      await provider.waitForTransaction(sent.transaction_hash);
      return sent.transaction_hash;
    };
    const [alice] = players;
    expect(await client.views.spawnPaused()).toBe(false);

    await ownerCall("set_guardian", [owner.address]);
    expect(BigInt(await client.views.guardian())).toBe(BigInt(owner.address));
    const pausedAt = await ownerCall("pause_spawn");
    expect(await client.views.spawnPaused()).toBe(true);

    // The purchase path reads the pause before it builds any call: the typed error, no transaction, USDC unchanged.
    const usdcBefore = await usdc(alice.address);
    const blockBefore = (await provider.getBlockNumber()) as number;
    const request = { stake: 1, confirmedPrice: price, confirmedMinOut: 1n, referrer: null };
    const refused = await alice.econ.purchase(request).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(SpawnPausedError);
    expect((refused as Error).message).toBe("New Challenge games are paused for now. Games already started can still be played.");
    expect((await provider.getBlockNumber()) as number).toBe(blockBefore);
    expect(await usdc(alice.address)).toBe(usdcBefore);

    // The indexer keeps running past GuardianSet and SpawnPaused (strict decoding: an unknown selector would halt it).
    await caughtUp();
    const paused = await indexer.head();
    expect(paused.data.state).toBe("ok");
    expect(paused.head.number).toBeGreaterThanOrEqual(blockBefore);

    await ownerCall("unpause_spawn");
    expect(await client.views.spawnPaused()).toBe(false);
    const planned = await alice.econ.planPurchase(request);
    const bought = await alice.econ.purchase({ ...request, confirmedMinOut: planned.minOut });
    expect(bought.gameId).toBeGreaterThan(EXPECTED_BOB_SECOND_GAME);
    await caughtUp();
    const after = await indexer.head();
    expect(after.data.state).toBe("ok");
    expect(await usdc(alice.address)).toBe(usdcBefore - price);
    pass("G4: pause spawn", `paused in tx ${short(pausedAt)}: SpawnPausedError, no block, USDC unchanged; indexer ok at head ${paused.head.number}; unpaused, game ${bought.gameId} bought, indexer ok at head ${after.head.number}`);
  }, 120_000);
});
