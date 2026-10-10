import { getChecksumAddress, type Call } from "starknet";
import { describe, expect, test, vi } from "vitest";
import { createCodecs } from "../src/abis";
import {
  controllerPolicies,
  createControllerConnector,
  toControllerSessionPolicies,
  type ControllerModule,
  type ControllerPolicy,
} from "../src/auth/controller";
import { resolveDeployment } from "../src/deployment";
import { MAX_STAKE, createEconomyClient, priceOf, resolveEconomyDeployment, settlesAfter } from "../src/economy";
import { PavedClient, type PavedRpc } from "../src/paved-client";
import { rewardOf } from "../src/prize";
import { FAKE_UNIT, FakeEconomy, FakePoolQuoter, fakeTerms } from "../src/testing";
import { FakeGameViews, type TournamentView } from "../src/views";

const deployment = resolveDeployment({
  network: "sepolia",
  env: { rpcUrl: "http://s/rpc", addresses: { Account: "0x1", Daily: "0x2", Tutorial: "0x3", Token: "0x4" } },
});
const policies = controllerPolicies(deployment);
/** The economy of the same deployment (E3): the Daily entry is paid in USDC. */
const ECON = { economy: "0x10", pavedToken: "0x11", vault: "0x12", usdc: "0x13" };
/** The approve the app gives the session (`entryApprove`): the token entry_price names, MAX_STAKE x its unit. */
const USDC_APPROVE = { token: ECON.usdc, cap: BigInt(MAX_STAKE) * FAKE_UNIT };
const session = controllerPolicies(deployment, { approve: USDC_APPROVE });
const PLAYER = "0xc";
const DAY = 20_000;
const P = 10n ** 18n;

const TOURNAMENT: TournamentView = {
  id: 3, startTime: 0, endTime: 1, over: true, prize: 600n,
  top1PlayerId: "0x9", top1Score: 10, top1Claimed: false,
  top2PlayerId: "0x8", top2Score: 9, top2Claimed: false,
  top3PlayerId: "0x7", top3Score: 8, top3Claimed: false,
};

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
    getEvents: async () => ({ events: [] }),
    waitForTransaction: async () => ({ execution_status: "SUCCEEDED", events: [] }),
  } as unknown as PavedRpc;
  const gameViews = new FakeGameViews();
  gameViews.price = { token: ECON.usdc, amount: FAKE_UNIT };
  gameViews.tournaments.set(3, TOURNAMENT);
  const client = new PavedClient(deployment, rpc, createCodecs(), gameViews);
  const writer = client.writer(account);
  const economy = new FakeEconomy();
  economy.terms_.set(7, fakeTerms({ stake: 2, day: DAY }));
  economy.setBalance("paved", PLAYER, 5n * P);
  economy.vaults.set(BigInt(PLAYER).toString(16), { staked: 2n * P, pending: 3n, totalStaked: 2n * P });
  const econ = createEconomyClient(resolveEconomyDeployment({ base: deployment, env: ECON }), client, economy, new FakePoolQuoter())!;
  const econWriter = econ.writer(writer, { now: () => settlesAfter(DAY) });
  const move = { orientation: 1, x: 2, y: 3, role: 0, spot: 0 };
  const writes: Record<string, () => Promise<unknown>> = {
    "create player": () => writer.createPlayer("ada"),
    "daily spawn (sends nothing since E3)": () => writer.spawn("daily"),
    "tutorial spawn": () => writer.spawn("tutorial"),
    "daily build": () => writer.build({ mode: "daily", gameId: 1 }, move),
    "tutorial build": () => writer.build({ mode: "tutorial", gameId: 1 }, move),
    "daily discard": () => writer.discard({ mode: "daily", gameId: 1 }),
    "tutorial discard": () => writer.discard({ mode: "tutorial", gameId: 1 }),
    "daily surrender": () => writer.surrender({ mode: "daily", gameId: 1 }),
    "tutorial surrender": () => writer.surrender({ mode: "tutorial", gameId: 1 }),
    claim: () => writer.claim(3, 1, { confirmedReward: rewardOf(TOURNAMENT, 1) }),
    "sponsor within the cap": () => writer.sponsor(FAKE_UNIT, { confirmedAmount: FAKE_UNIT }),
    "sponsor above the cap": () => writer.sponsor(USDC_APPROVE.cap + 1n, { confirmedAmount: USDC_APPROVE.cap + 1n }),
    "purchase, stake 1": () => econWriter.purchase({ stake: 1, confirmedPrice: priceOf(FAKE_UNIT, 1), referrer: null }),
    "purchase, stake 10": () => econWriter.purchase({ stake: MAX_STAKE, confirmedPrice: priceOf(FAKE_UNIT, MAX_STAKE), referrer: null }),
    settle: () => econWriter.settle([7]),
    "vault stake": () => econWriter.stake(P, { confirmedAmount: P }),
    "vault unstake": () => econWriter.unstake(P, { confirmedAmount: P }),
    "vault claim": () => econWriter.claimDividends({ confirmedAmount: 3n }),
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
  "create player", "tutorial spawn", "daily build", "tutorial build", "daily discard", "tutorial discard",
  "daily surrender", "tutorial surrender", "claim", "sponsor within the cap", "purchase, stake 1", "purchase, stake 10",
];
const PROMPTED = ["settle", "vault stake", "vault unstake", "vault claim"];

