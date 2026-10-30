import { getChecksumAddress, type Call } from "starknet";
import { describe, expect, test } from "vitest";
import { createCodecs } from "../src/abis";
import {
  CONTROLLER_ENTRY_POINTS,
  ECONOMY_ENTRY_POINT,
  controllerPolicies,
  isTokenMethod,
  toControllerSessionPolicies,
  type ControllerPolicy,
} from "../src/auth/controller";
import { resolveDeployment } from "../src/deployment";
import { MAX_STAKE, createEconomyClient, priceOf, resolveEconomyDeployment, settlesAfter } from "../src/economy";
import { PavedClient, type PavedRpc } from "../src/paved-client";
import { FAKE_CHAIN_ID, FAKE_ROUTER_FILE, FAKE_UNIT, FakeEconomy, FakePoolQuoter, fakeTerms } from "../src/testing";
import { packBuyerOf } from "../src/packs";
import { FakeGameViews, type FakeGame } from "../src/views";

const deployment = resolveDeployment({
  network: "sepolia",
  // Sepolia has a Faucet (D-16, P-39): the faucet's `mint` is a session policy there.
  file: { contracts: { Faucet: { address: "0x14" } } },
  env: { rpcUrl: "http://s/rpc", addresses: { Challenge: "0x2", Setup: "0x3" } },
});
const mainnet = resolveDeployment({
  network: "mainnet",
  file: { contracts: { Faucet: { address: "0x14" } } },
  env: { rpcUrl: "http://m/rpc", addresses: { Challenge: "0x2", Setup: "0x3" } },
});
const policies = controllerPolicies(deployment);
/** The economy of the same deployment (E3): the Challenge entry is paid in USDC. */
const ECON = { economy: "0x10", pavedToken: "0x11", vault: "0x12", usdc: "0x14" };
/** The cap a legacy caller may still pass (`entryApprove`): ignored since P-65. */
const LEGACY_APPROVE = { token: ECON.usdc, cap: BigInt(MAX_STAKE) * FAKE_UNIT };
/** The session of each network the client signs with a controller, with and without the Economy. */
const onEveryNetwork = () =>
  [deployment, mainnet].flatMap((d) => [controllerPolicies(d), controllerPolicies(d, { economy: ECON.economy }), controllerPolicies(d, { approve: LEGACY_APPROVE, economy: ECON.economy })]);
const PLAYER = "0xc";
/** The salts the fake views give: game 1's next move, the player's next spawn (#645). */
const MOVE_SALT = "0x5a17";
const SPAWN_SALT = "0x59a3";
/** `request_random(Challenge, Source::Salt(salt))` on the network's provider: the first call of a drawing write. */
const vrfRequest = (salt: string) => [BigInt(deployment.vrfProvider), "request_random", [BigInt(deployment.addresses.Challenge), 1n, BigInt(salt)]];
const asTuple = (c: Call) => [BigInt(c.contractAddress), c.entrypoint, (c.calldata as string[]).map((v) => BigInt(v))];
const DAY = 20_000;
const P = 10n ** 18n;

/**
 * Every write of the client outside devnet, the game's (`PavedWriter`) and the economy's (`EconomyWriter`, on E3's
 * committed ABIs), each against an account that records what it is asked to sign. Writes that throw after sending
 * (no GameSpawned in the fake receipt) count by what they sent. `executions` gets each write's `execute` calls, one
 * entry per wallet prompt outside the session.
 */
