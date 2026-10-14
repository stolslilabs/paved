import { getChecksumAddress, type Call } from "starknet";
import { describe, expect, test, vi } from "vitest";
import { createCodecs } from "../src/abis";
import {
  CONTROLLER_ENTRY_POINTS,
  VAULT_ENTRY_POINTS,
  controllerPolicies,
  createControllerConnector,
  toControllerSessionPolicies,
  type ControllerModule,
  type ControllerPolicy,
} from "../src/auth/controller";
import { resolveDeployment } from "../src/deployment";
import { MAX_STAKE, VAULT_SESSION_APPROVE_CAP, createEconomyClient, priceOf, resolveEconomyDeployment, settlesAfter } from "../src/economy";
import { PavedClient, type PavedRpc } from "../src/paved-client";
import { FAKE_CHAIN_ID, FAKE_ROUTER_FILE, FAKE_UNIT, FakeEconomy, FakePoolQuoter, fakeTerms } from "../src/testing";
import { FakeGameViews } from "../src/views";

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
/** The approve the app gives the session (`entryApprove`): the token entry_price names, MAX_STAKE x its unit. */
const USDC_APPROVE = { token: ECON.usdc, cap: BigInt(MAX_STAKE) * FAKE_UNIT };
const session = controllerPolicies(deployment, { approve: USDC_APPROVE });
const PLAYER = "0xc";
const DAY = 20_000;
const P = 10n ** 18n;

/**
 * Every write of the client outside devnet, the game's (`PavedWriter`) and the economy's (`EconomyWriter`, on E3's
 * committed ABIs), each against an account that records what it is asked to sign. Writes that throw after sending
 * (no GameSpawned in the fake receipt) count by what they sent.
 */
async function sentByEveryWrite(): Promise<Record<string, Call[]>> {
  let current: Call[] = [];
  const account = { address: PLAYER, execute: async (calls: Call[]) => (current.push(...calls), { transaction_hash: "0x1" }) };
  const rpc = {
    callContract: async () => [],
    getChainId: async () => FAKE_CHAIN_ID,
    getEvents: async () => ({ events: [] }),
    waitForTransaction: async () => ({ execution_status: "SUCCEEDED", events: [] }),
  } as unknown as PavedRpc;
  const gameViews = new FakeGameViews();
  gameViews.price = { token: ECON.usdc, amount: FAKE_UNIT };
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
  const move = { orientation: 1, x: 2, y: 3 };
  const writes: Record<string, () => Promise<unknown>> = {
    // The faucet (Faucet.mint): signed in the controller's session on Sepolia, where the deployment has a Faucet.
    "faucet mint": () => writer.mint(),
    "faucet on mainnet": () => mainnetWriter.mint(),
    // The tutorial claim (D-21): `Setup.claim_tutorial()`, signed in the session where the deployment has a Setup.
    "tutorial claim": () => writer.claimTutorial(),
    "challenge build": () => writer.build({ mode: "challenge", gameId: 1 }, move),
    "challenge discard": () => writer.discard({ mode: "challenge", gameId: 1 }),
    "challenge surrender": () => writer.surrender({ mode: "challenge", gameId: 1 }),
    "purchase, stake 1": () => econWriter.purchase({ stake: 1, confirmedPrice: priceOf(FAKE_UNIT, 1), confirmedMinOut: 1n, referrer: null }),
    "purchase, stake 10": () => econWriter.purchase({ stake: MAX_STAKE, confirmedPrice: priceOf(FAKE_UNIT, MAX_STAKE), confirmedMinOut: 1n, referrer: null }),
    settle: () => econWriter.settle([7]),
    "vault deposit": () => econWriter.deposit(P, { confirmedAmount: P }),
    "vault withdraw": () => econWriter.withdraw(P, { confirmedAmount: P }),
    "vault withdraw all": () => econWriter.withdrawAll({ confirmedShares: 2n * P }),
  };
  const sent: Record<string, Call[]> = {};
  for (const [label, write] of Object.entries(writes)) {
    current = [];
    await write().catch(() => undefined);
    sent[label] = current;
  }
  return sent;
}