describe("controllerPolicies against what the writers send (E3)", () => {
  test("every game write and the paid Daily purchase are signed in the session", async () => {
    const sent = await sentByEveryWrite();
    for (const label of GAME_AND_PURCHASE) {
      expect(sent[label].length, label).toBeGreaterThan(0);
      for (const call of sent[label]) expect(inSession(call, session), `${label}: ${call.entrypoint}`).toBe(true);
    }
    expect(sent["daily spawn (sends nothing since E3)"]).toEqual([]);
  });

  test("the policies hold exactly those calls, nothing else; no faucet", async () => {
    const sent = await sentByEveryWrite();
    const keys = new Set(GAME_AND_PURCHASE.flatMap((label) => sent[label].map((c) => key(c.contractAddress, c.entrypoint))));
    expect(new Set(session.map((p) => key(p.target, p.method)))).toEqual(keys);
    // Without the entry's approve, the session is the same minus approve.
    expect(new Set(policies.map((p) => key(p.target, p.method)))).toEqual(new Set([...keys].filter((k) => !k.endsWith(":approve"))));
    expect(Object.values(sent).flat().map((c) => c.entrypoint)).not.toContain("mint");
  });

  test("the purchase approves USDC to Daily for stake x unit; at stake 10 that is exactly the cap", async () => {
    const sent = await sentByEveryWrite();
    for (const [label, stake] of [["purchase, stake 1", 1], ["purchase, stake 10", MAX_STAKE]] as const) {
      const [approve, spawn] = sent[label];
      expect(BigInt(approve.contractAddress)).toBe(BigInt(ECON.usdc));
      expect(approve.entrypoint).toBe("approve");
      const data = approve.calldata as string[];
      expect(BigInt(data[0])).toBe(BigInt(deployment.addresses.Daily));
      expect(u256(data[1], data[2])).toBe(priceOf(FAKE_UNIT, stake));
      expect([BigInt(spawn.contractAddress), spawn.entrypoint]).toEqual([BigInt(deployment.addresses.Daily), "spawn"]);
    }
    expect(priceOf(FAKE_UNIT, MAX_STAKE)).toBe(USDC_APPROVE.cap);
  });

  test("settle and the Vault fall outside the session: each prompts", async () => {
    const sent = await sentByEveryWrite();
    for (const label of PROMPTED) {
      expect(sent[label].length, label).toBeGreaterThan(0);
      for (const call of sent[label]) expect(inSession(call, session), `${label}: ${call.entrypoint}`).toBe(false);
    }
  });

  test("a sponsor above the cap: its approve prompts, its sponsor call is in the session", async () => {
    const [approve, sponsor] = (await sentByEveryWrite())["sponsor above the cap"];
    expect(approve.entrypoint).toBe("approve");
    expect(inSession(approve, session)).toBe(false);
    expect(inSession(sponsor, session)).toBe(true);
  });

  test("with no approve in the session (entry unreadable), the purchase's approve prompts", async () => {
    const [approve, spawn] = (await sentByEveryWrite())["purchase, stake 1"];
    expect(inSession(approve, policies)).toBe(false);
    expect(inSession(spawn, policies)).toBe(true);
  });
});

describe("controllerPolicies", () => {
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
    expect(session.contracts[getChecksumAddress("0x3")].methods.map((m) => m.entrypoint)).toEqual(["spawn", "build", "discard", "surrender"]);
  });

  test("refuses an approve without a spender or a cap", () => {
    expect(() => toControllerSessionPolicies([{ target: "0x4", method: "approve" }])).toThrow(/spender and a cap/);
    expect(() => toControllerSessionPolicies([{ target: "0x4", method: "approve", spender: "0x2", amount: 0n }])).toThrow(/spender and a cap/);
  });
});

function fakeModule(options: { connects?: boolean } = {}) {
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
});
