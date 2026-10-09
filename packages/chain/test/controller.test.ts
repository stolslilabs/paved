import { getChecksumAddress, type Call } from "starknet";
import { describe, expect, test, vi } from "vitest";
import { createCodecs } from "../src/abis";
import { controllerPolicies, createControllerConnector, toControllerSessionPolicies, type ControllerModule } from "../src/auth/controller";
import { resolveDeployment } from "../src/deployment";
import { PavedClient, type PavedRpc } from "../src/paved-client";
import { rewardOf } from "../src/prize";
import type { GameViews, TournamentView } from "../src/views";

const deployment = resolveDeployment({
  network: "sepolia",
  env: { rpcUrl: "http://s/rpc", addresses: { Account: "0x1", Daily: "0x2", Tutorial: "0x3", Token: "0x4" } },
});
const policies = controllerPolicies(deployment);
const ENTRY = 25n;
/** The entry approve the app gives the session: the entry token, 10 x the unit price. */
const TOKEN_APPROVE = { token: "0x4", cap: 10n * ENTRY };

const TOURNAMENT: TournamentView = {
  id: 3, startTime: 0, endTime: 1, over: true, prize: 600n,
  top1PlayerId: "0x9", top1Score: 10, top1Claimed: false,
  top2PlayerId: "0x8", top2Score: 9, top2Claimed: false,
  top3PlayerId: "0x7", top3Score: 8, top3Claimed: false,
};

/** Every write of `PavedWriter` outside devnet, against an account that records what it is asked to sign. */
async function callsOfEveryWrite(): Promise<Call[]> {
  const sent: Call[] = [];
  const account = { address: "0xc", execute: async (calls: Call[]) => (sent.push(...calls), { transaction_hash: "0x1" }) };
  const rpc = {
    callContract: async () => [],
    getEvents: async () => ({ events: [] }),
    waitForTransaction: async () => ({ execution_status: "SUCCEEDED", events: [] }),
  } as unknown as PavedRpc;
  const views = { entryPrice: async () => ({ token: "0x4", amount: ENTRY }), tournament: async () => TOURNAMENT } as unknown as GameViews;
  const writer = new PavedClient(deployment, rpc, createCodecs(), views).writer(account);
  const move = { orientation: 1, x: 2, y: 3, role: 0, spot: 0 };
  // `spawn` finds no GameSpawned in the fake receipt and throws after sending: what was signed is what counts.
  const each = [
    () => writer.createPlayer("ada"),
    () => writer.spawn("daily", { confirmedAmount: ENTRY }),
    () => writer.spawn("tutorial"),
    () => writer.build({ mode: "daily", gameId: 1 }, move),
    () => writer.build({ mode: "tutorial", gameId: 1 }, move),
    () => writer.discard({ mode: "daily", gameId: 1 }),
    () => writer.discard({ mode: "tutorial", gameId: 1 }),
    () => writer.surrender({ mode: "daily", gameId: 1 }),
    () => writer.surrender({ mode: "tutorial", gameId: 1 }),
    () => writer.claim(3, 1, { confirmedReward: rewardOf(TOURNAMENT, 1) }),
    () => writer.sponsor(ENTRY, { confirmedAmount: ENTRY }),
  ];
  for (const write of each) await write().catch(() => undefined);
  return sent;
}

const key = (target: string, method: string) => `${BigInt(target)}:${method}`;

describe("controllerPolicies", () => {
  test("hold exactly the calls the writer sends outside devnet; approve only pinned to Daily, with a cap", async () => {
    const sent = await callsOfEveryWrite();
    const capped = controllerPolicies(deployment, { approve: TOKEN_APPROVE });
    const sentKeys = new Set(sent.map((c) => key(c.contractAddress, c.entrypoint)));
    expect(new Set(capped.map((p) => key(p.target, p.method)))).toEqual(sentKeys);
    // Without a cap, approve is not in the session at all.
    expect(new Set(policies.map((p) => key(p.target, p.method)))).toEqual(new Set([...sentKeys].filter((k) => !k.endsWith(":approve"))));
    // Every approve the writer sends names the Daily contract, the one spender the session allows.
    const approves = sent.filter((c) => c.entrypoint === "approve");
    expect(approves.length).toBeGreaterThan(0);
    for (const c of approves) expect(BigInt((c.calldata as string[])[0])).toBe(BigInt(deployment.addresses.Daily));
    expect(capped.find((p) => p.method === "approve")).toEqual({ target: "0x4", method: "approve", spender: "0x2", amount: 250n });
    // The Daily spawn's approve fits under the cap.
    for (const c of approves) expect(BigInt((c.calldata as string[])[1])).toBeLessThanOrEqual(250n);
    expect(sent.map((c) => c.entrypoint)).not.toContain("mint");
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
    const session = toControllerSessionPolicies(controllerPolicies(deployment, { approve: { token: "0x4", cap: ENTRY } }));
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
    const read = vi.fn(async () => controllerPolicies(deployment, { approve: TOKEN_APPROVE }));
    const connector = createControllerConnector({ rpc: "http://s/rpc", policies: read }, { load: async () => module, chainId: async () => SEPOLIA });
    expect(read).not.toHaveBeenCalled();
    await connector.connect();
    expect(built[0].policies).toEqual(toControllerSessionPolicies(controllerPolicies(deployment, { approve: TOKEN_APPROVE })));
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