const key = (target: string, method: string) => `${BigInt(target)}:${method}`;

/** A u256 argument from its two felts (low, high). */
const u256 = (low: string, high: string) => BigInt(low) + (BigInt(high) << 128n);

/** The call is signed in the session: a policy on its target and entry point, and for an approve its spender and at most its cap. */
function inSession(call: Call, ps: ControllerPolicy[]): boolean {
  const data = call.calldata as string[];
  return ps.some(
    (p) =>
      BigInt(p.target) === BigInt(call.contractAddress) &&
      p.method === call.entrypoint &&
      (p.method !== "approve" || (BigInt(data[0]) === BigInt(p.spender!) && u256(data[1], data[2]) <= p.amount!)),
  );
}

const GAME_AND_PURCHASE = [
  "tutorial claim", "challenge build", "challenge discard", "challenge surrender", "purchase, stake 1",
  "purchase, stake 10",
];
const PROMPTED = ["settle"];
const VAULT_WRITES = ["vault deposit", "vault withdraw", "vault withdraw all"];
/** The Vault's policies the app gives the session when the economy is deployed (`vaultPolicy`, P-56). */
const VAULT = { vault: ECON.vault, pavedToken: ECON.pavedToken, cap: VAULT_SESSION_APPROVE_CAP };
const withVault = controllerPolicies(deployment, { approve: USDC_APPROVE, vault: VAULT });

