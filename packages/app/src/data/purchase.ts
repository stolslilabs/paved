import { useCallback, useEffect, useRef, useState } from "react";
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

/**
 * How long a wallet may take to answer a purchase before the page stops waiting: 5 minutes. A prompt the player reads, signs
 * and sees included takes a minute or two on a slow network, so a shorter limit would call a slow but honest send "unknown";
 * a promise still pending after 5 minutes is the wallet's hang (a closed popup, a dead extension), which would otherwise hold
 * Pay on "Confirm in your wallet" for good.
 */
export const PURCHASE_TIMEOUT_MS = 300_000;

/**
 * The wallet did not answer in `PURCHASE_TIMEOUT_MS`: the purchase may still be signed and land, so the outcome is unknown.
 * It carries no hash (none was given), so nothing can be recorded or checked by receipt; the page says so and offers Buy
 * again, which the writer refuses ("Another write is pending") while the hung send still holds the account's write.
 */
export class PurchaseTimedOutError extends Error {
  /** `sendId` tells which send timed out: its late answer clears this error and no other send's. */
  constructor(readonly sendId = 0) {
    super(`Your wallet did not answer in ${PURCHASE_TIMEOUT_MS / 60_000} minutes: the purchase may still go through. Check your wallet and your balance before buying again.`);
    this.name = "PurchaseTimedOutError";
  }
}

/** What a send answered after the page stopped waiting for it. */
export type LateAnswer<T> = { value: T } | { error: Error };

/**
 * `send`'s answer, or `PurchaseTimedOutError` (tagged with `id`) when it is still pending after `ms`. `onTimeout` runs then.
 * The send itself is not cancelled: its late answer goes to `onLate` (a hash that arrives at minute 6 must still be
 * recorded). The timer is not cleared on unmount: it fires once and settles a promise nobody waits for, which is harmless.
 */
