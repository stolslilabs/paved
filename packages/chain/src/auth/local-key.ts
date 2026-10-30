import { Account, RpcProvider, constants, ec, encode, hash } from "starknet";
import type { ReceiptProvider, WriteAccount } from "../writer";

// The local-key connector (#918, phase A; docs/architecture/accounts.md): a Stark key pair made on this device and kept in
// its storage, and the account of that key, at its counterfactual address, deployed on its first write. The writes are
// signed by the key itself: no session, no policy, no prompt. The key never leaves the device: only the public key goes in
// a transaction (the account's constructor and its salt).

/**
 * The account class of a local key: the OpenZeppelin account (one Stark key, constructor `(public_key)`) that
 * starknet-devnet 0.10.0 predeploys and declares. A network that deploys local keys must have it declared.
 */
export const LOCAL_ACCOUNT_CLASS_HASH = "0x05b4b537eaa2399e3aa99c4e2e0208ebd6c71bc1467938cd52c798c601e43564";

/** STRK, the fee token: the same address on mainnet, Sepolia and starknet-devnet. */
export const STRK_ADDRESS = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

/** What a devnet deployer gives a new account for its fees: 10 STRK, about 7,000 writes at the devnet's prices. */
export const DEVNET_FUNDING = 10n * 10n ** 18n;

/** Where the key is kept: `localStorage`, or a map in the tests. */
export interface KeyStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** The storage key of the device's private key. */
export const DEVICE_KEY = "paved:device-key";
/** Set while the player is disconnected: the key is kept, and no reload reconnects it until Connect. */
export const DEVICE_KEY_SIGNED_OUT = "paved:device-key:signed-out";

/** A key pair and the address of its account. */
export interface LocalKey {
  privateKey: string;
  publicKey: string;
  address: string;
}

/** A new private key, from the platform's cryptographic random (`crypto.getRandomValues`), reduced onto the curve. */
export function newPrivateKey(): string {
  return encode.addHexPrefix(encode.buf2hex(ec.starkCurve.utils.randomPrivateKey()));
}

/**
 * The key pair of `privateKey` and its account's address: deployed with the public key as its salt and its only
 * constructor argument, from the zero deployer, so the address is the same whether the account deploys itself (a
 * DEPLOY_ACCOUNT) or a deployer deploys it through the UDC (not unique).
 */
export function localKey(privateKey: string, classHash: string = LOCAL_ACCOUNT_CLASS_HASH): LocalKey {
  const publicKey = ec.starkCurve.getStarkKey(privateKey);
  return { privateKey, publicKey, address: hash.calculateContractAddressFromHash(publicKey, classHash, [publicKey], 0) };
}

/** The node reads the connector needs: whether an account is deployed, and a transaction's receipt. */
export interface AccountProvider extends ReceiptProvider {
  getClassHashAt(address: string): Promise<string>;
}

/** Deploys the account of `key` and resolves once its deployment is accepted. */
export type DeployLocalAccount = (key: LocalKey) => Promise<void>;

/** The node's "contract not found" (RPC code 20): the address holds no contract yet. */
function notFound(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, baseError, message } = error as { code?: unknown; baseError?: { code?: unknown }; message?: unknown };
  return code === 20 || baseError?.code === 20 || (typeof message === "string" && /\b20: Contract not found/i.test(message));
}

/** Whether an account is deployed at `address`; a node's other failure is thrown. */
export async function isDeployed(provider: AccountProvider, address: string): Promise<boolean> {
  try {
    await provider.getClassHashAt(address);
    return true;
  } catch (error) {
    if (notFound(error)) return false;
    throw error;
  }
}

async function accepted(provider: ReceiptProvider, transactionHash: string): Promise<void> {
  const receipt = (await provider.waitForTransaction(transactionHash, { retryInterval: 250 })) as { execution_status?: string; revert_reason?: string };
  if (receipt.execution_status === "REVERTED") throw new Error(receipt.revert_reason ?? "the deployment reverted");
}

/**
 * The devnet's deployment (#918, phase A): the deployer account the deployments use deploys the account through the UDC
 * and gives it `funding` STRK for its fees, in one multicall. The deployer's key is a devnet's public one.
 */
export function deployedBy(options: {
  deployer: WriteAccount;
  provider: ReceiptProvider;
  classHash?: string;
  funding?: bigint;
  tip?: bigint;
}): DeployLocalAccount {
  const { deployer, provider, classHash = LOCAL_ACCOUNT_CLASS_HASH, funding = DEVNET_FUNDING, tip } = options;
  return async (key) => {
    const calls = [
      // (class hash, salt, not from zero: false, calldata): the zero deployer's address, as `localKey` computes it.
      { contractAddress: constants.UDC.ADDRESS, entrypoint: constants.UDC.ENTRYPOINT, calldata: [classHash, key.publicKey, "0x0", "0x1", key.publicKey] },
      ...(funding > 0n ? [{ contractAddress: STRK_ADDRESS, entrypoint: "transfer", calldata: [key.address, `0x${funding.toString(16)}`, "0x0"] }] : []),
    ];
    const { transaction_hash } = await deployer.execute(calls, tip === undefined ? undefined : { tip });
    await accepted(provider, transaction_hash);
  };
}

