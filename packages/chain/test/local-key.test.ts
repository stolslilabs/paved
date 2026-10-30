import { constants, ec, hash } from "starknet";
import { describe, expect, test, vi } from "vitest";
import {
  AccountDeployError,
  DEVICE_KEY,
  DEVICE_KEY_SIGNED_OUT,
  DEVNET_FUNDING,
  LOCAL_ACCOUNT_CLASS_HASH,
  STRK_ADDRESS,
  createLocalKeyConnector,
  deployedBy,
  isDeployed,
  localKey,
  newPrivateKey,
  type AccountProvider,
  type KeyStorage,
  type LocalKey,
} from "../src/auth/local-key";
import type { Call, WriteAccount } from "../src/writer";
import { refusedBeforeSending } from "../src/writer";

/** `localStorage` in memory. */
function memoryStorage(): KeyStorage & { items: Map<string, string> } {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
  };
}

const NOT_FOUND = Object.assign(new Error("RPC: starknet_getClassHashAt with params {} 20: Contract not found"), { code: 20 });

/** A node in memory: the addresses deployed, and the receipts it gives. */
function fakeNode(deployed: string[] = []) {
  const at = new Set(deployed.map((a) => BigInt(a)));
  const provider: AccountProvider = {
    getClassHashAt: vi.fn(async (address: string) => {
      if (!at.has(BigInt(address))) throw NOT_FOUND;
      return LOCAL_ACCOUNT_CLASS_HASH;
    }),
    waitForTransaction: async () => ({ execution_status: "SUCCEEDED" }),
  };
  return { provider, deploy: (address: string) => at.add(BigInt(address)) };
}

/** The connector on a fake node, with the key's signer recording its writes. */
function setup(options: { storage?: ReturnType<typeof memoryStorage>; deployed?: string[]; deploy?: (key: LocalKey) => Promise<void> } = {}) {
  const storage = options.storage ?? memoryStorage();
  const node = fakeNode(options.deployed);
  const sent: Array<{ by: string; calls: Call[] }> = [];
  const deploys: string[] = [];
  const deploy = vi.fn(
    options.deploy ??
      (async (key: LocalKey) => {
        deploys.push(key.address);
        node.deploy(key.address);
      }),
  );
  const account = (key: LocalKey): WriteAccount => ({
    address: key.address,
    execute: async (calls) => (sent.push({ by: key.address, calls }), { transaction_hash: "0x1" }),
  });
  const connector = createLocalKeyConnector({ storage, provider: node.provider, deploy, account });
  return { connector, storage, node, sent, deploys, deploy };
}

const CALL: Call = { contractAddress: "0x2", entrypoint: "build", calldata: [] };

describe("localKey", () => {
  test("the address is the account's counterfactual one: salt and constructor the public key, the zero deployer", () => {
    const key = localKey("0x1234");
    expect(key.publicKey).toBe(ec.starkCurve.getStarkKey("0x1234"));
    expect(key.address).toBe(hash.calculateContractAddressFromHash(key.publicKey, LOCAL_ACCOUNT_CLASS_HASH, [key.publicKey], 0));
    // The same key gives the same account; another class, another address.
    expect(localKey("0x1234").address).toBe(key.address);
    expect(localKey("0x1234", "0x99").address).not.toBe(key.address);
  });

  test("starknet-devnet 0.10.0's account 0 at seed 42: the address its node reports (a key it predeploys)", () => {
    // The devnet's printed key and public key (`starknet-devnet --seed 42`), not its address: a predeployed account is
    // not at a counterfactual address. The public key is what the account's constructor takes.
    const key = localKey("0x00000000000000000000000000000000b137668388dbe9acdfa3bc734cc2c469");
    expect(BigInt(key.publicKey)).toBe(0x05a5e37c60e77a0318643b111f88413a76af6233c891a0cfb2804106372006d4n);
  });

  test("newPrivateKey: a valid key, a new one each time", () => {
    const keys = new Set(Array.from({ length: 16 }, newPrivateKey));
    expect(keys.size).toBe(16);
    for (const key of keys) {
      expect(key).toMatch(/^0x[0-9a-f]{64}$/);
      expect(ec.starkCurve.utils.isValidPrivateKey(key.slice(2))).toBe(true);
    }
  });
});