export function withPurchaseTimeout<T>(
  send: Promise<T>,
  { ms = PURCHASE_TIMEOUT_MS, id = 0, onTimeout, onLate }: { ms?: number; id?: number; onTimeout?: () => void; onLate?: (answer: LateAnswer<T>) => void } = {},
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      onTimeout?.();
      reject(new PurchaseTimedOutError(id));
    }, ms);
    send.then(
      (value) => {
        if (timedOut) return onLate?.({ value });
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        const failure = error instanceof Error ? error : new Error(String(error));
        if (timedOut) return onLate?.({ error: failure });
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

const nowSeconds = (): number => Math.floor(Date.now() / 1000);

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
  const { unknown, isPending, unsaved, clear } = useUnknownPurchase(playerId, kind);
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
    /** Retry is fetching: Dismiss waits for its answer. */
    retrying: failed && check.isFetching,
    /** The record could not be written to storage: it holds in this tab only. */
    unsaved,
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

/** The query key of the game a send opened for `playerId` and the page has not opened yet (`local`: the browser's state). */
const readyKey = (kind: PurchaseKind, playerId: string) => ["local", "purchaseReady", kind, addressKey(playerId)] as const;

/** Keeps the game a send bought for its sender, however long the player stays away: the entry never expires (as `unknown-purchase.ts`'s). */
function setReady(client: ReturnType<typeof useQueryClient>, kind: PurchaseKind, playerId: string, gameId: number | null): void {
  client.setQueryDefaults(["local", "purchaseReady"], { gcTime: Infinity });
  client.setQueryData(readyKey(kind, playerId), gameId);
}

/**
 * The game bought by a send whose page was gone when it landed (a change of player resets the page's mutation, so its own
 * `onSuccess` never runs): its id until the player opens it (`open`) or buys again (`clear`). Null otherwise.
 */
function useReady(kind: PurchaseKind, playerId: string | null) {
  const client = useQueryClient();
  const { data } = useQuery({ queryKey: readyKey(kind, playerId ?? "0x0"), queryFn: () => null as number | null, enabled: false, initialData: null as number | null, gcTime: Infinity });
  const clear = useCallback(() => playerId !== null && setReady(client, kind, playerId, null), [client, kind, playerId]);
  return { gameId: playerId === null ? null : data, clear };
}

/** Records an unknown outcome under the player who sent it, stamped with the time of the send (`sentAt`), not of the outcome. */
function recordUnknown(client: ReturnType<typeof useQueryClient>, kind: PurchaseKind, error: Error, playerId: string, sentAt: number | undefined): void {
  if (outcomeUnknown(error)) writeUnknownPurchase(client, playerId, kind, { hash: error.transactionHash!, at: sentAt ?? nowSeconds() });
}

/** The reads a game purchase touches, read again once it is settled (a refusal may come from a moved price or a pause too). */
function reconcileGame(client: ReturnType<typeof useQueryClient>, error: Error | null, sender: string | undefined): void {
  void client.invalidateQueries({ queryKey: ["chain", "economy"] });
  void client.invalidateQueries({ queryKey: queryKeys.chain.spawnPaused() });
  if (!sender || outcomeUnknown(error)) return;
  void client.invalidateQueries({ queryKey: queryKeys.chain.usdcBalance(sender) });
  void client.invalidateQueries({ queryKey: queryKeys.chain.playerGames(sender) });
  void client.invalidateQueries({ queryKey: queryKeys.chain.activeGame(sender) });
}

/** The reads a pack purchase touches, read again once it is settled. */
function reconcilePack(client: ReturnType<typeof useQueryClient>, error: Error | null, sender: string | undefined): void {
  void client.invalidateQueries({ queryKey: packKeys.packs() });
  void client.invalidateQueries({ queryKey: ["chain", "economy"] });
  if (!sender || outcomeUnknown(error)) return;
  void client.invalidateQueries({ queryKey: cobbleKeys.account(sender) });
  void client.invalidateQueries({ queryKey: queryKeys.chain.usdcBalance(sender) });
}

/**
 * What a late answer needs of the page's mutation: its latest error, `reset`, the sender of its last send, and the sends
 * that timed out and still hold their sender's writer (`hung`: sender to send id).
 */
interface TimeoutGuard {
  error: Error | null;
  reset: () => void;
  sender: string | null;
  hung: Map<string, number>;
}

let sendCounter = 0;

const isBusy = (error: Error | null): boolean => error instanceof WriteError && error.message === "Another write is pending";

/**
 * Clears the page's state when the late answer of send `id` settles it: its own timed-out error, or the busy refusal a Buy
 * again drew from that same send's hold on the writer. Never another send's (a second player's timeout, a newer purchase).
 */
function clearTimedOut(guard: { current: TimeoutGuard }, id: number, sender: string): void {
  const { error, reset, sender: last, hung } = guard.current;
  const own = error instanceof PurchaseTimedOutError && error.sendId === id;
  const busy = isBusy(error) && hung.get(addressKey(sender)) === id && last !== null && addressKey(last) === addressKey(sender);
  if (own || busy) reset();
}

/** A purchase's send under the writer timeout, its late answer given to `onLate` and then clearing what it settles. */
function guardedSend<T>(guard: { current: TimeoutGuard }, sender: string, send: Promise<T>, onLate: (late: LateAnswer<T>) => void): Promise<T> {
  const id = ++sendCounter;
  const key = addressKey(sender);
  return withPurchaseTimeout(send, {
    id,
    onTimeout: () => guard.current.hung.set(key, id),
    onLate: (late) => {
      onLate(late);
      if (!("error" in late && outcomeUnknown(late.error))) clearTimedOut(guard, id, sender);
      if (guard.current.hung.get(key) === id) guard.current.hung.delete(key);
    },
  });
}

/** Keeps `guard` on the mutation as rendered (an effect, not a write during render). */
function useTimeoutGuard(mutation: { error: Error | null; reset: () => void; variables?: { playerId?: string } }, guard: { current: TimeoutGuard }): void {
  useEffect(() => {
    Object.assign(guard.current, { error: mutation.error, reset: mutation.reset, sender: mutation.variables?.playerId ?? guard.current.sender });
  });
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
  const guard = useRef<TimeoutGuard>({ error: null, reset: () => {}, sender: null, hung: new Map() });
  const mutation = useMutation<WriteResult & { gameId: number }, Error, Sent<PurchaseRequest>, { sentAt: number }>({
    mutationKey: purchaseMutationKey("game"),
    mutationFn: ({ playerId: sender, ...request }) => {
      const sentAt = nowSeconds();
      return guardedSend(guard, sender, buyer ? buyer.purchase(request) : Promise.reject(new Error("Connect to buy")), (late) => {
        // The wallet answered after the page gave up: as an in-time answer would have gone.
        if ("value" in late) setReady(client, "game", sender, late.value.gameId);
        else recordUnknown(client, "game", late.error, sender, sentAt);
        reconcileGame(client, "error" in late ? late.error : null, sender);
      });
    },
    onMutate: () => ({ sentAt: nowSeconds() }),
    // The game is kept for its sender: a send that lands after a change of player has no page to open it (`ready`).
    onSuccess: ({ gameId }, { playerId: sender }) => setReady(client, "game", sender, gameId),
    onError: (error, { playerId: sender }, context) => recordUnknown(client, "game", error, sender, context?.sentAt),
    onSettled: (_data, error, variables) => reconcileGame(client, error, variables?.playerId),
  });
  useTimeoutGuard(mutation, guard);
  // Another player: the last one's refusal or success is not theirs. The send itself stays pending in the mutation
  // cache, and `sending` keeps the sender's Pay held when they come back.
  const { reset } = mutation;
  useEffect(() => reset(), [playerId, reset]);
  const sending = useSending("game", playerId);
  const ready = useReady("game", playerId);
  return { buyer, mutation, hold, sending, ready };
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
  const guard = useRef<TimeoutGuard>({ error: null, reset: () => {}, sender: null, hung: new Map() });
  const mutation = useMutation<WriteResult & { bought: PackBought }, Error, Sent<PackPurchaseRequest>, { sentAt: number }>({
    mutationKey: purchaseMutationKey("pack"),
    mutationFn: ({ playerId: sender, ...request }) => {
      const sentAt = nowSeconds();
      return guardedSend(guard, sender, buyer ? buyer.buyPack(request) : Promise.reject(new Error("Connect to buy")), (late) => {
        if ("value" in late) applyPackBought(client, sender, late.value.bought);
        else recordUnknown(client, "pack", late.error, sender, sentAt);
        reconcilePack(client, "error" in late ? late.error : null, sender);
      });
    },
    onMutate: () => ({ sentAt: nowSeconds() }),
    onSuccess: ({ bought }, { playerId: sender }) => applyPackBought(client, sender, bought),
    onError: (error, { playerId: sender }, context) => recordUnknown(client, "pack", error, sender, context?.sentAt),
    onSettled: (_data, error, variables) => reconcilePack(client, error, variables?.playerId),
  });
  useTimeoutGuard(mutation, guard);
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
  if (error instanceof PurchaseTimedOutError) return { kind: "unknown", message: error.message };
  if (error instanceof PurchaseOutcomeUnknownError || error instanceof PackOutcomeUnknownError) return { kind: "unknown", message: error.message };
  return { kind: "refused", message: error.message };
}
