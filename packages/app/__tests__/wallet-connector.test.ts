import { describe, expect, it, vi } from "vitest";
import { PavedClient, resolveDeployment, type ControllerConfig, type PavedRpc, type WriteAccount } from "@paved/chain";

// starknet.js's `Account` counted: the burner is the only code that builds one.
const accounts = vi.hoisted(() => ({ built: 0 }));
vi.mock("starknet", async (original) => {
  const actual = await original<typeof import("starknet")>();
  class Account {
    readonly address: string;
    constructor(options: { address: string }) {
      accounts.built += 1;
      this.address = options.address;
    }
  }
  return { ...actual, Account };
});

const { connectorFor } = await import("../src/wallet/connector");

const CHALLENGE = "0x0123";
const BURNER = { address: "0xdeadbeefcafe0001", key: "0xfeedfacedummykey1234" };

function client(network: string): PavedClient {
  const deployment = resolveDeployment({ network, env: { rpcUrl: "http://rpc.test", addresses: { Challenge: CHALLENGE } } });
  return new PavedClient(deployment, {} as PavedRpc);
}

/** A controller in memory: the account it connects is its own. */
function fakeController() {
  const account: WriteAccount = { address: "0xc0ffee", execute: async () => ({ transaction_hash: "0x1" }) };
  const configs: ControllerConfig[] = [];
  const create = (config: ControllerConfig) => {
    configs.push(config);
    return {
      id: "controller" as const,
      name: "Cartridge Controller",
      config,
      probe: async () => null,
      connect: async () => account,
      disconnect: async () => {},
      username: async () => "ada",
    };
  };
  return { create, configs, account };
}

describe("the app's connector (P6)", () => {
  it("on Sepolia, with a key given, builds no Account: the controller connects", async () => {
    accounts.built = 0;
    const controller = fakeController();
    const connector = connectorFor(client("sepolia"), BURNER, controller.create);
    expect(controller.configs).toHaveLength(1);
    expect(await connector.connect()).toBe(controller.account);
    expect(accounts.built).toBe(0);
  });

  it("on devnet, the burner's account; refused without one", async () => {
    accounts.built = 0;
    const controller = fakeController();
    const connector = connectorFor(client("devnet"), BURNER, controller.create);
    expect((await connector.connect()).address).toBe(BURNER.address);
    expect(accounts.built).toBe(1);
    expect(controller.configs).toHaveLength(0);
    expect(() => connectorFor(client("devnet"), null, controller.create)).toThrow(/no devnet account/);
  });

  it("the session holds Economy.settle (P7a) when the build has an economy, and no other Economy entry point", async () => {
    const policiesOf = async (economy: string | null) => {
      const controller = fakeController();
      connectorFor(client("sepolia"), null, controller.create, economy);
      const policies = controller.configs[0]!.policies;
      return typeof policies === "function" ? await policies() : (policies ?? []);
    };
    const economy = "0x10";
    const withEconomy = await policiesOf(economy);
    expect(withEconomy.filter((p) => BigInt(p.target) === BigInt(economy))).toEqual([{ target: economy, method: "settle" }]);
    // Settle takes no approve: the session's only approve stays the entry's, which this deployment's unread price leaves out.
    expect(withEconomy.filter((p) => p.method === "approve")).toEqual([]);
    // Without an economy there is no policy on it.
    expect((await policiesOf(null)).some((p) => p.method === "settle")).toBe(false);
  });
});
