import type { ContractName } from "./abis";

/** `contracts/deployments/<network>.json`, as CORE's deploy script writes it (O-19). */
export interface DeploymentFile {
  chain_id?: string;
  rpc_url?: string;
  deployed_at?: string;
  deployed_block?: number;
  /** The symbol is for the record only: the app labels the token `PAVED` whatever it says (D-10, which replaces D-2's old label); reading it waits for P8's token. */
  token?: { address?: string; class_hash?: string; decimals?: number; symbol?: string };
  contracts?: Partial<Record<ContractName | "Faucet" | "Collection", { address?: string; class_hash?: string }>>;
}

/** Values from the environment; each one set overrides the file. */
export interface DeploymentEnv {
  rpcUrl?: string;
  deployedBlock?: string | number;
  addresses?: Partial<Record<ContractName, string>>;
  /** The `Faucet` of devnet or Sepolia (the faucet's token). */
  faucet?: string;
  /** The game NFT's Collection (E5b), optional. */
  collection?: string;
}

export interface Deployment {
  network: string;
  rpcUrl: string;
  chainId: string;
  /** First block to read events from. */
  deployedBlock: number;
  /** From the deployment file only; null when it is missing or not an integer 0..77: amounts are then not shown. */
  tokenDecimals: number | null;
  /** Addresses of the contracts; an empty string when unknown. `Setup` is optional: not part of `configured`. */
  addresses: Record<ContractName, string>;
  /** The `Faucet`, the faucet's token, on devnet and Sepolia; an empty string where there is none (mainnet, any other network). Not part of `configured`. */
  faucet: string;
  /** The game NFT's Collection (E5b), from `contracts.Collection` of the file or the env; an empty string when unknown. Not part of `configured`: a deployment before E5b has none. */
  collection: string;
  /**
   * True when the RPC URL and the required address (Challenge) are known: the only case where writes are offered.
   * `Account` is not one since D-25 (E): it left the deployment, and a file that still names it is read without it.
   */
  configured: boolean;
  /** What is missing when not configured, for the "not connected" state. */
  missing: string[];
}

const NAMES: ContractName[] = ["Challenge"];

/**
 * The networks that resolve a `Faucet` (the faucet's token): devnet, and Sepolia (D-16, P-39: the devnet economy path,
 * with the bounded faucet of `contracts/src/mocks/usdc.cairo`). Mainnet and any other network never do.
 */
export const FAUCET_NETWORKS: readonly string[] = ["devnet", "sepolia"];

/** An RPC URL a client can call: the file of a public network keeps a `$STARKNET_RPC_URL` placeholder, which is not one. */
function isRpcUrl(value: string | undefined): value is string {
  return !!value && /^https?:\/\/[^\s$]+$/i.test(value);
}

function isAddress(value: string | undefined): value is string {
  if (!value) return false;
  try {
    return BigInt(value) !== 0n;
  } catch {
    return false;
  }
}

/**
 * Merges the deployments file of a network with the environment, the environment first.
 * `configured` is computed here once.
 */
export function resolveDeployment(input: {
  network: string;
  file?: DeploymentFile | null;
  env?: DeploymentEnv;
}): Deployment {
  const file = input.file ?? {};
  const env = input.env ?? {};
  const addresses = {} as Record<ContractName, string>;
  const missing: string[] = [];

  for (const name of NAMES) {
    // The old `Token` is gone: the entry token is the one `Challenge.entry_price` names (the Faucet, the test USDC, on devnet
    // and Sepolia), read at run time (`PavedClient.balance`), not a deployment address.
    const value = env.addresses?.[name] || file.contracts?.[name]?.address;
    addresses[name] = isAddress(value) ? value : "";
    if (!addresses[name]) missing.push(`${name} address`);
  }

  // `Setup` (D-24) holds the quests and the tutorial claim. A deployment from before step D has none: it stays configured,
  // and only the claim is refused (`PavedWriter.claimTutorial`).
  const setup = env.addresses?.Setup || file.contracts?.Setup?.address;
  addresses.Setup = isAddress(setup) ? setup : "";

  // The file's `rpc_url` is used only when it is a URL: the Sepolia file holds the placeholder `$STARKNET_RPC_URL`, never
  // called. Without `VITE_RPC_URL` the deployment is then not connected, and says so.
  const rpcUrl = [env.rpcUrl?.trim(), file.rpc_url].find(isRpcUrl) ?? "";
  if (!rpcUrl) missing.push("RPC URL");

  const envBlock = env.deployedBlock === undefined || env.deployedBlock === "" ? NaN : Number(env.deployedBlock);
  const deployedBlock = Number.isInteger(envBlock) && envBlock >= 0 ? envBlock : (file.deployed_block ?? 0);

  // The faucet exists on the networks of `FAUCET_NETWORKS` only: no other one (mainnet) resolves a Faucet, whatever
  // its file or env holds.
  const faucet = FAUCET_NETWORKS.includes(input.network) ? env.faucet || file.contracts?.Faucet?.address : undefined;

  return {
    network: input.network,
    rpcUrl,
    chainId: file.chain_id ?? "",
    deployedBlock,
    tokenDecimals: Number.isInteger(file.token?.decimals) && file.token!.decimals! >= 0 && file.token!.decimals! <= 77 ? file.token!.decimals! : null,
    addresses,
    faucet: isAddress(faucet) ? faucet : "",
    collection: [env.collection, file.contracts?.Collection?.address].find(isAddress) ?? "",
    configured: missing.length === 0,
    missing,
  };
}
