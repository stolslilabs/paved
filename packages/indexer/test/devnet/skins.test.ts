/**
 * Cobbles v1 part 3 on a local starknet-devnet 0.10 (IX-COBBLES3): `scripts/deploy.sh devnet` deploys the working tree, one
 * account buys a pack of Cobbles, buys two Forest skins (theme 1) with `buy_skin` and activates them with `set_skins`, then
 * re-activates in a batch. The real indexer (`src/main.ts`) follows live. The API's skin prices, balance, owned skins and active
 * set must equal the contract's own views (`Setup.skin_price`, `Setup.account`, `Setup.skins`, `Setup.active_skins`).
 *
 * Runs only with PAVED_DEVNET=1 (`bun run test:devnet`), as the other scenarios do; one Cairo build at a time.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { HeadAnswer, PlayerCobblesAnswer, PlayerSkinsAnswer, SkinsAnswer } from "../../src/api.ts";
import { padded } from "../../src/events.ts";
import { deploy, Game, type Node, type Player, players, ROOT, rpc, startNode, writtenFile } from "./devnet.ts";

const enabled = process.env.PAVED_DEVNET === "1";
const NODE_PORT = Number(process.env.DEVNET_SKINS_PORT || 5075);
const API_PORT = 8792;
const MAIN = resolve(import.meta.dirname, "../../src/main.ts");
const COMMITTED = resolve(ROOT, "contracts/deployments/devnet.json");
const DAY = 86400;

describe.skipIf(!enabled)("devnet skins", () => {
  let node: Node;
  let work: string;
  let committed: string;
  let deployment: { contracts: Record<"Challenge" | "Setup" | "Economy" | "Faucet", { address: string }> };
  let owner: Player;
  let alice: Player;
  let indexer: ChildProcess | undefined;
  const get = async <T>(path: string): Promise<T> => {
    const response = await fetch(`http://127.0.0.1:${API_PORT}${path}`);
    if (!response.ok) throw new Error(`GET ${path}: ${response.status}`);
    return (await response.json()) as T;
  };
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
  beforeAll(async () => {
    work = mkdtempSync(join(tmpdir(), "paved-devnet-skins-"));
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
    [owner, alice] = (await players(node.url, 2)) as [Player, Player];
    for (const p of [alice]) await send(p, deployment.contracts.Faucet.address, "mint", [p.address, 100_000_000n, 0]);
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

  test("a skin bought and activated: the API equals the contract's views", async () => {
    const economy = deployment.contracts.Economy.address;
    const aliceAddress = padded(alice.address);
    const plans = Array.from({ length: 19 }, (_, i) => i + 1);

    // The owner prices Forest (theme 1) plans 1, 2 and 19 and theme 2's plan 1; whatever the deploy priced stays as it is.
    await send(owner, setup(), "set_skin_price", [1, 1, 50]);
    await send(owner, setup(), "set_skin_price", [1, 2, 60]);
    await send(owner, setup(), "set_skin_price", [1, 19, 100]);
    await send(owner, setup(), "set_skin_price", [2, 1, 70]);
    await send(owner, setup(), "set_skin_price", [1, 2, 65]); // repriced: 65 is the price in force
    await caught();
    for (const theme of [1, 2]) {
      const prices = await get<SkinsAnswer>(`/v1/skins?theme=${theme}`);
      const served = new Map(prices.prices.map((p) => [p.plan, p.cobbles]));
      for (const plan of plans) {
        const view = Number((await owner.call(setup(), "skin_price", [theme, plan]))[0]);
        expect(served.get(plan) ?? 0, `theme ${theme} plan ${plan}`).toBe(view);
      }
    }
    expect((await get<SkinsAnswer>("/v1/skins?theme=1")).prices.find((p) => p.plan === 2)?.cobbles).toBe(65);

    // Alice buys the 100-pack (no referrer): 100 cobbles.
    const [token] = await alice.call(deployment.contracts.Challenge.address, "entry_price");
    const price = 9_000_000n;
    await send(alice, `0x${token!.toString(16)}`, "approve", [setup(), price, 0]);
    const swap = await alice.call(economy, "quote_swap", [price, 0]);
    const minOut = (u256(swap[0]!, swap[1]!) * 99n) / 100n;
    await send(alice, setup(), "buy_pack", [2, 0, minOut & (2n ** 128n - 1n), minOut >> 128n]);

    // She buys Forest plan 1 (50) and shows it; plan 19 (100) comes after a second pack.
    await send(alice, setup(), "buy_skin", [1, 1]);
    await caught();
    const afterOne = await get<PlayerCobblesAnswer>(`/v1/players/${aliceAddress}/cobbles`);
    expect(afterOne).toMatchObject({ cobbles: 50, skins_bought: 1, skins_spent: 50 });
    expect(afterOne.cobbles).toBe(Number((await alice.call(setup(), "account", [alice.address]))[0]));

    await send(alice, setup(), "set_skins", [1, 1, 1]);
    await caught();
    expect((await get<PlayerSkinsAnswer>(`/v1/players/${aliceAddress}/skins`)).active.slice(0, 2)).toEqual([1, 0]);

    // A second pack, then plan 19 (100) and a batch: plan 1 back to the default, plan 19 shown.
    await send(alice, `0x${token!.toString(16)}`, "approve", [setup(), price, 0]);
    await send(alice, setup(), "buy_pack", [2, 0, minOut & (2n ** 128n - 1n), minOut >> 128n]);
    await send(alice, setup(), "buy_skin", [1, 19]);
    await send(alice, setup(), "set_skins", [2, 1, 0, 19, 1]);
    await caught();

    // The balance, the owned skins and the active set equal the contract's views.
    const account = await alice.call(setup(), "account", [alice.address]);
    const cobbles = await get<PlayerCobblesAnswer>(`/v1/players/${aliceAddress}/cobbles`);
    expect(cobbles.cobbles).toBe(Number(account[0]));
    expect(cobbles).toMatchObject({ cobbles: 50, skins_bought: 2, skins_spent: 150 });

    const skins = await get<PlayerSkinsAnswer>(`/v1/players/${aliceAddress}/skins`);
    for (const theme of [1, 2]) {
      const word = Number((await alice.call(setup(), "skins", [alice.address, theme]))[0]);
      const served = skins.owned.find((o) => o.theme === theme)?.plans ?? [];
      expect(served, `theme ${theme}`).toEqual(plans.filter((plan) => (word >> plan) & 1));
    }
    expect(skins.owned).toEqual([{ theme: 1, plans: [1, 19] }]);
    const view = (await alice.call(setup(), "active_skins", [alice.address])).slice(1).map(Number); // the array's length first
    expect(view).toHaveLength(19);
    expect(skins.active).toEqual(view);
    expect(skins.active[0]).toBe(0);
    expect(skins.active[18]).toBe(1);

    // Nobody else owns or shows a skin.
    expect(await get<PlayerSkinsAnswer>(`/v1/players/${padded(owner.address)}/skins`)).toMatchObject({ owned: [], active: new Array(19).fill(0) });
  });
});
