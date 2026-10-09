import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { PavedProvider, controllerPolicies, createControllerConnector, createPavedClient } from "@paved/chain";
import type { ControllerConfig, PavedClient, WriteAccount } from "@paved/chain";
import { resolvePlayerAccount, signerOf, type AppNetwork, type NetworkEnv, type Signer } from "../utils/network";

type Connector = ReturnType<typeof createControllerConnector>;

export interface WalletState {
  signer: Signer;
  /** The controller's account once the player connected; null otherwise (and always on devnet). */
  controller: WriteAccount | null;
  connecting: boolean;
  /** Why the last connect or disconnect failed. */
  error: string | null;
  connect: () => void;
  disconnect: () => void;
}

const WalletContext = createContext<WalletState | null>(null);

/** The wallet state; null outside a `WalletProvider` (a screen rendered on its own). */
export function useWallet(): WalletState | null {
  return useContext(WalletContext);
}

/** The most stakes one Daily purchase buys (the contract's MAX_STAKE, E3): its approve is at most this x the unit price. */
export const ENTRY_MAX_STAKE = 10n;

/**
 * The session's approve: the token `Daily.entry_price` names (the deployment's Token before E3, USDC
 * after), capped at `ENTRY_MAX_STAKE` x its unit price. Null when the entry cannot be read: no approve
 * in the session then.
 */
export async function entryApprove(client: PavedClient): Promise<{ token: string; cap: bigint } | null> {
  try {
    const price = await client.views.entryPrice();
    return { token: price.token, cap: price.amount * ENTRY_MAX_STAKE };
  } catch {
    return null;
  }
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Holds who signs and hands the account to `PavedProvider`, so every write goes through the same
 * `PavedWriter` (serialised, confirmed, re-checked at send) whoever signs. On devnet the env's
 * burner; elsewhere the Cartridge controller, connected by the player, with the session policies
 * of `controllerPolicies` (none when the deployment is not configured: no connector then).
 */
export function WalletProvider({
  env,
  network,
  createConnector = createControllerConnector,
  client,
  children,
}: {
  env: NetworkEnv;
  network: AppNetwork;
  /** Builds the controller connector; tests give one on a fake controller. */
  createConnector?: (config: ControllerConfig) => Connector;
  /** A client to use instead of one on the deployment's RPC URL (tests). */
  client?: PavedClient;
  children: React.ReactNode;
}) {
  const { deployment } = network;
  const signer = signerOf(deployment);
  // One client for the app and the connector's read of the entry price.
  const reader = useMemo(() => (deployment.configured ? (client ?? createPavedClient(deployment)) : undefined), [deployment, client]);
  const connector = useMemo(() => {
    if (signer !== "controller" || !reader) return null;
    // Checked now: no controller on an incomplete deployment.
    controllerPolicies(deployment);
    return createConnector({
      rpc: deployment.rpcUrl,
      chainId: deployment.chainId,
      // The session may approve the entry token to the Daily contract alone, up to a full purchase,
      // read at first use; a sponsor's approve, or any approve when the read fails, prompts.
      policies: async () => controllerPolicies(deployment, { approve: await entryApprove(reader) }),
    });
  }, [signer, deployment, reader, createConnector]);
  const [controller, setController] = useState<WriteAccount | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A session approved earlier in this browser comes back without a prompt.
  useEffect(() => {
    setController(null);
    if (!connector) return;
    let cancelled = false;
    connector.probe().then(
      (account) => !cancelled && account && setController(account),
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [connector]);

  const connect = useCallback(() => {
    if (!connector || connecting) return;
    setConnecting(true);
    setError(null);
    connector.connect().then(
      (account) => {
        setController(account);
        setConnecting(false);
      },
      (cause) => {
        setError(`Not connected: ${message(cause)}`);
        setConnecting(false);
      },
    );
  }, [connector, connecting]);

  const disconnect = useCallback(() => {
    if (!connector) return;
    // Read-only at once: no write starts with an account the player is leaving.
    setController(null);
    setError(null);
    connector.disconnect().catch((cause) => setError(`Disconnect failed: ${message(cause)}`));
  }, [connector]);

  // One account object per signer: a new one would give a new writer, and the writer serialises writes.
  const account = useMemo(() => resolvePlayerAccount(env, deployment, controller), [env, deployment, controller]);
  const wallet = useMemo<WalletState>(
    () => ({ signer, controller, connecting, error, connect, disconnect }),
    [signer, controller, connecting, error, connect, disconnect],
  );

  return (
    <WalletContext.Provider value={wallet}>
      <PavedProvider deployment={deployment} account={account} tip={network.tip} client={reader}>
        {children}
      </PavedProvider>
    </WalletContext.Provider>
  );
}