describe("controllerPolicies against what the writers send (E3)", () => {
  test("every game write and the paid Challenge purchase are signed in the session", async () => {
    const sent = await sentByEveryWrite();
    for (const label of GAME_AND_PURCHASE) {
      expect(sent[label].length, label).toBeGreaterThan(0);
      for (const call of sent[label]) expect(inSession(call, session), `${label}: ${call.entrypoint}`).toBe(true);
    }
    expect(sent["tutorial claim"].map((c) => [BigInt(c.contractAddress), c.entrypoint, c.calldata])).toEqual([[3n, "claim_tutorial", []]]);
  });

  test("the policies hold exactly those calls and the faucet's mint, nothing else", async () => {
    const sent = await sentByEveryWrite();
    const faucet = key("0x14", "mint");
    const keys = new Set(GAME_AND_PURCHASE.flatMap((label) => sent[label].map((c) => key(c.contractAddress, c.entrypoint))));
    const withFaucet = new Set([...keys, faucet]);
    expect(new Set(session.map((p) => key(p.target, p.method)))).toEqual(withFaucet);
    // Without the entry's approve, the session is the same minus approve.
    expect(new Set(policies.map((p) => key(p.target, p.method)))).toEqual(new Set([...withFaucet].filter((k) => !k.endsWith(":approve"))));
    // No registration since D-25 (E): no `Account.create`, nor any policy on the old Account address.
    expect(session.map((p) => p.method)).not.toContain("create");
    expect(Object.keys(CONTROLLER_ENTRY_POINTS)).not.toContain("Account");
    // The game's and the purchase's writes hold no mint (the faucet's own are checked below).
    expect(GAME_AND_PURCHASE.flatMap((label) => sent[label]).map((c) => c.entrypoint)).not.toContain("mint");
  });

  test("the faucet is in the session on Sepolia: mint() sends a mint, and a policy holds it", async () => {
    const sent = await sentByEveryWrite();
    expect(sent["faucet mint"].map((c) => c.entrypoint)).toEqual(["mint"]);
    const [mint] = sent["faucet mint"];
    expect(BigInt(mint.contractAddress)).toBe(BigInt("0x14"));
    for (const call of sent["faucet mint"]) {
      expect(inSession(call, session), `${call.entrypoint} with an approve cap`).toBe(true);
      expect(inSession(call, policies), `${call.entrypoint} without`).toBe(true);
    }
    expect(session.filter((p) => p.method === "mint")).toEqual([{ target: "0x14", method: "mint", description: "Test USDC faucet" }]);
  });

  test("on mainnet there is no Faucet, no faucet write and no mint policy, whatever the env says", async () => {
    const sent = await sentByEveryWrite();
    expect(mainnet.faucet).toBe("");
    expect(sent["faucet on mainnet"]).toEqual([]);
    const onMainnet = controllerPolicies(mainnet, { approve: USDC_APPROVE });
    expect(onMainnet.map((p) => p.method)).not.toContain("mint");
    // The entry token's approve may target this address (the test's USDC is 0x14 too); a mint never does.
    expect(onMainnet.some((p) => BigInt(p.target) === BigInt("0x14") && p.method === "mint")).toBe(false);
    expect(toControllerSessionPolicies(onMainnet).contracts[getChecksumAddress("0x14")]?.methods.map((m) => m.entrypoint) ?? []).not.toContain("mint");
    // A deployment with no Faucet at all (a Sepolia file without one) has none either.
    const none = resolveDeployment({ network: "sepolia", env: { rpcUrl: "http://s/rpc", addresses: { Challenge: "0x2", Token: "0x4" } } });
    expect(controllerPolicies(none).map((p) => p.method)).not.toContain("mint");
    // Nor a Setup (a deployment from before step D): it stays configured, with no claim policy on an empty target.
    expect(none.configured).toBe(true);
    expect(controllerPolicies(none).map((p) => p.method)).not.toContain("claim_tutorial");
  });

  test("the purchase approves USDC to Challenge for stake x unit; at stake 10 that is exactly the cap", async () => {
    const sent = await sentByEveryWrite();
    for (const [label, stake] of [["purchase, stake 1", 1], ["purchase, stake 10", MAX_STAKE]] as const) {
      const [approve, spawn] = sent[label];
      expect(BigInt(approve.contractAddress)).toBe(BigInt(ECON.usdc));
      expect(approve.entrypoint).toBe("approve");
      const data = approve.calldata as string[];
      expect(BigInt(data[0])).toBe(BigInt(deployment.addresses.Challenge));
      expect(u256(data[1], data[2])).toBe(priceOf(FAKE_UNIT, stake));
      expect([BigInt(spawn.contractAddress), spawn.entrypoint]).toEqual([BigInt(deployment.addresses.Challenge), "spawn"]);
    }
    expect(priceOf(FAKE_UNIT, MAX_STAKE)).toBe(USDC_APPROVE.cap);
  });

  test("vPAVED (P-56): deposit (its PAVED approve to the Vault within the cap), withdraw and redeem are in the session given the Vault", async () => {
    const sent = await sentByEveryWrite();
    expect(sent["vault deposit"].map((c) => [BigInt(c.contractAddress), c.entrypoint])).toEqual([[BigInt(ECON.pavedToken), "approve"], [BigInt(ECON.vault), "deposit"]]);
    expect(sent["vault withdraw"].map((c) => c.entrypoint)).toEqual(["withdraw"]);
    expect(sent["vault withdraw all"].map((c) => c.entrypoint)).toEqual(["redeem"]);
    for (const label of VAULT_WRITES) {
      for (const call of sent[label]) {
        expect(inSession(call, withVault), `${label}: ${call.entrypoint}`).toBe(true);
        // Without the Vault option they prompt.
        expect(inSession(call, session), `${label}: ${call.entrypoint} without the Vault`).toBe(false);
      }
    }
    // Exactly the Vault's three entry points and one PAVED approve, scoped to the Vault and capped.
    const added = withVault.filter((p) => !session.some((q) => q.target === p.target && q.method === p.method && q.spender === p.spender));
    expect(added).toEqual([
      { target: ECON.vault, method: "deposit" },
      { target: ECON.vault, method: "withdraw" },
      { target: ECON.vault, method: "redeem" },
      { target: ECON.pavedToken, method: "approve", spender: ECON.vault, amount: VAULT_SESSION_APPROVE_CAP },
    ]);
    expect([...VAULT_ENTRY_POINTS]).toEqual(["deposit", "withdraw", "redeem"]);
    for (const gone of ["stake", "unstake", "claim"]) expect(withVault.map((p) => p.method)).not.toContain(gone);
    // Above the cap, or to another spender, the PAVED approve prompts.
    const approveOf = (spender: string, amount: bigint): Call => ({
      contractAddress: ECON.pavedToken,
      entrypoint: "approve",
      calldata: [spender, `0x${(amount & ((1n << 128n) - 1n)).toString(16)}`, `0x${(amount >> 128n).toString(16)}`],
    });
    expect(inSession(approveOf(ECON.vault, VAULT_SESSION_APPROVE_CAP), withVault)).toBe(true);
    expect(inSession(approveOf(ECON.vault, VAULT_SESSION_APPROVE_CAP + 1n), withVault)).toBe(false);
    expect(inSession(approveOf(deployment.addresses.Challenge, 1n), withVault)).toBe(false);
    // No Vault address, or a cap of 0: no Vault policy, or no PAVED approve.
    expect(controllerPolicies(deployment, { vault: { ...VAULT, vault: "0x0" } })).toEqual(policies);
    expect(controllerPolicies(deployment, { vault: { ...VAULT, cap: 0n } }).map((p) => p.method)).not.toContain("approve");
    expect(toControllerSessionPolicies(withVault).contracts[getChecksumAddress(ECON.pavedToken)].methods).toEqual([
      { entrypoint: "approve", spender: getChecksumAddress(ECON.vault), amount: `0x${VAULT_SESSION_APPROVE_CAP.toString(16)}` },
    ]);
  });

  test("the purchase under P-56 (one swap in Economy, called by Challenge) sends the same two calls: USDC approve to Challenge, Challenge.spawn", async () => {
    const sent = await sentByEveryWrite();
    expect(sent["purchase, stake 1"].map((c) => [BigInt(c.contractAddress), c.entrypoint])).toEqual([[BigInt(ECON.usdc), "approve"], [BigInt(deployment.addresses.Challenge), "spawn"]]);
    // No policy on Economy or the router: the player never calls them.
    expect(withVault.some((p) => BigInt(p.target) === BigInt(ECON.economy))).toBe(false);
  });

  test("settle falls outside the session: it prompts", async () => {
    const sent = await sentByEveryWrite();
    for (const label of PROMPTED) {
      expect(sent[label].length, label).toBeGreaterThan(0);
      for (const call of sent[label]) expect(inSession(call, session), `${label}: ${call.entrypoint}`).toBe(false);
    }
  });

  test("with no approve in the session (entry unreadable), the purchase's approve prompts", async () => {
    const [approve, spawn] = (await sentByEveryWrite())["purchase, stake 1"];
    expect(inSession(approve, policies)).toBe(false);
    expect(inSession(spawn, policies)).toBe(true);
  });
});