describe("isDeployed", () => {
  test("a class at the address: deployed; contract not found: not; another failure is thrown", async () => {
    const { provider } = fakeNode(["0xa"]);
    expect(await isDeployed(provider, "0xa")).toBe(true);
    expect(await isDeployed(provider, "0xb")).toBe(false);
    const down: AccountProvider = { ...provider, getClassHashAt: async () => Promise.reject(new Error("fetch failed")) };
    await expect(isDeployed(down, "0xa")).rejects.toThrow("fetch failed");
  });

  test("starknet.js's RpcError shape (its code on `baseError`) is read as not found", async () => {
    const provider: AccountProvider = {
      getClassHashAt: async () => Promise.reject(Object.assign(new Error("RPC failed"), { baseError: { code: 20, message: "Contract not found" } })),
      waitForTransaction: async () => ({}),
    };
    expect(await isDeployed(provider, "0xa")).toBe(false);
  });
});

describe("createLocalKeyConnector", () => {
  test("no key yet: probe finds nothing; the first connect makes one and keeps it", async () => {
    const { connector, storage } = setup();
    expect(await connector.probe()).toBeNull();
    const account = await connector.connect();
    const kept = storage.items.get(DEVICE_KEY)!;
    expect(kept).toMatch(/^0x[0-9a-f]{64}$/);
    expect(account.address).toBe(localKey(kept).address);
    // Kept: the same account on the next connect, and found by a probe (no prompt).
    expect((await connector.connect()).address).toBe(account.address);
    expect((await connector.probe())?.address).toBe(account.address);
  });

  test("a reload keeps the account: a new connector on the same storage finds it", async () => {
    const first = setup();
    const address = (await first.connector.connect()).address;
    const reloaded = setup({ storage: first.storage });
    expect((await reloaded.connector.probe())?.address).toBe(address);
    expect((await reloaded.connector.connect()).address).toBe(address);
  });

  test("the first write deploys the account, then writes; later writes do not deploy again", async () => {
    const { connector, sent, deploys, deploy } = setup();
    const account = await connector.connect();
    expect(deploy).not.toHaveBeenCalled(); // a connect sends nothing
    await account.execute([CALL]);
    expect(deploys).toEqual([account.address]);
    expect(sent).toEqual([{ by: account.address, calls: [CALL] }]);
    await account.execute([CALL]);
    expect(deploy).toHaveBeenCalledTimes(1);
    expect(sent).toHaveLength(2);
  });

  test("an account already deployed (a reload after its first write) is not deployed again", async () => {
    const storage = memoryStorage();
    storage.setItem(DEVICE_KEY, "0x1234");
    const { connector, deploy, sent } = setup({ storage, deployed: [localKey("0x1234").address] });
    await (await connector.probe())!.execute([CALL]);
    expect(deploy).not.toHaveBeenCalled();
    expect(sent).toHaveLength(1);
  });

  test("two writes at once deploy once", async () => {
    const { connector, deploy } = setup();
    const account = await connector.connect();
    await Promise.all([account.execute([CALL]), account.execute([CALL])]);
    expect(deploy).toHaveBeenCalledTimes(1);
  });

  test("a failed deployment sends nothing, reads as a refusal before sending, and is tried again at the next write", async () => {
    let fail = true;
    const node: string[] = [];
    const { connector, sent, deploy } = setup({
      deploy: async (key) => {
        if (fail) throw new Error("insufficient balance");
        node.push(key.address);
      },
    });
    const account = await connector.connect();
    const error = await account.execute([CALL]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AccountDeployError);
    expect((error as Error).message).toBe("The account could not be deployed: insufficient balance");
    expect(refusedBeforeSending(error)).toBe(true);
    expect(sent).toEqual([]);
    fail = false;
    await account.execute([CALL]);
    expect(deploy).toHaveBeenCalledTimes(2);
    expect(sent).toHaveLength(1);
  });

  test("disconnect keeps the key: no probe reconnects it, the next connect finds the same account", async () => {
    const { connector, storage } = setup();
    const address = (await connector.connect()).address;
    await connector.disconnect();
    expect(storage.items.get(DEVICE_KEY_SIGNED_OUT)).toBe("1");
    expect(await connector.probe()).toBeNull();
    expect(await setup({ storage }).connector.probe()).toBeNull(); // a reload neither
    expect((await connector.connect()).address).toBe(address);
    expect(storage.items.has(DEVICE_KEY_SIGNED_OUT)).toBe(false);
    expect((await connector.probe())?.address).toBe(address);
  });

  test("disconnect without a key leaves nothing behind", async () => {
    const { connector, storage } = setup();
    await connector.disconnect();
    expect(storage.items.size).toBe(0);
  });

  test("reset: a new key and a new account, connected; the old key is gone", async () => {
    const { connector, storage } = setup();
    const before = await connector.connect();
    const oldKey = storage.items.get(DEVICE_KEY);
    await connector.disconnect();
    const after = await connector.reset();
    expect(after.address).not.toBe(before.address);
    expect(storage.items.get(DEVICE_KEY)).not.toBe(oldKey);
    expect(storage.items.has(DEVICE_KEY_SIGNED_OUT)).toBe(false);
    expect((await connector.probe())?.address).toBe(after.address);
  });

  test("a stored value that is not a key is forgotten: a new one at the next connect", async () => {
    const storage = memoryStorage();
    storage.setItem(DEVICE_KEY, "not a key");
    const { connector } = setup({ storage });
    expect(await connector.probe()).toBeNull();
    expect(storage.items.has(DEVICE_KEY)).toBe(false);
    await connector.connect();
    expect(storage.items.get(DEVICE_KEY)).toMatch(/^0x[0-9a-f]{64}$/);
  });

  test("only the private key is stored, under its own name: nothing else is written", async () => {
    const { connector, storage } = setup();
    await connector.connect();
    expect([...storage.items.keys()]).toEqual([DEVICE_KEY]);
  });
});

