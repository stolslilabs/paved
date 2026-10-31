import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { WriteAccount } from "@paved/chain";
import { MOCKED } from "../data/data-source";
import { DataProvider, type DataSources, type GameSigner } from "../data/sources";

/**
 * Who connects (#918, phase A): the device's local key (`connector.ts`), whose account deploys itself on its first write; on
 * the mock, the same key with the ledger's account, deployed nowhere (`mock-key.ts`, #927).
 * `signer` builds the account's writes (`PavedClient.writer`). A test gives a fake one. The pages see this interface only,
 * so the account's connector of the later phases (the logins, the key service of #918) takes the local key's place behind it.
 */
export interface WalletConnector {
  /** The account of the key kept on this device, unless the player disconnected; null when there is none. No prompt. */
  probe(): Promise<WriteAccount | null>;
  /** Connects the device's account (a new key on the first connect); rejects when it cannot. */
  connect(): Promise<WriteAccount>;
  disconnect(): Promise<void>;
  /** Forgets the device's key and connects a new one: a new account (Settings' Reset, for testing). */
  reset(): Promise<WriteAccount>;
  /** The connected player's username; null when there is none (no identity before phase C). */
  username(): Promise<string | null>;
  /** The writes of `account` (`PavedClient.writer(account)`). */
  signer(account: WriteAccount): GameSigner;
}

/** Loads the connector of this build; rejects with the reason when there is none (a deployment not configured). */
export type LoadConnector = () => Promise<WalletConnector>;

export interface WalletState {
  /** `restoring`: a session approved earlier is being looked for; `connecting`: the wallet's window is open. */
  status: "disconnected" | "restoring" | "connecting" | "connected";
  /** The connected account's address; null when none is connected. */
  address: string | null;
  username: string | null;
  /** Why the last connect or disconnect failed. */
  error: string | null;
  /** Opens the wallet; resolves true once connected, false when it failed or was closed. */
  connect(): Promise<boolean>;
  /** Back to read only at once: no write starts with an account the player is leaving. */
  disconnect(): void;
  /** A new key and a new account, connected (for testing); resolves true once connected, false when it failed. */
  reset(): Promise<boolean>;
  /** Looks once for the device's account (no prompt). The pages that read the account call it (`useAccount`). */
  restore(): void;
}

const WalletContext = createContext<WalletState | null>(null);

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * The build's connector, in its own chunk: starknet.js and the key's account are fetched when a page first needs the account.
 * On the mock (#927), the device's key with the ledger's account (`mock-connector.ts`): neither `connector.ts` nor starknet.js
 * is fetched.
 */
const loadAppConnector: LoadConnector = () =>
  MOCKED ? import("./mock-connector").then((m) => m.mockAppConnector()) : import("./connector").then((m) => m.appConnector());

/**
 * Holds the wallet and gives the data hooks the connected account's writes: `sources` with `signer` filled while
 * connected, null otherwise. Nothing is loaded until a connect, or a `restore` from a page that reads the account: the
 * welcome and Training fetch no wallet code.
 */
export function WalletProvider({ sources, load = loadAppConnector, children }: { sources: DataSources; load?: LoadConnector; children: ReactNode }) {
  const loaded = useRef<Promise<WalletConnector> | null>(null);
  const restored = useRef(false);
  // Each connect or disconnect bumps it: a probe or connect that answers after a newer action is dropped.
  const generation = useRef(0);
  const [status, setStatus] = useState<WalletState["status"]>("disconnected");
  const [account, setAccount] = useState<{ address: string; signer: GameSigner } | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connector = useCallback(() => {
    loaded.current ??= load();
    // A failed load is tried again at the next call.
    loaded.current.catch(() => (loaded.current = null));
    return loaded.current;
  }, [load]);

  const accept = useCallback((c: WalletConnector, from: WriteAccount) => {
    setAccount({ address: from.address, signer: c.signer(from) });
    setStatus("connected");
    setUsername(null);
    c.username().then(setUsername, () => {});
  }, []);

  const restore = useCallback(() => {
    if (restored.current) return;
    restored.current = true;
    const at = generation.current;
    setStatus((s) => (s === "disconnected" ? "restoring" : s));
    connector()
      .then(async (c) => {
        const found = await c.probe();
        if (at !== generation.current) return;
        if (found) accept(c, found);
        else setStatus("disconnected");
      })
      // No connector or no session: a guest, without an error (the player did not ask).
      .catch(() => at === generation.current && setStatus("disconnected"));
  }, [connector, accept]);

  const open = useCallback(
    async (how: (c: WalletConnector) => Promise<WriteAccount>) => {
      const at = ++generation.current;
      setStatus("connecting");
      setError(null);
      try {
        const c = await connector();
        const connected = await how(c);
        if (at !== generation.current) return false;
        accept(c, connected);
        return true;
      } catch (cause) {
        if (at === generation.current) {
          setError(`Not connected: ${message(cause)}`);
          setStatus("disconnected");
        }
        return false;
      }
    },
    [connector, accept],
  );
  const connect = useCallback(() => open((c) => c.connect()), [open]);
  // The account being left gets no write: its signer goes before the new key is made.
  const reset = useCallback(() => {
    setAccount(null);
    setUsername(null);
    return open((c) => c.reset());
  }, [open]);

  const disconnect = useCallback(() => {
    generation.current += 1;
    setAccount(null);
    setUsername(null);
    setError(null);
    setStatus("disconnected");
    const pending = loaded.current;
    pending?.then((c) => c.disconnect()).catch((cause) => setError(`Disconnect failed: ${message(cause)}`));
  }, []);

  const wallet = useMemo<WalletState>(
    () => ({ status, address: account?.address ?? null, username, error, connect, disconnect, reset, restore }),
    [status, account, username, error, connect, disconnect, reset, restore],
  );
  // One signer per account: a new one would be a new writer, and the writer serialises the account's writes.
  const withSigner = useMemo<DataSources>(() => ({ ...sources, signer: account?.signer ?? sources.signer ?? null }), [sources, account]);

  return (
    <WalletContext.Provider value={wallet}>
      <DataProvider sources={withSigner}>{children}</DataProvider>
    </WalletContext.Provider>
  );
}

/** The wallet; inside `WalletProvider`. */
export function useWallet(): WalletState {
  const wallet = useContext(WalletContext);
  if (!wallet) throw new Error("useWallet: no WalletProvider above this component");
  return wallet;
}

/** The wallet, with a session approved earlier looked for once (home, play, the boards that write). */
export function useAccount(): WalletState {
  const wallet = useWallet();
  const { restore } = wallet;
  useEffect(() => restore(), [restore]);
  return wallet;
}