describe("controllerPolicies", () => {
  test("D-20: no session policy for claim or sponsor (the reclaim was a claim of rank 0)", () => {
    for (const ps of [policies, session]) {
      expect(ps.filter((p) => p.method === "claim" || p.method === "sponsor")).toEqual([]);
    }
  });

  test("after E3 the entry is paid in USDC: the approve targets the token entry_price names, capped at 10 stakes", () => {
    const usdc = "0x5";
    const unit = 2_000_000n; // 2 USDC, 6 decimals
    const after = controllerPolicies(deployment, { approve: { token: usdc, cap: 10n * unit } });
    expect(after.filter((p) => p.method === "approve")).toEqual([{ target: usdc, method: "approve", spender: "0x2", amount: 20_000_000n }]);
    expect(after.filter((p) => p.method !== "approve")).toEqual(policies);
    const session = toControllerSessionPolicies(after);
    expect(session.contracts[getChecksumAddress(usdc)].methods).toEqual([{ entrypoint: "approve", spender: getChecksumAddress("0x2"), amount: "0x1312d00" }]);
    expect(session.contracts[getChecksumAddress("0x4")]).toBeUndefined();
  });

  test("no approve without a token that can be read, or with a cap of 0", () => {
    for (const approve of [null, undefined, { token: "0x4", cap: 0n }, { token: "0x0", cap: 10n }, { token: "", cap: 10n }]) {
      expect(controllerPolicies(deployment, { approve }).map((p) => p.method)).not.toContain("approve");
    }
  });
});

