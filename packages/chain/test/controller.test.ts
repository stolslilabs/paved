import { describe, expect, test, vi } from "vitest";
import { CONTROLLER_ENTRY_POINTS, controllerPolicies, createControllerConnector, type ControllerModule } from "../src/auth/controller";
import { resolveDeployment } from "../src/deployment";

const deployment = resolveDeployment({
  network: "sepolia",
  env: { rpcUrl: "http://s/rpc", addresses: { Account: "0x1", Daily: "0x2", Tutorial: "0x3", Token: "0x4" } },
});
const policies = controllerPolicies(deployment);

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
    toSessionPolicies: (p: unknown) => ({ converted: p }),
  } as unknown as ControllerModule;
  return { module, built, disconnect };
}

describe("controllerPolicies", () => {
  test("one policy per entry point the writer sends, on the deployment's addresses; no faucet", () => {
    expect(policies).toHaveLength(Object.values(CONTROLLER_ENTRY_POINTS).flat().length);
    expect(policies.map((p) => p.method)).not.toContain("mint");
    expect(policies.every((p) => BigInt(p.target) !== 0n)).toBe(true);
  });
});

describe("createControllerConnector", () => {
  test("refuses without an RPC URL or session policies", () => {
    expect(() => createControllerConnector({ rpc: "", policies })).toThrow(/No RPC URL/);
    expect(() => createControllerConnector({ rpc: "http://s/rpc" })).toThrow(/No session policies/);
    expect(() => createControllerConnector({ rpc: "http://s/rpc", policies: [] })).toThrow(/No session policies/);
  });

  test("loads the package only when used", async () => {
    const { module, built } = fakeModule();
    const load = vi.fn(async () => module);
    const connector = createControllerConnector({ rpc: "http://s/rpc", chainId: "0x5", policies }, { load });
    expect(load).not.toHaveBeenCalled();
    await connector.disconnect();
    expect(load).not.toHaveBeenCalled();
    await expect(connector.connect()).resolves.toEqual({ address: "0xc" });
    await connector.probe();
    expect(load).toHaveBeenCalledTimes(1);
    expect(built).toEqual([{ chains: [{ rpcUrl: "http://s/rpc" }], defaultChainId: "0x5", policies: { converted: policies }, lazyload: true }]);
  });

  test("an unknown chain id is read from the RPC, never left to the controller's mainnet default", async () => {
    const { module, built } = fakeModule();
    const chainId = vi.fn(async () => "0x534e5f5345504f4c4941");
    await createControllerConnector({ rpc: "http://s/rpc", chainId: "", policies }, { load: async () => module, chainId }).probe();
    expect(chainId).toHaveBeenCalledWith("http://s/rpc");
    expect(built[0].defaultChainId).toBe("0x534e5f5345504f4c4941");
  });

  test("a connect without an account rejects; a failed load is tried again", async () => {
    const { module } = fakeModule({ connects: false });
    const load = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(module);
    const connector = createControllerConnector({ rpc: "http://s/rpc", chainId: "0x5", policies }, { load });
    await expect(connector.connect()).rejects.toThrow("offline");
    await expect(connector.connect()).rejects.toThrow("The controller did not connect");
    await expect(connector.probe()).resolves.toBeNull();
    expect(load).toHaveBeenCalledTimes(2);
  });

  test("disconnect reaches the controller once it is loaded", async () => {
    const { module, disconnect } = fakeModule();
    const connector = createControllerConnector({ rpc: "http://s/rpc", chainId: "0x5", policies }, { load: async () => module });
    await connector.connect();
    await connector.disconnect();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
