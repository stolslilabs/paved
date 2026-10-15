import { Account, RpcProvider } from "starknet";
import { MAX_STAKE, controllerPolicies, createControllerConnector, type ControllerConfig, type PavedClient, type WriteAccount } from "@paved/chain";
import { chainClient } from "../data/chain-client";
import type { WalletConnector } from "./wallet";

// The app's connector (P6), loaded with its own chunk by `WalletProvider`: app-web's `WalletProvider.tsx` and
// `utils/network.ts` brought over. Outside devnet the Cartridge controller with the game's session policies; on devnet
// the env's burner (a predeployed account), which no other network takes: a key in a built bundle is public.

/**
 * The session's approve: the entry token `Challenge.entry_price` names, capped at `MAX_STAKE` x its unit price (a
 * purchase of the most stakes signs without a prompt). Null when the price cannot be read: every approve prompts then.
 */
export async function entryApprove(client: PavedClient): Promise<{ token: string; cap: bigint } | null> {
  try {
    const price = await client.views.entryPrice();
    return { token: price.token, cap: price.amount * BigInt(MAX_STAKE) };
  } catch {
    return null;
  }
}

/** `@paved/chain`'s controller connector (its type is not exported from the chain's entry). */
type ControllerConnector = ReturnType<typeof createControllerConnector>;

/** A devnet burner: a predeployed account and its key. */
export interface Burner {
  address: string;
  key: string;
}

/**
 * Whether this build is a devnet build: `VITE_NETWORK=devnet`, or the dev server without a network (`chainClient`'s
 * default). Vite replaces both sides with literals at build time, so in any other build this is the constant `false`.
 */
const DEVNET_BUILD = import.meta.env.VITE_NETWORK === "devnet" || (import.meta.env.DEV && !import.meta.env.VITE_NETWORK);

/**
 * The burner of this build: `VITE_PLAYER_ADDRESS` and `VITE_PLAYER_PRIVATE_KEY`, read by static accesses behind
 * `DEVNET_BUILD`. Outside a devnet build the branch folds away at build time and neither value is in the bundle, whatever
 * the build's environment holds (checked on a Sepolia build: the PR's "build check").
 */
export const BUILD_BURNER: Burner | null = DEVNET_BUILD
  ? import.meta.env.VITE_PLAYER_ADDRESS && import.meta.env.VITE_PLAYER_PRIVATE_KEY
    ? { address: import.meta.env.VITE_PLAYER_ADDRESS, key: import.meta.env.VITE_PLAYER_PRIVATE_KEY }
    : null
  : null;

/** The connector of this build's deployment (`chainClient`, `BUILD_BURNER`). Rejects when the deployment is not configured. */
export async function appConnector(): Promise<WalletConnector> {
  return connectorFor(chainClient(), BUILD_BURNER);
}

/**
 * The connector of `client`'s deployment: on devnet the burner (refused without one), elsewhere the controller. The
 * burner is never used outside devnet, even when given. `controller` builds the controller's connector (tests give a
 * fake one).
 */
export function connectorFor(
  client: PavedClient,
  burner: Burner | null,
  controller: (config: ControllerConfig) => ControllerConnector = createControllerConnector,
): WalletConnector {
  const { deployment } = client;
  if (deployment.network === "devnet") {
    // starknet.js's tip estimate stalls on devnet: no tip there (as app-web).
    const signer = (account: WriteAccount) => client.writer(account, { tip: 0n });
    if (!burner) throw new Error("no devnet account: set VITE_PLAYER_ADDRESS and VITE_PLAYER_PRIVATE_KEY");
    let account: WriteAccount | null = null;
    return {
      probe: async () => null,
      connect: async () => (account ??= new Account({ provider: new RpcProvider({ nodeUrl: deployment.rpcUrl }), address: burner.address, signer: burner.key })),
      disconnect: async () => {},
      username: async () => null,
      signer,
    };
  }
  // Checked now: no controller on an incomplete deployment.
  controllerPolicies(deployment);
  const connector = controller({
    rpc: deployment.rpcUrl,
    chainId: deployment.chainId,
    // The price is read once, when the controller is first used.
    policies: async () => controllerPolicies(deployment, { approve: await entryApprove(client) }),
  });
  return {
    probe: () => connector.probe(),
    connect: () => connector.connect(),
    disconnect: () => connector.disconnect(),
    username: () => connector.username(),
    signer: (account) => client.writer(account),
  };
}
