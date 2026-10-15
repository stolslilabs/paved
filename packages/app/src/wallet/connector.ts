import { Account, RpcProvider } from "starknet";
import { MAX_STAKE, controllerPolicies, createControllerConnector, type PavedClient, type WriteAccount } from "@paved/chain";
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

/** The `VITE_*` variables of the burner; read from the build's env. */
export interface BurnerEnv {
  VITE_PLAYER_ADDRESS?: string;
  VITE_PLAYER_PRIVATE_KEY?: string;
}

/**
 * The connector of this build's deployment. Rejects when the deployment is not configured (`createPavedClient`'s
 * `not-configured` error), or on devnet without the burner's two variables.
 */
export async function appConnector(env: BurnerEnv = import.meta.env as BurnerEnv): Promise<WalletConnector> {
  const client = chainClient();
  const { deployment } = client;
  if (deployment.network === "devnet") {
    // starknet.js's tip estimate stalls on devnet: no tip there (as app-web).
    const signer = (account: WriteAccount) => client.writer(account, { tip: 0n });
    const { VITE_PLAYER_ADDRESS: address, VITE_PLAYER_PRIVATE_KEY: key } = env;
    if (!address || !key) throw new Error("no devnet account: set VITE_PLAYER_ADDRESS and VITE_PLAYER_PRIVATE_KEY");
    let account: WriteAccount | null = null;
    return {
      probe: async () => null,
      connect: async () => (account ??= new Account({ provider: new RpcProvider({ nodeUrl: deployment.rpcUrl }), address, signer: key })),
      disconnect: async () => {},
      username: async () => null,
      signer,
    };
  }
  // Checked now: no controller on an incomplete deployment.
  controllerPolicies(deployment);
  const controller = createControllerConnector({
    rpc: deployment.rpcUrl,
    chainId: deployment.chainId,
    // The price is read once, when the controller is first used.
    policies: async () => controllerPolicies(deployment, { approve: await entryApprove(client) }),
  });
  return {
    probe: () => controller.probe(),
    connect: () => controller.connect(),
    disconnect: () => controller.disconnect(),
    username: () => controller.username(),
    signer: (account) => client.writer(account),
  };
}
