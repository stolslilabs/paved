import { Account, RpcProvider } from "starknet";
import { createIndexerClient, resolveDeployment } from "@paved/chain";
import type { Deployment, DeploymentFile, IndexerClient, WriteAccount } from "@paved/chain";

/** The `VITE_*` variables the app reads; each one set overrides `contracts/deployments/<network>.json`. */
export interface NetworkEnv {
  VITE_NETWORK?: string;
  VITE_RPC_URL?: string;
  VITE_DEPLOYED_BLOCK?: string;
  VITE_ACCOUNT_ADDRESS?: string;
  VITE_DAILY_ADDRESS?: string;
  VITE_TUTORIAL_ADDRESS?: string;
  VITE_TOKEN_ADDRESS?: string;
  /** The game NFT's Collection (E5b), optional; without it the deployments file's `contracts.Collection`, else the indexer's head. */
  VITE_COLLECTION_ADDRESS?: string;
  /** The devnet's MockUSDC, the faucet's token. */
  VITE_MOCK_USDC_ADDRESS?: string;
  /** The account that plays: a devnet predeployed account, devnet only; without both, read-only. */
  VITE_PLAYER_ADDRESS?: string;
  VITE_PLAYER_PRIVATE_KEY?: string;
  VITE_SUPPORTS_TOKEN_MINT?: string;
  /** Base URL of the indexer API (display only); without it the leaderboard says it is unavailable. */
  VITE_INDEXER_URL?: string;
}

export interface AppNetwork {
  deployment: Deployment;
  /** The test token's faucet is offered (devnet: MockUSDC is a mock there). */
  supportsMint: boolean;
  /** Tip of each write: 0 on devnet, where starknet.js's tip estimate stalls. */
  tip: bigint | undefined;
  /** Reads the leaderboard and player screens; null when `VITE_INDEXER_URL` is unset. */
  indexer: IndexerClient | null;
}

export const DEFAULT_NETWORK = "devnet";

/** Picks `<network>.json` among the deployments files (keyed by path) and merges the env over it. */
export function resolveAppNetwork(env: NetworkEnv, files: Record<string, unknown>): AppNetwork {
  const network = env.VITE_NETWORK || DEFAULT_NETWORK;
  const entry = Object.entries(files).find(([path]) => path.endsWith(`/${network}.json`));
  const file = (entry?.[1] as { default?: DeploymentFile } | DeploymentFile | undefined) ?? null;
  const deployment = resolveDeployment({
    network,
    file: file && "default" in file ? (file.default ?? null) : (file as DeploymentFile | null),
    env: {
      rpcUrl: env.VITE_RPC_URL,
      mockUsdc: env.VITE_MOCK_USDC_ADDRESS,
      collection: env.VITE_COLLECTION_ADDRESS,
      deployedBlock: env.VITE_DEPLOYED_BLOCK,
      addresses: {
        Account: env.VITE_ACCOUNT_ADDRESS,
        Daily: env.VITE_DAILY_ADDRESS,
        Tutorial: env.VITE_TUTORIAL_ADDRESS,
        Token: env.VITE_TOKEN_ADDRESS,
      },
    },
  });
  const devnet = network === "devnet";
  const mint = env.VITE_SUPPORTS_TOKEN_MINT;
  return {
    deployment,
    supportsMint: mint === undefined || mint === "" ? devnet : mint.toLowerCase() === "true",
    tip: devnet ? 0n : undefined,
    indexer: createIndexerClient(env.VITE_INDEXER_URL),
  };
}

/** Who signs: the env's burner on devnet, the Cartridge controller elsewhere, nobody when not configured. */
export type Signer = "burner" | "controller" | "none";

export function signerOf(deployment: Deployment): Signer {
  if (!deployment.configured) return "none";
  return deployment.network === DEFAULT_NETWORK ? "burner" : "controller";
}

/**
 * The playing account. On devnet, the account from a private key in the env (its predeployed
 * accounts): a key in a built bundle is public, so no other network takes one. Elsewhere, the
 * controller's account once the player connected (`controller`). Null (read-only) when not
 * configured, when devnet has no key, or when nobody connected the controller.
 */
export function resolvePlayerAccount(env: NetworkEnv, deployment: Deployment, controller: WriteAccount | null = null): WriteAccount | null {
  const signer = signerOf(deployment);
  if (signer === "controller") return controller;
  if (signer === "none" || !env.VITE_PLAYER_ADDRESS || !env.VITE_PLAYER_PRIVATE_KEY) return null;
  return new Account({
    provider: new RpcProvider({ nodeUrl: deployment.rpcUrl }),
    address: env.VITE_PLAYER_ADDRESS,
    signer: env.VITE_PLAYER_PRIVATE_KEY,
  });
}