async function sentByEveryWrite(executions: Record<string, Call[][]> = {}): Promise<Record<string, Call[]>> {
  let current: Call[][] = [];
  const account = { address: PLAYER, execute: async (calls: Call[]) => (current.push([...calls]), { transaction_hash: "0x1" }) };
  const rpc = {
    callContract: async () => [],
    getChainId: async () => FAKE_CHAIN_ID,
    getEvents: async () => ({ events: [] }),
    waitForTransaction: async () => ({ execution_status: "SUCCEEDED", events: [] }),
  } as unknown as PavedRpc;
  const gameViews = new FakeGameViews();
  gameViews.price = { token: ECON.usdc, amount: FAKE_UNIT };
  // The default packs' ends (CORE #453).
  gameViews.packs.set(1, { packId: 1, cobbles: 50, price: 5_000_000n, active: true });
  gameViews.packs.set(4, { packId: 4, cobbles: 1_000, price: 70_000_000n, active: true });
  // The VRF draws (#645): game 1's next move draws, and the player's next spawn has its salt
  gameViews.setGame({ mode: "challenge", gameId: 1 }, {
    game: { id: 1, playerId: PLAYER } as FakeGame["game"],
    tiles: [],
    builder: { gameId: 1, playerId: PLAYER, tileId: 2, plan: 1 },
    draw: { gameId: 1, next: 2, after: 3, tiles: 0n, vrf: true, draws: true, salt: MOVE_SALT },
  });
  gameViews.spawnSalts.set(BigInt(PLAYER).toString(), SPAWN_SALT);
  const client = new PavedClient(deployment, rpc, createCodecs(), gameViews);
  const writer = client.writer(account);
  // Mainnet never resolves a Faucet, whatever the env says: its writer has no faucet.
  const mainnetWriter = new PavedClient(mainnet, rpc, createCodecs(), gameViews).writer(account);
  const economy = new FakeEconomy();
  economy.terms_.set(7, fakeTerms({ stake: 2, day: DAY }));
  economy.setBalance("paved", PLAYER, 5n * P);
  economy.setShares(PLAYER, 2n * P);
  const econ = createEconomyClient(resolveEconomyDeployment({ base: { ...deployment, chainId: FAKE_CHAIN_ID }, file: FAKE_ROUTER_FILE, env: ECON }), client, economy, new FakePoolQuoter())!;
  const econWriter = econ.writer(writer, { now: () => settlesAfter(DAY) });
  const packs = packBuyerOf(econ, writer);
  const pack = (packId: number, price: bigint) => packs.buy({ packId, confirmedPrice: price, confirmedMinOut: 1n, referrer: null });
  const move = { orientation: 1, x: 2, y: 3 };
  const writes: Record<string, () => Promise<unknown>> = {
    // The faucet (Faucet.mint): signed in the controller's session on Sepolia, where the deployment has a Faucet.
    "faucet mint": () => writer.mint(),
    "faucet on mainnet": () => mainnetWriter.mint(),
    // The tutorial claim (D-21): `Setup.claim_tutorial()`, signed in the session where the deployment has a Setup.
    "tutorial claim": () => writer.claimTutorial(),
    // The Cobbles claims (cobbles v1, part 1), one by one and as Claim all's multicall.
    "quest claim": () => writer.claimQuest(5, DAY),
    "achievement claim": () => writer.claimAchievement(4),
    "daily credit": () => writer.claimDailyCredit(DAY),
    "weekly credit": () => writer.claimWeeklyCredit(2_857),
    "claim all": () =>
      writer.claim([
        { kind: "quest", questId: 1, period: DAY },
        { kind: "quest", questId: 14, period: 2_857 },
        { kind: "achievement", achievementId: 2 },
        { kind: "credit", credit: "daily", period: DAY },
        { kind: "credit", credit: "weekly", period: 2_857 },
      ]),
    // The skins (cobbles v1, part 3): a purchase and a batch of switches, Cobbles only, no token.
    "skin purchase": () => writer.buySkin({ theme: 1, plan: 7, confirmedPrice: 75 }, { skinPrice: async () => 75 }),
    "skins saved": () => writer.setSkins([{ plan: 7, theme: 1 }, { plan: 13, theme: 0 }]),
    // Play free: `Challenge.spawn_free()`, no token moves; the empty receipt makes the write throw after sending.
    "play free": () => writer.spawnFree(),
    "challenge build": () => writer.build({ mode: "challenge", gameId: 1 }, move),
    "challenge discard": () => writer.discard({ mode: "challenge", gameId: 1 }),
    "challenge surrender": () => writer.surrender({ mode: "challenge", gameId: 1 }),
    "purchase, stake 1": () => econWriter.purchase({ stake: 1, confirmedPrice: priceOf(FAKE_UNIT, 1), confirmedMinOut: 1n, referrer: null }),
    "purchase, stake 10": () => econWriter.purchase({ stake: MAX_STAKE, confirmedPrice: priceOf(FAKE_UNIT, MAX_STAKE), confirmedMinOut: 1n, referrer: null }),
    // A pack of Cobbles (cobbles v1, part 2): approve Setup on USDC, then Setup.buy_pack.
    "pack, 50 for $5": () => pack(1, 5_000_000n),
    "pack, 1,000 for $70": () => pack(4, 70_000_000n),
    settle: () => econWriter.settle([7]),
    "vault deposit": () => econWriter.deposit(P, { confirmedAmount: P }),
    "vault withdraw": () => econWriter.withdraw(P, { confirmedAmount: P }),
    "vault withdraw all": () => econWriter.withdrawAll({ confirmedShares: 2n * P }),
  };
  const sent: Record<string, Call[]> = {};
  for (const [label, write] of Object.entries(writes)) {
    current = [];
    await write().catch(() => undefined);
    executions[label] = current;
    sent[label] = current.flat();
  }
  return sent;
}