describe("toControllerSessionPolicies", () => {
  test("keeps an approve's spender and cap, which the package's own conversion drops", () => {
    const session = toControllerSessionPolicies(controllerPolicies(deployment, { approve: { token: "0x4", cap: 25n } }));
    const token = session.contracts[getChecksumAddress("0x4")];
    expect(token.methods).toEqual([{ entrypoint: "approve", spender: getChecksumAddress("0x2"), amount: "0x19" }]);
    expect(session.contracts[getChecksumAddress("0x2")].methods.map((m) => m.entrypoint)).toEqual(["spawn", "build", "discard", "surrender"]);
    expect(session.contracts[getChecksumAddress("0x3")].methods.map((m) => m.entrypoint)).toEqual(["claim_tutorial"]);
  });

  test("refuses an approve without a spender or a cap", () => {
    expect(() => toControllerSessionPolicies([{ target: "0x4", method: "approve" }])).toThrow(/spender and a cap/);
    expect(() => toControllerSessionPolicies([{ target: "0x4", method: "approve", spender: "0x2", amount: 0n }])).toThrow(/spender and a cap/);
  });
});

function fakeModule(options: { connects?: boolean; username?: () => Promise<string> | undefined } = {}) {
  const account = options.connects === false ? undefined : { address: "0xc" };
  const built: Array<Record<string, unknown>> = [];
  const disconnect = vi.fn(async () => {});
  const module = {
    default: class {
      constructor(options: Record<string, unknown>) {
        built.push(options);
      }
      probe = async () => undefined;
      connect = async () => account;
      disconnect = disconnect;
      username = options.username ?? (() => (account ? Promise.resolve("ada") : undefined));
    },
  } as unknown as ControllerModule;
  return { module, built, disconnect };
}

const SEPOLIA = "0x534e5f5345504f4c4941";

