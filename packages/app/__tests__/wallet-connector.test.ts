import { describe, expect, it, vi } from "vitest";
import { DEVICE_KEY, PavedClient, localKey, resolveDeployment, type DeployLocalAccount, type KeyStorage, type LocalKey, type PavedRpc, type WriteAccount } from "@paved/chain";
import type { Deployer } from "../src/wallet/connector";

type Call = Parameters<WriteAccount["execute"]>[0][number];

// starknet.js's `Account` counted (the devnet deployer is the only one built here), and the node's `getClassHashAt`: no
// account is deployed on this fake node until `deployed` holds its address.
const node = vi.hoisted(() => ({ accounts: [] as string[], deployed: new Set<string>() }));
vi.mock("starknet", async (original) => {
  const actual = await original<typeof import("starknet")>();
  class Account {
    readonly address: string;
    constructor(options: { address: string }) {
      node.accounts.push(options.address);
      this.address = options.address;
    }
    execute = async () => ({ transaction_hash: "0xd" });
  }
  class RpcProvider {
    getClassHashAt = async (address: string) => {
      if (node.deployed.has(BigInt(address).toString(16))) return "0x1";
      throw Object.assign(new Error("Contract not found"), { code: 20 });
    };
    waitForTransaction = async () => ({ execution_status: "SUCCEEDED" });
  }
  return { ...actual, Account, RpcProvider };
});

const { connectorFor } = await import("../src/wallet/connector");

const CHALLENGE = "0x0123";
const DEPLOYER: Deployer = { address: "0xdeadbeefcafe0001", key: "0xfeedfacedummykey1234" };

function client(network: string, configured = true): PavedClient {
  const deployment = resolveDeployment({ network, env: { rpcUrl: "http://rpc.test", addresses: configured ? { Challenge: CHALLENGE } : {} } });
  return new PavedClient(deployment, {} as PavedRpc);
}

function memoryStorage(): KeyStorage & { items: Map<string, string> } {
  const items = new Map<string, string>();
  return { items, getItem: (k) => items.get(k) ?? null, setItem: (k, v) => void items.set(k, v), removeItem: (k) => void items.delete(k) };
}

/** The key's signer and the deployments, recorded. */
function fakes() {
  const sent: Array<{ by: string; calls: Call[]; details?: { tip?: bigint } }> = [];
  const deployed: string[] = [];
  const account = () => (key: LocalKey): WriteAccount => ({ address: key.address, execute: async (calls, details) => (sent.push({ by: key.address, calls, details }), { transaction_hash: "0x1" }) });
  const deploy = vi.fn(
    (_provider: unknown, deployer: Deployer | null): DeployLocalAccount =>
      async (key) => {
        deployed.push(`${deployer?.address ?? "self"}:${key.address}`);
        node.deployed.add(BigInt(key.address).toString(16));
      },
  );
  return { sent, deployed, deps: { account, deploy }, deploy };
}

const CALL: Call = { contractAddress: CHALLENGE, entrypoint: "build", calldata: [] };

describe("the app's connector: the device's local key (#918, phase A)", () => {
  it("a new browser: no account until Connect, which makes a key in the storage; its account is the key's", async () => {
    const storage = memoryStorage();
    const connector = connectorFor(client("devnet"), DEPLOYER, storage, fakes().deps);
    expect(await connector.probe()).toBeNull();
    const account = await connector.connect();
    expect(account.address).toBe(localKey(storage.items.get(DEVICE_KEY)!).address);
    expect(await connector.username()).toBeNull();
  });

  it("a reload keeps the same account: a new connector on the same storage finds it without a prompt", async () => {
    const storage = memoryStorage();
    const address = (await connectorFor(client("devnet"), DEPLOYER, storage, fakes().deps).connect()).address;
    expect((await connectorFor(client("devnet"), DEPLOYER, storage, fakes().deps).probe())?.address).toBe(address);
  });

  it("on devnet the deployer deploys the account on its first write, never again; the writes tip nothing", async () => {
    const f = fakes();
    const connector = connectorFor(client("devnet"), DEPLOYER, memoryStorage(), f.deps);
    const account = await connector.connect();
    expect(f.deployed).toEqual([]);
    await account.execute([CALL], { tip: 0n });
    await account.execute([CALL], { tip: 0n });
    expect(f.deployed).toEqual([`${DEPLOYER.address}:${account.address}`]);
    expect(f.sent.map((s) => s.by)).toEqual([account.address, account.address]);
    // The writer of the account: devnet's tip 0.
    const writer = connector.signer(account) as unknown as { options: { tip?: bigint; account: WriteAccount } };
    expect(writer.options.tip).toBe(0n);
    expect(writer.options.account).toBe(account);
  });

  it("outside devnet the account deploys itself, and the deployer is never used even when given", async () => {
    const f = fakes();
    const connector = connectorFor(client("sepolia"), DEPLOYER, memoryStorage(), f.deps);
    const account = await connector.connect();
    await account.execute([CALL]);
    expect(f.deployed).toEqual([`self:${account.address}`]);
    expect((connector.signer(account) as unknown as { options: { tip?: bigint } }).options.tip).toBeUndefined();
  });

  it("the real deployments: on devnet the deployer's Account; without a deployer the first write is refused", async () => {
    node.accounts.length = 0;
    const storage = memoryStorage();
    const sent: string[] = [];
    const account = () => (key: LocalKey): WriteAccount => ({ address: key.address, execute: async () => (sent.push(key.address), { transaction_hash: "0x1" }) });
    const withDeployer = await connectorFor(client("devnet"), DEPLOYER, storage, { account }).connect();
    expect(node.accounts).toEqual([DEPLOYER.address]);
    node.deployed.add(BigInt(withDeployer.address).toString(16)); // the deployer's multicall, as the node would show it
    await withDeployer.execute([CALL]);
    expect(sent).toEqual([withDeployer.address]);

    const none = await connectorFor(client("devnet"), null, memoryStorage(), { account }).connect();
    await expect(none.execute([CALL])).rejects.toThrow(/no devnet deployer: set VITE_DEPLOYER_ADDRESS and VITE_DEPLOYER_PRIVATE_KEY/);
    expect(sent).toHaveLength(1);
  });

  it("Disconnect keeps the key and stops the reconnect; Reset makes a new key and account", async () => {
    const storage = memoryStorage();
    const connector = connectorFor(client("devnet"), DEPLOYER, storage, fakes().deps);
    const first = await connector.connect();
    await connector.disconnect();
    expect(await connector.probe()).toBeNull();
    expect((await connector.connect()).address).toBe(first.address);
    const key = storage.items.get(DEVICE_KEY);
    const next = await connector.reset();
    expect(next.address).not.toBe(first.address);
    expect(storage.items.get(DEVICE_KEY)).not.toBe(key);
    expect((await connector.probe())?.address).toBe(next.address);
  });

  it("refused on an incomplete deployment outside devnet", () => {
    expect(() => connectorFor(client("sepolia", false), null, memoryStorage(), fakes().deps)).toThrow(/Not connected: .* missing/);
  });
});
