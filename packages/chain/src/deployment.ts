import type { ContractName } from "./abis";

/** `contracts/deployments/<network>.json`, as CORE's deploy script writes it (O-19). */
export interface DeploymentFile {
  chain_id?: string;
  rpc_url?: string;
  deployed_at?: string;
  deployed_block?: number;
  /** The symbol is for the record only: the app labels the token `PAVED` whatever it says (D-10, which replaces D-2's old label); reading it waits for P8's token. */
  token?: { address?: string; class_hash?: string; decimals?: number; symbol?: string };
  /** `MockVrfProvider`: the devnet's VRF provider (#638), read by `vrfProvider`. */
  contracts?: Partial<Record<ContractName | "Faucet" | "Collection" | "MockVrfProvider", { address?: string; class_hash?: string }>>;
}

/** Values from the environment; each one set overrides the file. */
export interface DeploymentEnv {
  rpcUrl?: string;
  deployedBlock?: string | number;
  addresses?: Partial<Record<ContractName, string>>;
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
  /** Addresses of the contracts; an empty string when unknown. `Setup`, `Avatar`, `Village`, `Rewards`, `Matchmaker` and `Arena` are optional: not part of `configured`. */
  addresses: Record<ContractName, string>;
  /** The `Faucet`, the faucet's token, on devnet and Sepolia; an empty string where there is none (mainnet, any other network). Not part of `configured`. */
  faucet: string;
  /** The game NFT's Collection (E5b), from `contracts.Collection` of the file or the env; an empty string when unknown. Not part of `configured`: a deployment before E5b has none. */
  collection: string;
  /**
   * The VRF provider a drawing write requests from (#638, `vrfProvider`): Cartridge's on Sepolia and mainnet, the file's
   * `contracts.MockVrfProvider` on the devnet; an empty string where there is none. Not part of `configured`.
   */
  vrfProvider: string;
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

/** Cartridge's VRF provider (#638), the same address on mainnet and on Sepolia (cartridge-gg/vrf, README). */
export const CARTRIDGE_VRF_PROVIDER = "0x051fea4450da9d6aee758bdeba88b2f665bcbf549d2c61421aa724e9ac0ced8f";

/** The networks that draw through Cartridge's provider. The devnet draws through the mock (`contracts.MockVrfProvider`). */
export const CARTRIDGE_VRF_NETWORKS: readonly string[] = ["sepolia", "mainnet"];

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
 * The VRF provider of a network (#638, `docs/architecture/vrf-draws.md`): Cartridge's on Sepolia and mainnet; on the devnet
 * the mock the deployment file records (`contracts.MockVrfProvider`); an empty string where there is none. Here rather
 * than in ./vrf, which imports starknet: this module is in the client's entry chunk.
 */
export function vrfProvider(network: string, file?: DeploymentFile | null): string {
  if (CARTRIDGE_VRF_NETWORKS.includes(network)) return CARTRIDGE_VRF_PROVIDER;
  if (network !== "devnet") return "";
  const address = file?.contracts?.MockVrfProvider?.address;
  return isAddress(address) ? address : "";
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
  // `Avatar` (#627) holds the avatar items and each player's avatar. A deployment without it stays configured: the avatar
  // reads are `not-configured` and its writes refused.
  const avatar = env.addresses?.Avatar || file.contracts?.Avatar?.address;
  addresses.Avatar = isAddress(avatar) ? avatar : "";
  // `Village` (#640) and `Rewards` (#642): the player's village, its rewards and the tiers. Optional as `Avatar`: without them
  // the village's reads are `not-configured` and its writes refused.
  // `Matchmaker` (#639, #644) and `Arena` (#643): the PvP flow (#647). Optional too: without them the PvP reads are
  // `not-configured` and its writes refused.
  for (const name of ["Village", "Rewards", "Matchmaker", "Arena"] as const) {
    const value = env.addresses?.[name] || file.contracts?.[name]?.address;
    addresses[name] = isAddress(value) ? value : "";
  }

  // The file's `rpc_url` is used only when it is a URL: the Sepolia file holds the placeholder `$STARKNET_RPC_URL`, never
  // called. Without `VITE_RPC_URL` the deployment is then not connected, and says so.
  const rpcUrl = [env.rpcUrl?.trim(), file.rpc_url].find(isRpcUrl) ?? "";
  if (!rpcUrl) missing.push("RPC URL");

  const envBlock = env.deployedBlock === undefined || env.deployedBlock === "" ? NaN : Number(env.deployedBlock);
  const deployedBlock = Number.isInteger(envBlock) && envBlock >= 0 ? envBlock : (file.deployed_block ?? 0);

  // The faucet is `contracts.Faucet` of the file and nothing else (no env override): it is also the entry token and the economy's
  // USDC (`resolveEconomyDeployment` reads this one value), so the mint and the payment cannot name different tokens.
  // It exists on the networks of `FAUCET_NETWORKS` only: no other one (mainnet) resolves a Faucet, whatever
  // its file or env holds.
  const faucet = FAUCET_NETWORKS.includes(input.network) ? file.contracts?.Faucet?.address : undefined;

  return {
    network: input.network,
    rpcUrl,
    chainId: file.chain_id ?? "",
    deployedBlock,
    tokenDecimals: Number.isInteger(file.token?.decimals) && file.token!.decimals! >= 0 && file.token!.decimals! <= 77 ? file.token!.decimals! : null,
    addresses,
    faucet: isAddress(faucet) ? faucet : "",
    collection: [env.collection, file.contracts?.Collection?.address].find(isAddress) ?? "",
    vrfProvider: vrfProvider(input.network, file),
    configured: missing.length === 0,
    missing,
  };
}
