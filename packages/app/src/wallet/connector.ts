import { Account, RpcProvider } from "starknet";
import { createLocalKeyConnector, deployedBy, deployedBySelf, starknetAccount, type DeployLocalAccount, type KeyStorage, type LocalKey, type PavedClient, type WriteAccount } from "@paved/chain";
import { chainClient } from "../data/chain-client";
import type { WalletConnector } from "./wallet";

// The app's connector, loaded with its own chunk by `WalletProvider` (#918, phase A; docs/architecture/accounts.md): a Stark
// key made on this device and kept in its `localStorage`, and the account of that key, deployed on its first write. On
// devnet the deployer account the deployments use deploys it and pays its fees; elsewhere the account deploys itself. Every
// write is signed by the key, with no session and no prompt. The key never leaves the device. The data source `chain` only: on
// `mock`, `WalletProvider` loads `mock-connector.ts` instead (#927), and neither this module nor starknet.js is fetched.

/** A devnet account and its key: the deployer of the local accounts. */
export interface Deployer {
  address: string;
  key: string;
}

/**
 * Whether this build is a devnet build: `VITE_NETWORK=devnet`, or the dev server without a network (`chainClient`'s
 * default). Vite replaces both sides with literals at build time, so in any other build this is the constant `false`.
 */
const DEVNET_BUILD = import.meta.env.VITE_NETWORK === "devnet" || (import.meta.env.DEV && !import.meta.env.VITE_NETWORK);

/**
 * The devnet deployer of this build: `VITE_DEPLOYER_ADDRESS` and `VITE_DEPLOYER_PRIVATE_KEY` (the node's first predeployed
 * account, whose key is the devnet's public one), read by static accesses behind `DEVNET_BUILD`. Outside a devnet build the
 * branch folds away at build time and neither value is in the bundle, whatever the build's environment holds.
 */
export const BUILD_DEPLOYER: Deployer | null = DEVNET_BUILD
  ? import.meta.env.VITE_DEPLOYER_ADDRESS && import.meta.env.VITE_DEPLOYER_PRIVATE_KEY
    ? { address: import.meta.env.VITE_DEPLOYER_ADDRESS, key: import.meta.env.VITE_DEPLOYER_PRIVATE_KEY }
    : null
  : null;

/**
 * The connector of this build: the deployment's (`chainClient`, `BUILD_DEPLOYER`), which rejects when the deployment is not
 * configured.
 */
export async function appConnector(): Promise<WalletConnector> {
  return connectorFor(chainClient(), BUILD_DEPLOYER, window.localStorage);
}

/** What the connector builds on the node; tests give fakes. */
export interface ConnectorDeps {
  /** The signing account of a key. */
  account?: (provider: RpcProvider) => (key: LocalKey) => WriteAccount;
  /** How a new account is deployed: by the devnet's deployer, or by itself. */
  deploy?: (provider: RpcProvider, deployer: Deployer | null) => DeployLocalAccount;
}

/**
 * The connector of `client`'s deployment: the device's key in `storage`. On devnet the deployer deploys and funds each new
 * account (a first write without one is refused), and no write tips (starknet.js's tip estimate stalls on devnet, as the
 * legacy client found). The deployer is never used outside devnet, even when given.
 */
export function connectorFor(client: PavedClient, deployer: Deployer | null, storage: KeyStorage, deps: ConnectorDeps = {}): WalletConnector {
  const { deployment } = client;
  const devnet = deployment.network === "devnet";
  // Checked now: no account on an incomplete deployment (devnet's own file is complete).
  if (!devnet && !deployment.configured) throw new Error(`Not connected: ${deployment.missing.join(", ")} missing`);
  const tip = devnet ? 0n : undefined;
  const provider = new RpcProvider({ nodeUrl: deployment.rpcUrl });
  const deploy = (deps.deploy ?? defaultDeploy(devnet, tip))(provider, devnet ? deployer : null);
  const local = createLocalKeyConnector({ storage, provider, deploy, account: (deps.account ?? starknetAccount)(provider) });
  return {
    probe: () => local.probe(),
    connect: () => local.connect(),
    disconnect: () => local.disconnect(),
    reset: () => local.reset(),
    // No username before the identities (phase C): the address names the player.
    username: async () => null,
    signer: (account) => client.writer(account, tip === undefined ? {} : { tip }),
  };
}

function defaultDeploy(devnet: boolean, tip: bigint | undefined) {
  return (provider: RpcProvider, deployer: Deployer | null): DeployLocalAccount => {
    if (!devnet) return deployedBySelf({ provider, tip });
    if (!deployer) return async () => Promise.reject(new Error("no devnet deployer: set VITE_DEPLOYER_ADDRESS and VITE_DEPLOYER_PRIVATE_KEY"));
    return deployedBy({ deployer: new Account({ provider, address: deployer.address, signer: deployer.key }), provider, tip });
  };
}
