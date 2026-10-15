import { createContext, useContext, type ReactNode } from "react";
import type { EconomyViews, EventReader, GameViews, IndexerClient, PavedWriter, PoolQuoter } from "@paved/chain";
import { browserStore, type KeyValueStore } from "@paved/game-core";

/**
 * Who plays: the writes of the connected account, a game's moves, the tutorial's claim and the Cobbles' claims (P9:
 * quests, achievements, the free-game credits, and `claim`, their multicall). `PavedWriter` satisfies it; the wallet builds
 * one from its account (`PavedClient.writer`, `wallet/`). A test gives its own, or only part of it: the claims' pages read
 * them through `claimSigner`, which answers null ("Connect to claim") for a signer without `claim`.
 */
export type GameSigner = Pick<
  PavedWriter,
  "address" | "build" | "discard" | "surrender" | "claimTutorial" | "claim" | "claimQuest" | "claimAchievement" | "claimDailyCredit" | "claimWeeklyCredit"
>;

/**
 * What the data hooks read from: the chain's views and events, the economy's views, the indexer client and the Training
 * save. The app gives the real ones (`PavedClient.views`, `.events`, `EconomyClient`, `createIndexerClient`); a test gives
 * `@paved/chain`'s fakes (`FakeGameViews`, `FakeEconomy`, `FakePoolQuoter`, an `IndexerClient` on `FixtureIndexer`).
 */
export interface DataSources {
  views: GameViews;
  /** Only the player's games are read from the events. */
  events: Pick<EventReader, "playerGames">;
  /** Null without an economy deployment: the economy's hooks answer null. */
  economy: EconomyViews | null;
  /** The pool's quoter (`quote_swap`); null without one. */
  pool: PoolQuoter | null;
  indexer: IndexerClient;
  /** The connected account's writes (`WalletProvider` fills it); null or left out without one: Challenge boards are read only. */
  signer?: GameSigner | null;
  /** Where the Training game is saved: `localStorage` by default. */
  store?: () => KeyValueStore | null;
}

const DataContext = createContext<DataSources | null>(null);

/** Gives the data hooks their sources; inside the app's `QueryClientProvider`. */
export function DataProvider({ sources, children }: { sources: DataSources; children: ReactNode }) {
  return <DataContext.Provider value={sources}>{children}</DataContext.Provider>;
}

export function useDataSources(): DataSources {
  const sources = useContext(DataContext);
  if (!sources) throw new Error("useDataSources: no DataProvider above this component");
  return sources;
}

/** The Training store of the sources, or `localStorage`. */
export const trainingStore = (sources: DataSources): (() => KeyValueStore | null) => sources.store ?? browserStore;