const key = (target: string, method: string) => `${BigInt(target)}:${method}`;

/** A u256 argument from its two felts (low, high). */
const u256 = (low: string, high: string) => BigInt(low) + (BigInt(high) << 128n);

/**
 * The call is signed in the session: a policy on its target and entry point. That is all the controller matches (P-65:
 * read in 0.13.16 / wasm 0.10.1), never the calldata, so an approve policy would sign any approve on its token.
 */
function inSession(call: Call, ps: ControllerPolicy[]): boolean {
  return ps.some((p) => BigInt(p.target) === BigInt(call.contractAddress) && p.method === call.entrypoint);
}

const GAME = [
  "tutorial claim", "play free", "quest claim", "achievement claim", "daily credit", "weekly credit", "claim all", "skin purchase", "skins saved", "challenge build", "challenge discard", "challenge surrender",
];
/** The paid entry: approve + spawn in one multicall; neither is a policy (P-65), so it prompts once. */
const PAID = ["purchase, stake 1", "purchase, stake 10"];
/** A pack's purchase: approve + `buy_pack`, neither a policy (P-65): one prompt. */
const PACKS = ["pack, 50 for $5", "pack, 1,000 for $70"];
const PROMPTED = ["vault deposit", "vault withdraw", "vault withdraw all"];