describe("deployedBy (the devnet's deployer)", () => {
  test("one multicall: the UDC deploys the account at its counterfactual address, then the fee token funds it", async () => {
    const sent: Array<{ calls: Call[]; details?: { tip?: bigint } }> = [];
    const deployer: WriteAccount = { address: "0xd", execute: async (calls, details) => (sent.push({ calls, details }), { transaction_hash: "0x7" }) };
    const waited: string[] = [];
    const provider = { waitForTransaction: async (hash: string) => (waited.push(hash), { execution_status: "SUCCEEDED" }) };
    const key = localKey("0x1234");
    await deployedBy({ deployer, provider, tip: 0n })(key);
    expect(sent).toEqual([
      {
        calls: [
          { contractAddress: constants.UDC.ADDRESS, entrypoint: constants.UDC.ENTRYPOINT, calldata: [LOCAL_ACCOUNT_CLASS_HASH, key.publicKey, "0x0", "0x1", key.publicKey] },
          { contractAddress: STRK_ADDRESS, entrypoint: "transfer", calldata: [key.address, `0x${DEVNET_FUNDING.toString(16)}`, "0x0"] },
        ],
        details: { tip: 0n },
      },
    ]);
    expect(waited).toEqual(["0x7"]);
  });

  test("no funding: the deploy alone; a reverted deployment is an error", async () => {
    const sent: Call[][] = [];
    const deployer: WriteAccount = { address: "0xd", execute: async (calls) => (sent.push(calls), { transaction_hash: "0x7" }) };
    const reverted = { waitForTransaction: async () => ({ execution_status: "REVERTED", revert_reason: "UDC: already deployed" }) };
    await expect(deployedBy({ deployer, provider: reverted, funding: 0n })(localKey("0x1234"))).rejects.toThrow("UDC: already deployed");
    expect(sent[0]!.map((c) => c.entrypoint)).toEqual([constants.UDC.ENTRYPOINT]);
  });
});
