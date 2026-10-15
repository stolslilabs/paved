import { keepPreviousData, useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import {
  PackOutcomeUnknownError,
  PackPriceChangedError,
  PackRefusedError,
  PoolPriceMovedError,
  PoolQuoteBelowFloorError,
  PurchaseOutcomeUnknownError,
  PurchasePriceChangedError,
  SpawnPausedError,
  SwapBelowMinOutError,
  minOutFor,
  packSwapInput,
  readPacks,
  swapInputOf,
  type CobbleAccount,
  type GameViews,
  type PackBought,
  type PackPurchaseRequest,
  type PackView,
  type PackViews,
  type PurchaseRequest,
  type QuoteView,
  type SplitView,
  type WriteResult,
} from "@paved/chain";
import type { PurchaseRefusal } from "../components/scenes/purchase-scene";
import { usePoolQuote } from "./chain";
import { cobbleKeys } from "./cobbles";
import { addressKey, queryKeys } from "./keys";
import { useDataSources, type Purchases } from "./sources";

// The purchase page's data and writes (P7b, section 6.4): the game's stake (`EconomyWriter.purchase`: the approve and
// `Challenge.spawn(stake, referrer, min_out)`) and the packs of Cobbles (`PackBuyer.buy`: the approve and `Setup.buy_pack`).
// The packs are read from the chain's `Setup.pack`, not the indexer's `/v1/packs`: `buy_pack` charges the contract's price,
// which the buyer reads again at send, and the chain has a change of price before the indexer does. After a receipt its
// events go into the cache, then one invalidation reconciles; nothing polls.

/** The keys of the packs' read, `[domain, read]` as `keys.ts`'s. */
export const packKeys = {
  /** `Setup.pack` of ids 1 to 8, the packs on sale. */
  packs: () => ["chain", "packs"] as const,
};

/** The sources' pack view, or null: `GameViews` does not require it (as the Cobbles views, `cobbleViews`). */
export function packViews(views: GameViews): PackViews | null {
  const v = views as GameViews & Partial<PackViews>;
  return typeof v.pack === "function" ? (v as PackViews) : null;
}

/** The packs on sale, cheapest first (`Setup.pack`); null without the pack view. */
export function usePacks(): UseQueryResult<readonly PackView[] | null> {
  const { views } = useDataSources();
  const packs = packViews(views);
  return useQuery({ queryKey: packKeys.packs(), queryFn: async (): Promise<readonly PackView[] | null> => (packs ? readPacks(packs) : null) });
}

/**
 * The referrer the page sends: the `?ref=` address, or null when there is none, it is not an address, or it is the
 * player's own (the contract would not pay it). The writers check it again (`referrerOf`).
 */
export function referrerParam(ref: string | null, self: string | null): string | null {
  if (!ref || !/^0x[0-9a-fA-F]{1,64}$/.test(ref)) return null;
  const value = BigInt(ref);
  if (value === 0n || (self !== null && value === BigInt(self))) return null;
  return `0x${value.toString(16)}`;
}

/** What a confirm sends, from a fresh read: the `min_out` of the pool's quote less 1 %, or null until read. */
export interface Confirmable {
  minOut: bigint | null;
  isPending: boolean;
  error: Error | null;
}

/** The pool's quote of a swap of `swapIn` USDC as the `min_out` a confirm sends; disabled while `swapIn` is null. */
function useMinOut(swapIn: bigint | null): Confirmable {
  const pool = usePoolQuote(swapIn);
  const out = pool.data;
  return {
    minOut: out === undefined || out === null || out === 0n ? null : minOutFor(out),
    isPending: swapIn !== null && pool.isPending && !pool.error,
    error: pool.error,
  };
}

/**
 * A stake's quote (`Economy.quote`, `useQuote`'s key) and its `min_out`: the swap of the price, less the referral when
 * `referred`. While a new stake's quote is read the last one stays shown (the page keeps its scene) and the confirm waits:
 * `isPending` until the stake's own quote and its `min_out` are read.
 */
export function useStakeQuote(stake: number, referred: boolean): { quote: UseQueryResult<QuoteView | null> } & Confirmable {
  const { economy } = useDataSources();
  const quote = useQuery({
    queryKey: queryKeys.chain.quote(stake),
    queryFn: () => (economy ? economy.quote(stake) : null),
    placeholderData: keepPreviousData,
  });
  const current = quote.isPlaceholderData ? null : (quote.data ?? null);
  const confirmable = useMinOut(current ? swapInputOf(current, referred) : null);
  return { quote, ...confirmable, minOut: current ? confirmable.minOut : null, isPending: quote.isPlaceholderData || confirmable.isPending };
}

/** A pack's `min_out`: the swap of its price, less the referral (`split.referral`) when `referred`. */
export function usePackQuote(pack: PackView | null, split: SplitView | null, referred: boolean): Confirmable {
  return useMinOut(pack && split ? packSwapInput(pack.price, split, referred) : null);
}

/** The purchases of the connected signer, or null: no signer, or no economy (`DataSources.purchases`). */
function usePurchases(): Purchases | null {
  const { signer = null, purchases = null } = useDataSources();
  return signer && purchases ? purchases(signer) : null;
}

/**
 * Buys a Challenge game. On its receipt the player's USDC, games and active game are read again; the page opens the new
 * game (`gameId`). `buyer` is null without a signer or an economy: the page asks to connect.
 */
export function usePurchase(playerId: string | null) {
  const buyer = usePurchases();
  const client = useQueryClient();
  const mutation = useMutation<WriteResult & { gameId: number }, Error, PurchaseRequest>({
    mutationFn: (request) => (buyer ? buyer.purchase(request) : Promise.reject(new Error("Connect to buy"))),
    onSettled: () => {
      // A refusal may come from a moved price or a pause: those reads are stale too.
      void client.invalidateQueries({ queryKey: ["chain", "economy"] });
      void client.invalidateQueries({ queryKey: queryKeys.chain.spawnPaused() });
      if (!playerId) return;
      void client.invalidateQueries({ queryKey: queryKeys.chain.usdcBalance(playerId) });
      void client.invalidateQueries({ queryKey: queryKeys.chain.playerGames(playerId) });
      void client.invalidateQueries({ queryKey: queryKeys.chain.activeGame(playerId) });
    },
  });
  return { buyer, mutation };
}

/** A pack's receipt into the cache: the Cobbles balance `PackBought` carries. */
export function applyPackBought(client: ReturnType<typeof useQueryClient>, playerId: string, bought: PackBought): void {
  if (addressKey(bought.playerId) !== addressKey(playerId)) return;
  client.setQueryData<CobbleAccount | null>(cobbleKeys.account(playerId), (a) => (a ? { ...a, cobbles: bought.balance } : a));
}

/**
 * Buys a pack of Cobbles. Its receipt's `PackBought` sets the balance in the cache, then the account and the USDC are read
 * again (the reconciling read). `buyer` is null without a signer or an economy.
 */
export function useBuyPack(playerId: string | null) {
  const buyer = usePurchases();
  const client = useQueryClient();
  const mutation = useMutation<WriteResult & { bought: PackBought }, Error, PackPurchaseRequest>({
    mutationFn: (request) => (buyer ? buyer.buyPack(request) : Promise.reject(new Error("Connect to buy"))),
    onSuccess: ({ bought }) => {
      if (playerId) applyPackBought(client, playerId, bought);
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: packKeys.packs() });
      void client.invalidateQueries({ queryKey: ["chain", "economy"] });
      if (!playerId) return;
      void client.invalidateQueries({ queryKey: cobbleKeys.account(playerId) });
      void client.invalidateQueries({ queryKey: queryKeys.chain.usdcBalance(playerId) });
    },
  });
  return { buyer, mutation };
}