describe("controllerPolicies against what the writers send (E3)", () => {
  test("every game write is signed in the session", async () => {
    const sent = await sentByEveryWrite();
    for (const label of GAME) {
      expect(sent[label].length, label).toBeGreaterThan(0);
      for (const call of sent[label]) expect(inSession(call, policies), `${label}: ${call.entrypoint}`).toBe(true);
    }
    // #645: the free spawn and every drawing move request their draw first, in the session too
    expect(sent["play free"].map(asTuple)).toEqual([vrfRequest(SPAWN_SALT), [2n, "spawn_free", []]]);
    expect(sent["challenge build"].map(asTuple)[0]).toEqual(vrfRequest(MOVE_SALT));
    expect(sent["challenge discard"].map(asTuple)).toEqual([vrfRequest(MOVE_SALT), [2n, "discard", [1n]]]);
    // A surrender draws nothing: no request
    expect(sent["challenge surrender"].map((c) => c.entrypoint)).toEqual(["surrender"]);
    expect(sent["tutorial claim"].map((c) => [BigInt(c.contractAddress), c.entrypoint, c.calldata])).toEqual([[3n, "claim_tutorial", []]]);
  });

  test("P-65: no policy holds an approve, on any target, on every network, whatever a caller passes", () => {
    for (const ps of [policies, ...onEveryNetwork()]) {
      expect(ps.filter((p) => p.method === "approve")).toEqual([]);
      const methods = Object.values(toControllerSessionPolicies(ps).contracts).flatMap((c) => c.methods.map((m) => m.entrypoint));
      expect(methods).not.toContain("approve");
      expect(methods.some((m) => /approve/i.test(m)), "no approve-like selector (increase_allowance included)").toBe(false);
    }
    // The legacy cap is ignored: the session is the same without it.
    expect(controllerPolicies(deployment, { approve: LEGACY_APPROVE })).toEqual(policies);
    // No contract's entry points list one either.
    expect(Object.values(CONTROLLER_ENTRY_POINTS).flat().filter((m) => /approve|allowance/i.test(m))).toEqual([]);
  });

  test("P-65: no session policy targets a call that pulls a token: spawn, buy_pack, deposit", async () => {
    const sent = await sentByEveryWrite();
    const pulls = [...PAID, ...PACKS, "vault deposit"].flatMap((label) => sent[label]).filter((c) => ["spawn", "buy_pack", "deposit"].includes(c.entrypoint));
    expect(pulls.map((c) => c.entrypoint).sort()).toEqual(["buy_pack", "buy_pack", "deposit", "spawn", "spawn"]);
    for (const ps of [policies, ...onEveryNetwork()]) {
      for (const call of pulls) expect(inSession(call, ps), call.entrypoint).toBe(false);
      expect(ps.filter((p) => ["spawn", "buy_pack", "deposit"].includes(p.method))).toEqual([]);
    }
  });

  test("P-65: a token method added to the policies (approve, increase_allowance, transfer_from...) is refused", () => {
    for (const method of ["increase_allowance", "transfer_from", "transfer", "increaseAllowance", "transferFrom"]) {
      expect(() => toControllerSessionPolicies([...policies, { target: ECON.usdc, method }]), method).toThrow(/P-65/);
    }
  });

  test("P-65: an approval for all, and a call that pays with a token (deposit, pay, mint, the paid spawn and buy_pack), are refused", () => {
    const refused = [
      "set_approval_for_all",
      "setApprovalForAll",
      "approval",
      "deposit",
      "deposit_for",
      "pay",
      "payment",
      "mint",
      "safe_mint",
      "mintTo",
      "spawn",
      "buy_pack",
      // Any case: all capitals keep their words, and the old guard's names stay refused anywhere in a name.
      "APPROVE",
      "TRANSFER",
      "TRANSFER_FROM",
      "INCREASE_ALLOWANCE",
      "SET_APPROVAL_FOR_ALL",
      "SetApprovalForAll",
      "DEPOSIT",
      "PAY",
      "MINT",
      "SPAWN",
      "BUY_PACK",
      "Approve",
      "safeTransferFrom",
      "x2Approve",
      "autoapprove",
      "pretransfer",
    ];
    for (const method of refused) {
      expect(isTokenMethod(method), method).toBe(true);
      // On any target: the Vault, the Economy, a token, the game's contracts.
      for (const target of [ECON.vault, ECON.economy, ECON.usdc, "0x2", "0x3"]) {
        expect(() => toControllerSessionPolicies([...policies, { target, method }]), `${method} on ${target}`).toThrow(/P-65/);
      }
    }
    // The faucet's mint is the one `mint` in the session, and only as `controllerPolicies` builds it: a copy is refused.
    const faucet = policies.find((p) => p.method === "mint")!;
    expect(() => toControllerSessionPolicies([faucet])).not.toThrow();
    expect(() => toControllerSessionPolicies([{ ...faucet }])).toThrow(/P-65/);
  });

  test("P-65: every entry point of the session passes the token guard, and none is a token method", () => {
    const listed = [...Object.values(CONTROLLER_ENTRY_POINTS).flat(), ECONOMY_ENTRY_POINT];
    expect(listed.filter(isTokenMethod)).toEqual([]);
    for (const ps of [policies, ...onEveryNetwork()]) {
      const methods = Object.values(toControllerSessionPolicies(ps).contracts).flatMap((c) => c.methods.map((m) => m.entrypoint));
      expect(methods.filter((m) => m !== "mint" && isTokenMethod(m))).toEqual([]);
    }
  });

  test("P-65: an approve added to the policies is refused before the controller sees it", () => {
    expect(() => toControllerSessionPolicies([...policies, { target: ECON.usdc, method: "approve" }])).toThrow(/No token approve in the session \(P-65\)/);
    expect(() => toControllerSessionPolicies([{ target: "0x4", method: "approve", description: "Entry" }])).toThrow(/P-65/);
  });

  test("the paid entry is one multicall of approve + spawn: one execute, so one prompt; no approve is signed in the session", async () => {
    const executions: Record<string, Call[][]> = {};
    await sentByEveryWrite(executions);
    for (const label of PAID) {
      expect(executions[label], label).toHaveLength(1);
      const [[request, approve, spawn, ...rest]] = executions[label];
      expect(rest).toEqual([]);
      // #645: the spawn's draw is requested first, in the same multicall (one prompt still: the approve prompts)
      expect(asTuple(request)).toEqual(vrfRequest(SPAWN_SALT));
      expect([BigInt(approve.contractAddress), approve.entrypoint]).toEqual([BigInt(ECON.usdc), "approve"]);
      expect([BigInt(spawn.contractAddress), spawn.entrypoint]).toEqual([BigInt(deployment.addresses.Challenge), "spawn"]);
      for (const ps of [policies, ...onEveryNetwork()]) {
        expect(inSession(approve, ps), `${label}: approve`).toBe(false);
        expect(inSession(spawn, ps), `${label}: spawn`).toBe(false);
      }
    }
  });

  test("the skins' purchase and save are signed in the session without any approve: they spend Cobbles, not a token", async () => {
    const sent = await sentByEveryWrite();
    expect(sent["skin purchase"].map((c) => [BigInt(c.contractAddress), c.entrypoint, c.calldata.map(Number)])).toEqual([[3n, "buy_skin", [1, 7]]]);
    expect(sent["skins saved"].map((c) => [BigInt(c.contractAddress), c.entrypoint, c.calldata.map(Number)])).toEqual([[3n, "set_skins", [2, 7, 1, 13, 0]]]);
    for (const label of ["skin purchase", "skins saved"]) {
      for (const call of sent[label]) expect(inSession(call, policies), `${label}: ${call.entrypoint}`).toBe(true);
    }
  });

  test("the Cobbles claims are signed in the session, Claim all's multicall too: one prompt-free transaction of five calls", async () => {
    const sent = await sentByEveryWrite();
    expect(sent["claim all"].map((c) => [BigInt(c.contractAddress), c.entrypoint])).toEqual([
      [3n, "claim_quest"], [3n, "claim_quest"], [3n, "claim_achievement"], [3n, "claim_daily_credit"], [3n, "claim_weekly_credit"],
    ]);
    for (const label of ["quest claim", "achievement claim", "daily credit", "weekly credit", "claim all"]) {
      for (const call of sent[label]) expect(inSession(call, policies), `${label}: ${call.entrypoint}`).toBe(true);
    }
    // A deployment without Setup has no claim policy at all.
    const none = resolveDeployment({ network: "sepolia", env: { rpcUrl: "http://s/rpc", addresses: { Challenge: "0x2" } } });
    expect(controllerPolicies(none).map((p) => p.method).filter((m) => m.startsWith("claim"))).toEqual([]);
  });

  test("the policies hold exactly the game's calls and the faucet's mint, nothing else", async () => {
    const sent = await sentByEveryWrite();
    const keys = new Set(GAME.flatMap((label) => sent[label].map((c) => key(c.contractAddress, c.entrypoint))));
    const expected = new Set([...keys, key("0x14", "mint")]);
    expect(new Set(policies.map((p) => key(p.target, p.method)))).toEqual(expected);
    // No registration since D-25 (E): no `Account.create`, nor any policy on the old Account address.
    expect(policies.map((p) => p.method)).not.toContain("create");
    expect(Object.keys(CONTROLLER_ENTRY_POINTS)).not.toContain("Account");
    // The game's and the purchase's writes hold no mint (the faucet's own are checked below).
    expect([...GAME, ...PAID].flatMap((label) => sent[label]).map((c) => c.entrypoint)).not.toContain("mint");
  });

  test("the faucet is in the session on Sepolia: mint() sends a mint, and a policy holds it", async () => {
    const sent = await sentByEveryWrite();
    expect(sent["faucet mint"].map((c) => c.entrypoint)).toEqual(["mint"]);
    const [mint] = sent["faucet mint"];
    expect(BigInt(mint.contractAddress)).toBe(BigInt("0x14"));
    for (const call of sent["faucet mint"]) expect(inSession(call, policies), call.entrypoint).toBe(true);
    expect(policies.filter((p) => p.method === "mint")).toEqual([{ target: "0x14", method: "mint", description: "Test USDC faucet" }]);
  });

  test("on mainnet there is no Faucet, no faucet write and no mint policy, whatever the env says", async () => {
    const sent = await sentByEveryWrite();
    expect(mainnet.faucet).toBe("");
    expect(sent["faucet on mainnet"]).toEqual([]);
    const onMainnet = controllerPolicies(mainnet, { economy: ECON.economy });
    expect(onMainnet.map((p) => p.method)).not.toContain("mint");
    // The test's USDC is 0x14 too: no policy at all on it on mainnet.
    expect(onMainnet.some((p) => BigInt(p.target) === BigInt("0x14"))).toBe(false);
    expect(toControllerSessionPolicies(onMainnet).contracts[getChecksumAddress("0x14")]).toBeUndefined();
    // A deployment with no Faucet at all (a Sepolia file without one) has none either.
    const none = resolveDeployment({ network: "sepolia", env: { rpcUrl: "http://s/rpc", addresses: { Challenge: "0x2", Token: "0x4" } } });
    expect(controllerPolicies(none).map((p) => p.method)).not.toContain("mint");
    // Nor a Setup (a deployment from before step D): it stays configured, with no claim policy on an empty target.
    expect(none.configured).toBe(true);
    expect(controllerPolicies(none).map((p) => p.method)).not.toContain("claim_tutorial");
  });

  test("the purchase approves USDC to Challenge for exactly stake x unit, in the multicall that prompts", async () => {
    const sent = await sentByEveryWrite();
    for (const [label, stake] of [["purchase, stake 1", 1], ["purchase, stake 10", MAX_STAKE]] as const) {
      const [, approve, spawn] = sent[label];
      expect(BigInt(approve.contractAddress)).toBe(BigInt(ECON.usdc));
      expect(approve.entrypoint).toBe("approve");
      const data = approve.calldata as string[];
      expect(BigInt(data[0])).toBe(BigInt(deployment.addresses.Challenge));
      expect(u256(data[1], data[2])).toBe(priceOf(FAKE_UNIT, stake));
      expect([BigInt(spawn.contractAddress), spawn.entrypoint]).toEqual([BigInt(deployment.addresses.Challenge), "spawn"]);
    }
  });

  test("the Vault falls outside the session: each of its writes prompts, the deposit's approve and deposit in one multicall", async () => {
    const executions: Record<string, Call[][]> = {};
    const sent = await sentByEveryWrite(executions);
    for (const label of PROMPTED) {
      expect(sent[label].length, label).toBeGreaterThan(0);
      expect(executions[label], label).toHaveLength(1);
      for (const call of sent[label]) expect(inSession(call, policies), `${label}: ${call.entrypoint}`).toBe(false);
    }
  });

  test("no policy names PAVED or the Vault (P10): a deposit's approve, the deposit and both exits prompt", async () => {
    const sent = await sentByEveryWrite();
    // The deposit is the PAVED approve to the Vault and `deposit`; the exits are `withdraw` and `redeem`, which take a free
    // `receiver`: in a session they would let its key move a holder's PAVED anywhere. Each is a wallet prompt.
    expect(sent["vault deposit"].map((c) => [BigInt(c.contractAddress), c.entrypoint])).toEqual([[BigInt(ECON.pavedToken), "approve"], [BigInt(ECON.vault), "deposit"]]);
    expect(sent["vault withdraw"].map((c) => c.entrypoint)).toEqual(["withdraw"]);
    expect(sent["vault withdraw all"].map((c) => c.entrypoint)).toEqual(["redeem"]);
    const every = onEveryNetwork().flat();
    for (const p of every) expect([ECON.pavedToken, ECON.vault].some((a) => BigInt(a) === BigInt(p.target)), `${p.target}:${p.method}`).toBe(false);
    for (const method of ["deposit", "withdraw", "redeem", "mint", "delegate", "delegate_by_sig", "stake", "unstake", "claim"]) {
      expect(every.some((p) => p.method === method && BigInt(p.target) !== BigInt("0x14")), method).toBe(false);
    }
    expect(toControllerSessionPolicies(controllerPolicies(deployment, { economy: ECON.economy })).contracts[getChecksumAddress(ECON.vault)]).toBeUndefined();
  });

  test("settle is a session policy when the Economy is given (P7a): the only Economy entry point", async () => {
    const sent = await sentByEveryWrite();
    const withEconomy = controllerPolicies(deployment, { economy: ECON.economy });
    expect(sent.settle.map((c) => [BigInt(c.contractAddress), c.entrypoint])).toEqual([[BigInt(ECON.economy), "settle"]]);
    expect(inSession(sent.settle[0], withEconomy)).toBe(true);
    // Exactly one more policy than without the Economy, and it is that one.
    expect(withEconomy.filter((p) => BigInt(p.target) === BigInt(ECON.economy))).toEqual([{ target: ECON.economy, method: "settle" }]);
    expect(withEconomy).toHaveLength(policies.length + 1);
    // Nothing else of the Economy, or of the Vault, is signed in the session.
    for (const label of PROMPTED) {
      for (const call of sent[label]) expect(inSession(call, withEconomy), `${label}: ${call.entrypoint}`).toBe(false);
    }
    // Without the Economy, or with an empty address, settle prompts as before.
    expect(inSession(sent.settle[0], policies)).toBe(false);
    expect(inSession(sent.settle[0], controllerPolicies(deployment, { economy: "" }))).toBe(false);
    expect(inSession(sent.settle[0], controllerPolicies(deployment, { economy: "0x0" }))).toBe(false);
  });

  test("a pack is one multicall of its approve to Setup, for exactly its price, and buy_pack: neither is in the session, one prompt", async () => {
    const executions: Record<string, Call[][]> = {};
    const sent = await sentByEveryWrite(executions);
    for (const label of PACKS) {
      expect(executions[label], label).toHaveLength(1);
      const [approve, buy] = sent[label];
      expect([BigInt(approve.contractAddress), approve.entrypoint, BigInt((approve.calldata as string[])[0])]).toEqual([BigInt(ECON.usdc), "approve", 3n]);
      expect([BigInt(buy.contractAddress), buy.entrypoint]).toEqual([3n, "buy_pack"]);
      for (const ps of [policies, ...onEveryNetwork()]) {
        expect(inSession(approve, ps), `${label}: approve`).toBe(false);
        expect(inSession(buy, ps), `${label}: buy_pack`).toBe(false);
      }
    }
    expect(u256((sent["pack, 1,000 for $70"][0].calldata as string[])[1], (sent["pack, 1,000 for $70"][0].calldata as string[])[2])).toBe(70_000_000n);
  });
});

describe("controllerPolicies", () => {
  test("D-20: no session policy for claim or sponsor (the reclaim was a claim of rank 0)", () => {
    for (const ps of [policies, ...onEveryNetwork()]) {
      expect(ps.filter((p) => p.method === "claim" || p.method === "sponsor")).toEqual([]);
    }
  });
});

describe("toControllerSessionPolicies", () => {
  test("groups the policies by checksummed target, in order", () => {
    const session = toControllerSessionPolicies(policies);
    expect(session.contracts[getChecksumAddress("0x2")].methods.map((m) => m.entrypoint)).toEqual(["spawn_free", "build", "discard", "surrender"]);
    expect(session.contracts[getChecksumAddress("0x3")].methods.map((m) => m.entrypoint)).toEqual([
      "claim_tutorial", "claim_quest", "claim_achievement", "claim_daily_credit", "claim_weekly_credit", "buy_skin", "set_skins",
    ]);
    expect(session.contracts[getChecksumAddress("0x14")].methods).toEqual([{ entrypoint: "mint", description: "Test USDC faucet" }]);
  });
});
