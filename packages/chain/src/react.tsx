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
  /** What the read threw, for a caller that tells failures apart (an `IndexerError`'s kind). */
  cause: unknown;
  loading: boolean;
  /** The last read for the current inputs succeeded: `data` is an answer, not the initial null. */
  loaded: boolean;
  /** Reads again now (after a write of this client, or a "refresh" button). */
  refresh: () => void;
}

type ReadOutcome<T> = Omit<ReadState<T>, "refresh">;

const EMPTY_READ = { data: null, error: null, cause: null, loading: false, loaded: false };

const sameInputs = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

/**
 * One read, done when its inputs change, when `refresh` is called, and, with `onVisible`, when the
 * page becomes visible again. No timer. A null `read` clears the state. After a failure `data` keeps
 * the last answer of the same inputs, so a screen can show it as stale next to the error; a read for other
 * inputs never shows the rows of the earlier ones.
 */
export function useAsyncRead<T>(read: (() => Promise<T>) | null, deps: unknown[], options: { onVisible?: boolean } = {}): ReadState<T> {
  const [stored, setStored] = useState<{ inputs: unknown[] | null; state: ReadOutcome<T> }>({ inputs: null, state: EMPTY_READ });
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);
  const enabled = read !== null;
  const inputs = [enabled, ...deps];

  useEffect(() => {
    // What was read for other inputs is dropped here, and hidden in the meantime (see `state` below).
    const own = (s: typeof stored): ReadOutcome<T> => (s.inputs && sameInputs(s.inputs, inputs) ? s.state : EMPTY_READ);
    if (!read) {
      setStored({ inputs, state: EMPTY_READ });
      return;
    }
    let cancelled = false;
    setStored((s) => ({ inputs, state: { ...own(s), loading: true } }));
    read().then(
      (data) => !cancelled && setStored({ inputs, state: { data, error: null, cause: null, loading: false, loaded: true } }),
      (cause) =>
        !cancelled &&
        setStored((s) => ({
          inputs,
          state: { ...own(s), error: cause instanceof Error ? cause.message : String(cause), cause, loading: false, loaded: false },
        })),
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, tick, ...deps]);

  // The state of other inputs shows nothing, not even in the render before the effect runs; a refresh of the
  // same inputs keeps its last answer.
  const state = stored.inputs && sameInputs(stored.inputs, inputs) ? stored.state : { ...EMPTY_READ, loading: enabled };

  useEffect(() => {
    if (!options.onVisible || typeof document === "undefined") return;
    const onChange = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, [options.onVisible, refresh]);

  return { ...state, refresh };
}

/** A read of the contracts' client; see `useAsyncRead`. */
export function useRead<T>(
  read: ((client: PavedClient) => Promise<T>) | null,
  deps: unknown[],
  options: { onVisible?: boolean } = {},
): ReadState<T> {
  const { client } = usePaved();
  return useAsyncRead(client && read ? () => read(client) : null, [client, ...deps], options);
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
