import type { ContractName } from "./abis";

/** `contracts/deployments/<network>.json`, as CORE's deploy script writes it (O-19). */
export interface DeploymentFile {
  chain_id?: string;
  rpc_url?: string;
  deployed_at?: string;
  deployed_block?: number;
  /** The symbol is for the record only: the app labels the token `PAVED` whatever it says (D-10, which replaces D-2's old label); reading it waits for P8's token. */
  token?: { address?: string; class_hash?: string; decimals?: number; symbol?: string };
  contracts?: Partial<Record<ContractName | "MockUSDC", { address?: string; class_hash?: string }>>;
}

/** Values from the environment; each one set overrides the file. */
export interface DeploymentEnv {
  rpcUrl?: string;
  deployedBlock?: string | number;
  addresses?: Partial<Record<ContractName, string>>;
  /** The devnet's `MockUSDC` (the faucet's token). */
  mockUsdc?: string;
}

export interface Deployment {
  network: string;
  rpcUrl: string;
  chainId: string;
  /** First block to read events from. */
  deployedBlock: number;
  /** From the deployment file only; null when it is missing or not an integer 0..77: amounts are then not shown. */
  tokenDecimals: number | null;
  /** Addresses of the four contracts; an empty string when unknown. */
  addresses: Record<ContractName, string>;
  /** The devnet's `MockUSDC`, the faucet's token; an empty string where there is none (every other network). Not part of `configured`. */
  mockUsdc: string;
  /** True when the RPC URL and the four addresses are known: the only case where writes are offered. */
  configured: boolean;
  /** What is missing when not configured, for the "not connected" state. */
  missing: string[];
}

const NAMES: ContractName[] = ["Account", "Daily", "Tutorial", "Token"];

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
    const value = env.addresses?.[name] || file.contracts?.[name]?.address;
    addresses[name] = isAddress(value) ? value : "";
    if (!addresses[name]) missing.push(`${name} address`);
  }

  const rpcUrl = env.rpcUrl || file.rpc_url || "";
  if (!rpcUrl) missing.push("RPC URL");

  const envBlock = env.deployedBlock === undefined || env.deployedBlock === "" ? NaN : Number(env.deployedBlock);
  const deployedBlock = Number.isInteger(envBlock) && envBlock >= 0 ? envBlock : (file.deployed_block ?? 0);

  const mockUsdc = env.mockUsdc || file.contracts?.MockUSDC?.address;

  return {
    network: input.network,
    rpcUrl,
    chainId: file.chain_id ?? "",
    deployedBlock,
    tokenDecimals: Number.isInteger(file.token?.decimals) && file.token!.decimals! >= 0 && file.token!.decimals! <= 77 ? file.token!.decimals! : null,
    addresses,
    mockUsdc: isAddress(mockUsdc) ? mockUsdc : "",
    configured: missing.length === 0,
    missing,
  };
}
