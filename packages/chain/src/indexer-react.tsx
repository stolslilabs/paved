import React, { createContext, useContext } from "react";
import type { IndexerAnswer, IndexerClient } from "./indexer";
import { IndexerError } from "./indexer";
import { useAsyncRead } from "./react";
import type { ReadState } from "./react";

const IndexerContext = createContext<IndexerClient | null>(null);

/** Gives the screens the indexer client; `client` is null when no URL is configured. */
export function IndexerProvider({ client, children }: { client: IndexerClient | null; children: React.ReactNode }) {
  return <IndexerContext.Provider value={client}>{children}</IndexerContext.Provider>;
}

/** The configured indexer client, or null: the screens then say the leaderboard is unavailable. */
export function useIndexer(): IndexerClient | null {
  return useContext(IndexerContext);
}

/**
 * One read of the indexer, with the rules of `useRead`: on its inputs, on `refresh`, and with `onVisible`
 * when the page becomes visible; no timer. With no client configured it fails at once with a
 * `not-configured` error instead of staying in "loading".
 */
export function useIndexerRead<T>(
  read: ((client: IndexerClient) => Promise<IndexerAnswer<T>>) | null,
  deps: unknown[],
  options: { onVisible?: boolean } = {},
): ReadState<IndexerAnswer<T>> {
  const client = useIndexer();
  const noClient = client === null && read !== null;
  return useAsyncRead(
    read && client ? () => read(client) : noClient ? () => Promise.reject(new IndexerError("not-configured", "No indexer URL is configured")) : null,
    [client, ...deps],
    options,
  );
}