describe("createControllerConnector", () => {
  test("refuses without an RPC URL or session policies", () => {
    expect(() => createControllerConnector({ rpc: "", policies })).toThrow(/No RPC URL/);
    expect(() => createControllerConnector({ rpc: "http://s/rpc" })).toThrow(/No session policies/);
    expect(() => createControllerConnector({ rpc: "http://s/rpc", policies: [] })).toThrow(/No session policies/);
  });

  test("loads the package only when used, and hands it the converted policies", async () => {
    const { module, built } = fakeModule();
    const load = vi.fn(async () => module);
    const connector = createControllerConnector({ rpc: "http://s/rpc", chainId: SEPOLIA, policies }, { load, chainId: async () => SEPOLIA });
    expect(load).not.toHaveBeenCalled();
    await connector.disconnect();
    expect(load).not.toHaveBeenCalled();
    await expect(connector.connect()).resolves.toEqual({ address: "0xc" });
    await connector.probe();
    expect(load).toHaveBeenCalledTimes(1);
    expect(built).toEqual([{ chains: [{ rpcUrl: "http://s/rpc" }], defaultChainId: SEPOLIA, policies: toControllerSessionPolicies(policies), lazyload: true }]);
  });

  test("policies built at first use (the cap read then)", async () => {
    const { module, built } = fakeModule();
    const read = vi.fn(async () => controllerPolicies(deployment, { approve: USDC_APPROVE }));
    const connector = createControllerConnector({ rpc: "http://s/rpc", policies: read }, { load: async () => module, chainId: async () => SEPOLIA });
    expect(read).not.toHaveBeenCalled();
    await connector.connect();
    expect(built[0].policies).toEqual(toControllerSessionPolicies(controllerPolicies(deployment, { approve: USDC_APPROVE })));
  });

  test("an unknown chain id is read from the RPC, never left to the controller's mainnet default", async () => {
    const { module, built } = fakeModule();
    const chainId = vi.fn(async () => SEPOLIA);
    await createControllerConnector({ rpc: "http://s/rpc", chainId: "", policies }, { load: async () => module, chainId }).probe();
    expect(chainId).toHaveBeenCalledWith("http://s/rpc");
    expect(built[0].defaultChainId).toBe(SEPOLIA);
  });

  test("the deployment's chain id and the RPC's must agree", async () => {
    const { module, built } = fakeModule();
    const mainnet = "0x534e5f4d41494e";
    const connector = createControllerConnector({ rpc: "http://s/rpc", chainId: SEPOLIA, policies }, { load: async () => module, chainId: async () => mainnet });
    await expect(connector.connect()).rejects.toThrow(`Chain id mismatch: the deployment says ${SEPOLIA}, the RPC says ${mainnet}`);
    expect(built).toEqual([]);
    // Same chain in another spelling: accepted.
    const padded = `0x00${SEPOLIA.slice(2)}`;
    await createControllerConnector({ rpc: "http://s/rpc", chainId: padded, policies }, { load: async () => module, chainId: async () => SEPOLIA }).connect();
    expect(built[0].defaultChainId).toBe(padded);
  });

  test("an RPC that cannot say its chain: the deployment's id is used, and with none the connect is refused", async () => {
    const { module, built } = fakeModule();
    const down = async () => {
      throw new Error("down");
    };
    await createControllerConnector({ rpc: "http://s/rpc", chainId: SEPOLIA, policies }, { load: async () => module, chainId: down }).connect();
    expect(built[0].defaultChainId).toBe(SEPOLIA);
    const none = createControllerConnector({ rpc: "http://s/rpc", policies }, { load: async () => module, chainId: down });
    await expect(none.connect()).rejects.toThrow(/Cannot read the chain id/);
  });

  test("a connect without an account rejects; a failed load is tried again", async () => {
    const { module } = fakeModule({ connects: false });
    const load = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(module);
    const connector = createControllerConnector({ rpc: "http://s/rpc", chainId: SEPOLIA, policies }, { load, chainId: async () => SEPOLIA });
    await expect(connector.connect()).rejects.toThrow("offline");
    await expect(connector.connect()).rejects.toThrow("The controller did not connect");
    await expect(connector.probe()).resolves.toBeNull();
    expect(load).toHaveBeenCalledTimes(2);
  });

  test("disconnect reaches the controller once it is loaded", async () => {
    const { module, disconnect } = fakeModule();
    const connector = createControllerConnector({ rpc: "http://s/rpc", chainId: SEPOLIA, policies }, { load: async () => module, chainId: async () => SEPOLIA });
    await connector.connect();
    await connector.disconnect();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  // D-25 (E): the name is the Controller's username, off chain; no registration.
  test("username: the connected player's Controller username, or null before a connect, when none, or when it fails", async () => {
    const make = (username?: () => Promise<string> | undefined) =>
      createControllerConnector({ rpc: "http://s/rpc", chainId: SEPOLIA, policies }, { load: async () => fakeModule({ username }).module, chainId: async () => SEPOLIA });
    const connector = make();
    expect(await connector.username()).toBeNull(); // nothing loaded yet: no controller is asked
    await connector.connect();
    expect(await connector.username()).toBe("ada");
    for (const username of [() => undefined, () => Promise.resolve(""), () => Promise.reject(new Error("keychain down"))]) {
      const other = make(username);
      await other.connect();
      expect(await other.username()).toBeNull();
    }
  });
});
