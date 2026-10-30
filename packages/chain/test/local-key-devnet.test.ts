/**
 * The local-key connector on a real node (#918, phase A): a new key's account deployed by the devnet's deployer on its
 * first write, then that write signed by the key. Needs only a starknet-devnet node, no deployment of Paved:
 *
 *   starknet-devnet --host 127.0.0.1 --port 5050 --seed 42
 *   PAVED_DEVNET=1 vitest run test/local-key-devnet.test.ts      # DEVNET_RPC_URL for another node
 *
 * CI has no devnet: skipped there.
 */
import { Account, RpcProvider } from "starknet";
import { describe, expect, test } from "vitest";
import { DEVICE_KEY, LOCAL_ACCOUNT_CLASS_HASH, STRK_ADDRESS, createLocalKeyConnector, deployedBy, deployedBySelf, isDeployed, localKey, newPrivateKey, starknetAccount, type KeyStorage } from "../src/auth/local-key";
import { rpc } from "./devnet/devnet";

const enabled = process.env.PAVED_DEVNET === "1";
const RPC_URL = process.env.DEVNET_RPC_URL ?? "http://127.0.0.1:5050";

describe.skipIf(!enabled)("local key on devnet", () => {
  test("a new key: deployed by the deployer on its first write, which it signs; a reload keeps the account", { timeout: 60_000 }, async () => {
    const provider = new RpcProvider({ nodeUrl: RPC_URL });
    const [zero] = (await rpc(RPC_URL, "devnet_getPredeployedAccounts")) as Array<{ address: string; private_key: string }>;
    const deployer = new Account({ provider, address: zero!.address, signer: zero!.private_key });
    const items = new Map<string, string>();
    const storage: KeyStorage = { getItem: (k) => items.get(k) ?? null, setItem: (k, v) => void items.set(k, v), removeItem: (k) => void items.delete(k) };
    const options = { storage, provider, deploy: deployedBy({ deployer, provider, tip: 0n }), account: starknetAccount(provider) };

    const account = await createLocalKeyConnector(options).connect();
    expect(await isDeployed(provider, account.address)).toBe(false);
    // The write: 1 fri of STRK back to the deployer (any call would do).
    const { transaction_hash } = await account.execute([{ contractAddress: STRK_ADDRESS, entrypoint: "transfer", calldata: [deployer.address, "0x1", "0x0"] }], { tip: 0n });
    const receipt = (await provider.waitForTransaction(transaction_hash)) as { execution_status?: string };
    expect(receipt.execution_status).toBe("SUCCEEDED");
    expect(BigInt(await provider.getClassHashAt(account.address))).toBe(BigInt(LOCAL_ACCOUNT_CLASS_HASH));

    // A reload: a new connector on the same storage, the same account, already deployed.
    const again = await createLocalKeyConnector(options).probe();
    expect(again?.address).toBe(account.address);
    expect(items.get(DEVICE_KEY)).toBeTruthy();
    const second = await again!.execute([{ contractAddress: STRK_ADDRESS, entrypoint: "transfer", calldata: [deployer.address, "0x1", "0x0"] }], { tip: 0n });
    expect(((await provider.waitForTransaction(second.transaction_hash)) as { execution_status?: string }).execution_status).toBe("SUCCEEDED");
  });

  test("where there is no deployer: the account deploys itself from its funded address (a DEPLOY_ACCOUNT)", { timeout: 60_000 }, async () => {
    const provider = new RpcProvider({ nodeUrl: RPC_URL });
    const items = new Map<string, string>();
    const storage: KeyStorage = { getItem: (k) => items.get(k) ?? null, setItem: (k, v) => void items.set(k, v), removeItem: (k) => void items.delete(k) };
    const privateKey = newPrivateKey();
    storage.setItem(DEVICE_KEY, privateKey);
    // A network that charges fees: the address is funded first (here by the devnet's mint).
    await rpc(RPC_URL, "devnet_mint", { address: localKey(privateKey).address, amount: 10 ** 19, unit: "FRI" });
    const account = (await createLocalKeyConnector({ storage, provider, deploy: deployedBySelf({ provider, tip: 0n }), account: starknetAccount(provider) }).probe())!;
    const { transaction_hash } = await account.execute([{ contractAddress: STRK_ADDRESS, entrypoint: "transfer", calldata: [account.address, "0x1", "0x0"] }], { tip: 0n });
    expect(((await provider.waitForTransaction(transaction_hash)) as { execution_status?: string }).execution_status).toBe("SUCCEEDED");
    expect(await isDeployed(provider, account.address)).toBe(true);
  });
});