/**
 * The account deploys itself (a DEPLOY_ACCOUNT, signed by its key): where there is no deployer. Its fees are paid from its
 * own address, so the network must be free of fees or the address funded first.
 */
export function deployedBySelf(options: { provider: RpcProvider; classHash?: string; tip?: bigint }): DeployLocalAccount {
  const { provider, classHash = LOCAL_ACCOUNT_CLASS_HASH, tip } = options;
  return async (key) => {
    const account = new Account({ provider, address: key.address, signer: key.privateKey });
    const payload = { classHash, constructorCalldata: [key.publicKey], addressSalt: key.publicKey, contractAddress: key.address };
    const { transaction_hash } = await account.deployAccount(payload, tip === undefined ? undefined : { tip });
    await accepted(provider, transaction_hash);
  };
}

/** The error of a failed deployment: nothing of the write was sent (the writer reads code 20 as a refusal before sending). */
export class AccountDeployError extends Error {
  readonly code = 20;
  constructor(detail: string) {
    super(`The account could not be deployed: ${detail}`);
    this.name = "AccountDeployError";
  }
}

export interface LocalKeyConnectorOptions {
  storage: KeyStorage;
  provider: AccountProvider;
  deploy: DeployLocalAccount;
  /** The signing account of a key (starknet.js's `Account` on the RPC); tests give a fake one. */
  account: (key: LocalKey) => WriteAccount;
  classHash?: string;
}

export interface LocalKeyConnector {
  /** The account of the key kept on this device, unless the player disconnected; null without one. No prompt. */
  probe(): Promise<WriteAccount | null>;
  /** The account of the device's key, made on the first connect. */
  connect(): Promise<WriteAccount>;
  /** Keeps the key (the next Connect finds the same account) and stops reconnecting on a reload. */
  disconnect(): Promise<void>;
  /** Forgets the device's key and connects with a new one: a new account (for testing). */
  reset(): Promise<WriteAccount>;
}

/**
 * The local-key connector. The account it returns deploys itself before its first write (`deploy`, once per key, when the
 * node finds no contract at its address); a failed deployment is tried again at the next write.
 */
export function createLocalKeyConnector(options: LocalKeyConnectorOptions): LocalKeyConnector {
  const { storage, provider, deploy, classHash } = options;
  const accounts = new Map<string, WriteAccount>();

  const stored = (): LocalKey | null => {
    const privateKey = storage.getItem(DEVICE_KEY);
    if (!privateKey) return null;
    try {
      return localKey(privateKey, classHash);
    } catch {
      // Not a key (edited by hand): forgotten, a new one is made at the next connect.
      storage.removeItem(DEVICE_KEY);
      return null;
    }
  };

  const accountOf = (key: LocalKey): WriteAccount => {
    const known = accounts.get(key.privateKey);
    if (known) return known;
    const signer = options.account(key);
    let deployed: Promise<void> | null = null;
    const ensureDeployed = () => {
      deployed ??= (async () => {
        try {
          if (!(await isDeployed(provider, key.address))) await deploy(key);
        } catch (error) {
          throw new AccountDeployError(error instanceof Error ? error.message : String(error));
        }
      })();
      deployed.catch(() => (deployed = null));
      return deployed;
    };
    const account: WriteAccount = {
      address: key.address,
      async execute(calls, details) {
        await ensureDeployed();
        return signer.execute(calls, details);
      },
    };
    accounts.set(key.privateKey, account);
    return account;
  };

  const connect = async () => {
    let key = stored();
    if (!key) {
      key = localKey(newPrivateKey(), classHash);
      storage.setItem(DEVICE_KEY, key.privateKey);
    }
    storage.removeItem(DEVICE_KEY_SIGNED_OUT);
    return accountOf(key);
  };

  return {
    async probe() {
      if (storage.getItem(DEVICE_KEY_SIGNED_OUT)) return null;
      const key = stored();
      return key ? accountOf(key) : null;
    },
    connect,
    async disconnect() {
      if (storage.getItem(DEVICE_KEY)) storage.setItem(DEVICE_KEY_SIGNED_OUT, "1");
    },
    async reset() {
      storage.removeItem(DEVICE_KEY);
      return connect();
    },
  };
}

/** starknet.js's `Account` of `key` on `provider`: what the connector signs with in the client. */
export function starknetAccount(provider: RpcProvider): (key: LocalKey) => WriteAccount {
  return (key) => new Account({ provider, address: key.address, signer: key.privateKey });
}