/**
 * A failed purchase as the scene shows it. A price or a quote that moved since the confirm (before sending, or the swap's
 * `min_out` revert) asks to confirm again at the new figures; a quote far below the guard rate asks to confirm it; a pause;
 * an outcome the receipt could not tell; anything else is a refusal with the writer's message.
 */
export function purchaseRefusal(error: Error): PurchaseRefusal {
  if (
    error instanceof PoolPriceMovedError ||
    error instanceof SwapBelowMinOutError ||
    error instanceof PurchasePriceChangedError ||
    error instanceof PackPriceChangedError ||
    (error instanceof PackRefusedError && (error.reason === "price-moved" || error.reason === "no-allowance"))
  ) {
    return { kind: "moved", message: "The price moved since you confirmed: check the new figures and confirm again. Your USDC was not spent." };
  }
  if (error instanceof PoolQuoteBelowFloorError) {
    return { kind: "low-quote", message: "The pool quotes far less PAVED than the guard rate for this purchase. Buy anyway, or try later." };
  }
  if (error instanceof SpawnPausedError) return { kind: "paused", message: error.message };
  if (error instanceof PurchaseOutcomeUnknownError || error instanceof PackOutcomeUnknownError) return { kind: "unknown", message: error.message };
  return { kind: "refused", message: error.message };
}
