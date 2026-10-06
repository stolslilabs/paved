import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Deployment } from "./deployment";
import { PavedClient, createPavedClient } from "./paved-client";
import { GameSession, type SessionState } from "./session";
import type { GameKey } from "./views";
import type { PavedWriter, WriteAccount } from "./writer";

/** `not-configured`: addresses or RPC missing. `read-only`: no account. `ready`: reads and writes. */
export type ConnectionStatus = "not-configured" | "read-only" | "ready";

export interface PavedContextValue {
  deployment: Deployment;
  status: ConnectionStatus;
  client: PavedClient | null;
  writer: PavedWriter | null;
  /** Address of the account that writes; null when there is none. */
  address: string | null;
}

const PavedContext = createContext<PavedContextValue | null>(null);

export function connectionStatus(deployment: Deployment, account: WriteAccount | null): ConnectionStatus {
  if (!deployment.configured) return "not-configured";
  return account ? "ready" : "read-only";
}

export function PavedProvider({
  deployment,
  account = null,
  tip,
  client: given,
  children,
}: {
  deployment: Deployment;
  /** The account that writes (a starknet.js `Account`); null for a read-only client. */
  account?: WriteAccount | null;
  tip?: bigint;
  /** A client to use instead of one on the deployment's RPC URL (tests, bench). */
  client?: PavedClient;
  children: React.ReactNode;
}) {
  const value = useMemo<PavedContextValue>(() => {
    const status = connectionStatus(deployment, account);
    const client = status === "not-configured" ? null : (given ?? createPavedClient(deployment));
    const writer = client && account && status === "ready" ? client.writer(account, { tip }) : null;
    return { deployment, status, client, writer, address: account?.address ?? null };
  }, [deployment, account, tip, given]);
  return <PavedContext.Provider value={value}>{children}</PavedContext.Provider>;
}

export function usePaved(): PavedContextValue {
  const value = useContext(PavedContext);
  if (!value) throw new Error("usePaved needs a PavedProvider");
  return value;
}

export interface ReadState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  /** The last read for the current inputs succeeded: `data` is an answer, not the initial null. */
  loaded: boolean;
  /** Reads again now (after a write of this client, or a "refresh" button). */
  refresh: () => void;
}

/**
 * One read, done when its inputs change, when `refresh` is called, and, with `onVisible`, when the
 * page becomes visible again. No timer.
 */
export function useRead<T>(
  read: ((client: PavedClient) => Promise<T>) | null,
  deps: unknown[],
  options: { onVisible?: boolean } = {},
): ReadState<T> {
  const { client } = usePaved();
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean; loaded: boolean }>({
    data: null,
    error: null,
    loading: false,
    loaded: false,
  });
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!client || !read) {
      setState({ data: null, error: null, loading: false, loaded: false });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    read(client).then(
      (data) => !cancelled && setState({ data, error: null, loading: false, loaded: true }),
      (error) =>
        !cancelled &&
        setState((s) => ({ ...s, error: error instanceof Error ? error.message : String(error), loading: false, loaded: false })),
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, tick, ...deps]);

  useEffect(() => {
    if (!options.onVisible || typeof document === "undefined") return;
    const onChange = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, [options.onVisible, refresh]);

  return { ...state, refresh };
}

/** The session of one game: loaded once, then moved by this client's writes only. */
export function useGameSession(key: GameKey | null): { session: GameSession | null; state: SessionState | null } {
  const { client, address } = usePaved();
  const session = useMemo(
    () => (client && key ? new GameSession(client.views, key, address) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client, address, key?.mode, key?.gameId],
  );
  const [state, setState] = useState<SessionState | null>(session?.state ?? null);
  useEffect(() => {
    if (!session) {
      setState(null);
      return;
    }
    setState(session.state);
    const unsubscribe = session.subscribe(setState);
    void session.load();
    return () => {
      unsubscribe();
    };
  }, [session]);
  return { session, state };
}
