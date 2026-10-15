/**
 * Cobbles v1 part 2 on a local starknet-devnet 0.10 (IX-COBBLES2): `scripts/deploy.sh devnet` deploys the working tree (it sets
 * Economy's seller and the four packs), one account buys a pack with a referrer, plays a paid game and claims the quest. The real
 * indexer (`src/main.ts`) follows live. The API's packs, balance, pack purchases and referral totals must equal the contract's
 * own views (`Setup.pack`, `Setup.account`, `Economy.seller`) and the `Sold` the transaction emitted.
 *
 * Runs only with PAVED_DEVNET=1 (`bun run test:devnet`), as the other scenarios do; one Cairo build at a time.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type {
  HeadAnswer,
  PacksAnswer,
  PlayerCobblesAnswer,
  PlayerPacksAnswer,
  PlayerReferralsAnswer,
} from "../../src/api.ts";
import { padded } from "../../src/events.ts";
import { deploy, Game, type Node, type Player, players, ROOT, rpc, startNode, writtenFile } from "./devnet.ts";

const enabled = process.env.PAVED_DEVNET === "1";
const NODE_PORT = Number(process.env.DEVNET_PACKS_PORT || 5074);
const API_PORT = 8791;
const MAIN = resolve(import.meta.dirname, "../../src/main.ts");
const COMMITTED = resolve(ROOT, "contracts/deployments/devnet.json");
const DAY = 86400;

describe.skipIf(!enabled)("devnet packs", () => {
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
    work = mkdtempSync(join(tmpdir(), "paved-devnet-packs-"));
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

  test("a pack with a referrer, a paid game, a claim: the API equals the contract's views", async () => {
    const economy = deployment.contracts.Economy.address;
    const aliceAddress = padded(alice.address);
    const boAddress = padded(bo.address);
    // Daily Run alone gives cobbles (see the cobbles scenario), so one paid game completes the quest.
    for (let id = 5; id <= 13; id++) await send(owner, setup(), "set_quest_cobbles", [id, 0]);
    await send(owner, setup(), "set_quest_cobbles", [1, 5]);

    // The shop the deploy set: the packs against the contract's `pack` view, and the seller.
    await caught();
    const packs = await get<PacksAnswer>("/v1/packs");
    expect(packs.packs).toHaveLength(4);
    for (const pack of packs.packs) {
      const view = await owner.call(setup(), "pack", [pack.pack_id]);
      expect([pack.cobbles, BigInt(pack.price), pack.active]).toEqual([Number(view[0]), view[1], view[2] === 1n]);
    }
    expect(packs.packs.map((p) => [p.pack_id, p.cobbles, p.price])).toEqual([
      [1, 50, "5000000"],
      [2, 100, "9000000"],
      [3, 500, "40000000"],
      [4, 1000, "70000000"],
    ]);
    expect(BigInt((await owner.call(economy, "seller"))[0]!)).toBe(BigInt(setup()));

    // Bo plays a paid game (a known player to refer to), then Alice buys the 100-pack with Bo as the referrer.
    const boGame = await spawnPaid(bo);
    await play(boGame, 0, bo);
    const [token] = await alice.call(challenge(), "entry_price");
    const price = 9_000_000n;
    await send(alice, `0x${token!.toString(16)}`, "approve", [setup(), price, 0]);
    // The swap takes the price less the referral (5 %); min_out is the quote less 1 %.
    const swap = await alice.call(economy, "quote_swap", [(price * 95n) / 100n, 0]);
    const minOut = (u256(swap[0]!, swap[1]!) * 99n) / 100n;
    const receipt = await send(alice, setup(), "buy_pack", [2, bo.address, minOut & (2n ** 128n - 1n), minOut >> 128n]);
    const sold = receipt.events.find((e) => BigInt(e.from_address) === BigInt(economy) && BigInt(e.keys[1]!) === BigInt(alice.address))!;
    const referral = u256(BigInt(sold.data[3]!), BigInt(sold.data[4]!));
    expect(referral).toBeGreaterThan(0n);

    // Then a paid game and the quest claim: the balance moves again, on top of the purchase.
    const paid = await spawnPaid(alice);
    await play(paid, 0, alice);
    await caught();
    const gameOver = (await alice.call(challenge(), "game", [paid.id]))!;
    const day = Math.floor(Number(gameOver[14]) / DAY);
    await send(alice, setup(), "claim_quest", [1, day]);
    await caught();

    // The balance equals the contract's, and is the pack's 100 plus the quest's 5.
    const account = await alice.call(setup(), "account", [alice.address]);
    const cobbles = await get<PlayerCobblesAnswer>(`/v1/players/${aliceAddress}/cobbles`);
    expect(cobbles.cobbles).toBe(Number(account[0]));
    expect(cobbles.cobbles).toBe(105);

    // The purchase: the pack, its price, the referrer and the referral of the Sold in the same transaction.
    const bought = await get<PlayerPacksAnswer>(`/v1/players/${aliceAddress}/packs`);
    expect(bought.purchases).toHaveLength(1);
    expect(bought.purchases[0]).toMatchObject({ pack_id: 2, cobbles: 100, price: "9000000", balance: 100, referrer: boAddress });
    expect(BigInt(bought.purchases[0]!.referral)).toBe(referral);

    // Bo's referral total: the pack's referral (the games had none).
    const totals = await get<PlayerReferralsAnswer>(`/v1/players/${boAddress}/referrals`);
    expect(totals).toMatchObject({ games: { count: 0, total: "0" }, packs: { count: 1 } });
    expect(BigInt(totals.packs.total)).toBe(referral);
    expect(BigInt(totals.total)).toBe(referral);
    // Bo bought no pack and claimed nothing.
    expect((await get<PlayerPacksAnswer>(`/v1/players/${boAddress}/packs`)).purchases).toEqual([]);
    expect((await get<PlayerCobblesAnswer>(`/v1/players/${boAddress}/cobbles`)).cobbles).toBe(Number((await bo.call(setup(), "account", [bo.address]))[0]));
  });
});
