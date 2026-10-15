import { createContext, useContext, type ReactNode } from "react";
import type { EconomyViews, EconomyWriter, EventReader, GameViews, IndexerClient, PackBuyer, PavedWriter, PoolQuoter } from "@paved/chain";
import { browserStore, type KeyValueStore } from "@paved/game-core";

/**
 * Who plays: the writes of the connected account, a game's moves, the tutorial's claim, Play free (`spawnFree`) and the Cobbles' claims (P9:
 * quests, achievements, the free-game credits, and `claim`, their multicall). `PavedWriter` satisfies it; the wallet builds
 * one from its account (`PavedClient.writer`, `wallet/`). A test gives its own, or only part of it: the claims' pages read
 * them through `claimSigner`, which answers null ("Connect to claim") for a signer without `claim`. The purchases (P7b) are
 * built on it by the sources' `purchases`: `sendCalls` serialises the economy's writes with the game's, `buyPack` is a
 * pack's approve and `Setup.buy_pack`. The skins (P11b) are `buySkin` and `setSkins`, read through `skinSigner`.
 */
export type GameSigner = Pick<
  PavedWriter,
  | "address"
  | "build"
  | "discard"
  | "surrender"
  | "claimTutorial"
  | "claim"
  | "claimQuest"
  | "claimAchievement"
  | "claimDailyCredit"
  | "claimWeeklyCredit"
  | "buyPack"
  | "sendCalls"
  | "spawnFree"
  | "buySkin"
  | "setSkins"
>;

/**
 * The purchases of one signer (P7b): a Challenge game (`EconomyWriter.purchase`: the approve and `Challenge.spawn`) and a
 * pack of Cobbles (`PackBuyer.buy`: the approve and `Setup.buy_pack`). Each reads its price and quote again before sending
 * and refuses, with a typed error, an amount the player did not confirm.
 */
export interface Purchases {
  purchase: EconomyWriter["purchase"];
  buyPack: PackBuyer["buy"];
  /**
   * The referrer a purchase of `kind` sends for the link's `referrer`, or null when it would send none: one the writers
   * refuse (the payer, the Challenge, the Economy) is dropped rather than refusing the purchase, and so is one
   * `Economy.pay` ignores (`Setup`, the Vault, the router read now; `packReferrer`, the same rule for a game and a pack).
   */
  referrer(kind: "game" | "pack", referrer: string): Promise<string | null>;
  /**
   * The outcome of a sent transaction from its receipt: `unknown` while the node does not know the hash. A failed read
   * (not a missing hash) rejects, and the page keeps its hold.
   */
  receipt(transactionHash: string): Promise<"succeeded" | "reverted" | "unknown">;
}

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
  /** The purchases of a signer (the economy's client on the signer's writer); null or left out without an economy: nothing can be bought. */
  purchases?: ((signer: GameSigner) => Purchases) | null;
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
