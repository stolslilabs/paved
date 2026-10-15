import { useEffect, useState } from "react";
import { keepPreviousData, useMutation, useMutationState, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
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
  WriteError,
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
import { cobbleKeys, cobbleViews } from "./cobbles";
import { addressKey, queryKeys } from "./keys";
import { useDataSources, type Purchases } from "./sources";
import { useUnknownPurchase, writeUnknownPurchase, type PurchaseKind } from "./unknown-purchase";

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
 * The referrer a purchase of `kind` sends for the link's `ref` (`Purchases.referrer`): null for none. `dropped` is a link
 * referrer the purchase will not send (the contracts would not pay it), which the page says. A guest's is the link's own,
 * until a signer can tell; `isPending` while the signer's answer is read (Pay waits for it).
 */
export function useEffectiveReferrer(kind: "game" | "pack", ref: string | null): { referrer: string | null; dropped: boolean; isPending: boolean } {
  const { signer = null } = useDataSources();
  const buyer = usePurchases();
  const query = useQuery({
    queryKey: ["chain", "economy", "referrer", kind, ref ?? "", signer ? addressKey(signer.address) : ""],
    queryFn: () => (buyer && ref ? buyer.referrer(kind, ref) : null),
    enabled: buyer !== null && ref !== null,
  });
  if (!buyer || ref === null) return { referrer: ref, dropped: false, isPending: false };
  // An answer read once is kept over a later failed refetch.
  if (query.data !== undefined) return { referrer: query.data, dropped: query.data === null, isPending: false };
  // A failed first check keeps the link's referrer: the writers check it again and refuse it with their message.
  if (query.error) return { referrer: ref, dropped: false, isPending: false };
  return { referrer: ref, dropped: false, isPending: true };
}

/** The outcome of a send is unknown: the player must see the reconciling reads before buying again. */
const outcomeUnknown = (error: Error | null): error is WriteError =>
  (error instanceof PurchaseOutcomeUnknownError || error instanceof PackOutcomeUnknownError) && !!error.transactionHash;

/** The receipt of an unknown purchase, once read: it landed, or it reverted (nothing moved). */
export type PurchaseResolution = "succeeded" | "reverted";

/**
 * The hold of a purchase whose outcome is unknown (`unknown-purchase.ts`: recorded per player and kind, so it survives a
 * remount, a reload and a second tab). While a record exists the check reads the transaction's receipt and the reads that
 * tell whether it landed (a game: the player's games, the active game and the USDC; a pack: the Cobbles and the USDC), each
 * with `fetchQuery`, so a key not in the cache is read too. `held` while the record is read, while the check runs, and while
 * it has failed (`failed`, Retry with `retry`); then only a deliberate Buy again sends (`clear` first). A receipt that reads
 * (`resolved`) clears the record.
 */
export function usePurchaseHold(kind: PurchaseKind, playerId: string | null) {
  const { unknown, isPending, clear } = useUnknownPurchase(playerId, kind);
  const buyer = usePurchases();
  const { economy, events, views } = useDataSources();
  const client = useQueryClient();
  const [resolved, setResolved] = useState<PurchaseResolution | null>(null);
  const hash = unknown?.hash ?? null;
  const check = useQuery({
    queryKey: ["chain", "purchaseCheck", kind, hash ?? ""],
    queryFn: async () => {
      const id = playerId as string;
      const usdc = client.fetchQuery({ queryKey: queryKeys.chain.usdcBalance(id), queryFn: () => (economy ? economy.usdcBalance(id) : null), staleTime: 0 });
      const reads: Array<Promise<unknown>> =
        kind === "game"
          ? [
              usdc,
              client.fetchQuery({
                queryKey: queryKeys.chain.playerGames(id),
                queryFn: async () => [...(await events.playerGames(id, ["challenge"]))].sort((a, b) => b.startTime - a.startTime),
                staleTime: 0,
              }),
              client.fetchQuery({
                queryKey: queryKeys.chain.activeGame(id),
                queryFn: async () => {
                  const open = (await events.playerGames(id, ["challenge"])).filter((g) => !g.over);
                  const newest = open.sort((a, b) => b.startTime - a.startTime)[0];
                  return newest ? views.game({ mode: newest.mode, gameId: newest.gameId }) : null;
                },
                staleTime: 0,
              }),
            ]
          : [usdc, client.fetchQuery({ queryKey: cobbleKeys.account(id), queryFn: () => cobbleViews(views)?.account(id) ?? null, staleTime: 0 })];
      // The receipt decides on its own: a read that failed never hides a purchase that went through or reverted.
      const [receipt, ...settled] = await Promise.allSettled([buyer!.receipt(hash as string), ...reads]);
      if (receipt.status === "rejected") throw receipt.reason;
      if (receipt.value !== "unknown") return receipt.value;
      const failedRead = settled.find((r): r is PromiseRejectedResult => r.status === "rejected");
      if (failedRead) throw failedRead.reason;
      return receipt.value;
    },
    enabled: hash !== null && buyer !== null && playerId !== null,
    retry: false,
    // Every mount checks again (a remount, a reload): the hold never rests on an earlier answer.
    refetchOnMount: "always",
    staleTime: 0,
    gcTime: 0,
  });
  // Another player: none of the last one's resolution is theirs.
  useEffect(() => setResolved(null), [playerId]);
  const outcome = check.data;
  useEffect(() => {
    if (outcome !== "succeeded" && outcome !== "reverted") return;
    setResolved(outcome);
    clear();
  }, [outcome, clear]);
  const checking = isPending || (hash !== null && (check.isPending || check.isFetching) && !check.isError);
  const failed = hash !== null && check.isError;
  return {
    unknown,
    held: checking || failed || (hash !== null && buyer === null),
    checking,
    failed,
    retry: () => void check.refetch(),
    resolved,
    dismiss: () => setResolved(null),
    clear,
  };
}

/** A send's request with the player who sent it: an unknown outcome is recorded under the sender, whoever is connected by then. */
type Sent<R> = R & { playerId: string };

/** The key of a kind's purchases in the mutation cache: what `useSending` looks for. */
const purchaseMutationKey = (kind: PurchaseKind) => ["purchase", kind] as const;

/**
 * Whether a purchase of `kind` sent by `playerId` is still pending, from the mutation cache: a change of player resets the
 * page's mutation, which never ends the send itself, so a player who switches away and back must still find Pay held.
 */
function useSending(kind: PurchaseKind, playerId: string | null): boolean {
  const senders = useMutationState({
    filters: { mutationKey: purchaseMutationKey(kind), status: "pending" },
    select: (mutation) => (mutation.state.variables as { playerId?: string } | undefined)?.playerId ?? null,
  });
  return playerId !== null && senders.some((sender) => sender !== null && addressKey(sender) === addressKey(playerId));
}

/** Records an unknown outcome under the player who sent it. */
function recordUnknown(client: ReturnType<typeof useQueryClient>, kind: PurchaseKind, error: Error, playerId: string): void {
  if (outcomeUnknown(error)) writeUnknownPurchase(client, playerId, kind, { hash: error.transactionHash!, at: Math.floor(Date.now() / 1000) });
}

/**
 * Buys a Challenge game. On its receipt the player's USDC, games and active game are read again; the page opens the new
 * game (`gameId`). An unknown outcome is recorded (`usePurchaseHold`), and its reads are left to the hold's check rather
 * than invalidated here, so an invalidation never cancels the check's own read. `buyer` is null without a signer or an
 * economy: the page asks to connect.
 */
export function usePurchase(playerId: string | null) {
  const buyer = usePurchases();
  const client = useQueryClient();
  const hold = usePurchaseHold("game", playerId);
  const mutation = useMutation<WriteResult & { gameId: number }, Error, Sent<PurchaseRequest>>({
    mutationKey: purchaseMutationKey("game"),
    mutationFn: ({ playerId: _sender, ...request }) => (buyer ? buyer.purchase(request) : Promise.reject(new Error("Connect to buy"))),
    onError: (error, { playerId: sender }) => recordUnknown(client, "game", error, sender),
    onSettled: (_data, error, variables) => {
      // A refusal may come from a moved price or a pause: those reads are stale too.
      void client.invalidateQueries({ queryKey: ["chain", "economy"] });
      void client.invalidateQueries({ queryKey: queryKeys.chain.spawnPaused() });
      const sender = variables?.playerId;
      if (!sender || outcomeUnknown(error)) return;
      void client.invalidateQueries({ queryKey: queryKeys.chain.usdcBalance(sender) });
      void client.invalidateQueries({ queryKey: queryKeys.chain.playerGames(sender) });
      void client.invalidateQueries({ queryKey: queryKeys.chain.activeGame(sender) });
    },
  });
  // Another player: the last one's refusal or success is not theirs. The send itself stays pending in the mutation
  // cache, and `sending` keeps the sender's Pay held when they come back.
  const { reset } = mutation;
  useEffect(() => reset(), [playerId, reset]);
  const sending = useSending("game", playerId);
  return { buyer, mutation, hold, sending };
}

/** A pack's receipt into the cache: the Cobbles balance `PackBought` carries. */
export function applyPackBought(client: ReturnType<typeof useQueryClient>, playerId: string, bought: PackBought): void {
  if (addressKey(bought.playerId) !== addressKey(playerId)) return;
  client.setQueryData<CobbleAccount | null>(cobbleKeys.account(playerId), (a) => (a ? { ...a, cobbles: bought.balance } : a));
}

/**
 * Buys a pack of Cobbles. Its receipt's `PackBought` sets the balance in the cache, then the account and the USDC are read
 * again (the reconciling read). An unknown outcome is recorded and held, as a game's (`usePurchaseHold`). `buyer` is null
 * without a signer or an economy.
 */
export function useBuyPack(playerId: string | null) {
  const buyer = usePurchases();
  const client = useQueryClient();
  const hold = usePurchaseHold("pack", playerId);
  const mutation = useMutation<WriteResult & { bought: PackBought }, Error, Sent<PackPurchaseRequest>>({
    mutationKey: purchaseMutationKey("pack"),
    mutationFn: ({ playerId: _sender, ...request }) => (buyer ? buyer.buyPack(request) : Promise.reject(new Error("Connect to buy"))),
    onSuccess: ({ bought }, { playerId: sender }) => applyPackBought(client, sender, bought),
    onError: (error, { playerId: sender }) => recordUnknown(client, "pack", error, sender),
    onSettled: (_data, error, variables) => {
      void client.invalidateQueries({ queryKey: packKeys.packs() });
      void client.invalidateQueries({ queryKey: ["chain", "economy"] });
      const sender = variables?.playerId;
      if (!sender || outcomeUnknown(error)) return;
      void client.invalidateQueries({ queryKey: cobbleKeys.account(sender) });
      void client.invalidateQueries({ queryKey: queryKeys.chain.usdcBalance(sender) });
    },
  });
  const { reset } = mutation;
  useEffect(() => reset(), [playerId, reset]);
  const sending = useSending("pack", playerId);
  return { buyer, mutation, hold, sending };
}

/**
 * A failed purchase as the scene shows it. A price that changed since the confirm, or the pool's quote that moved (before
 * sending, or the swap's `min_out` revert), asks to confirm again; a quote far below the guard rate asks to confirm it; a
 * pause; another write on its way; an outcome the receipt could not tell; anything else is a refusal with the writer's message.
 */
export function purchaseRefusal(error: Error): PurchaseRefusal {
  if (error instanceof PurchasePriceChangedError || error instanceof PackPriceChangedError || (error instanceof PackRefusedError && error.reason === "no-allowance")) {
    return { kind: "moved", message: "The price changed since you confirmed: check the new price and confirm again. Your USDC was not spent." };
  }
  // The swap's `min_out`: the player's price did not move, the pool's quote did.
  if (error instanceof PoolPriceMovedError || error instanceof SwapBelowMinOutError || (error instanceof PackRefusedError && error.reason === "price-moved")) {
    return { kind: "quote-moved", message: "The pool's quote moved: confirm again. Your USDC was not spent." };
  }
  // The writer's serialisation: one write of the account at a time.
  if (error instanceof WriteError && error.message === "Another write is pending") {
    return { kind: "busy", message: "Wait for your other transaction, then confirm again." };
  }
  if (error instanceof PoolQuoteBelowFloorError) {
    return { kind: "low-quote", message: "The pool quotes far less PAVED than the guard rate for this purchase. Buy anyway, or try later." };
  }
  if (error instanceof SpawnPausedError) return { kind: "paused", message: error.message };
  if (error instanceof PurchaseOutcomeUnknownError || error instanceof PackOutcomeUnknownError) return { kind: "unknown", message: error.message };
  return { kind: "refused", message: error.message };
}
