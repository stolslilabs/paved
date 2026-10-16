import { useCallback, useEffect } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { addressKey } from "./keys";

// A purchase whose outcome is unknown (P7b, review loop 2): it was sent, but its receipt could not tell whether it landed,
// or the wallet never answered (`PurchaseTimedOutError`: no hash, but the send may still land). Until its receipt reads, its
// late answer arrives, or the player confirms that nothing landed, the page holds Pay (or Buy): a game's second purchase
// would be signed without a prompt. The record outlives the component: `localStorage`, per player and kind, so a remount
// ("Check my games" and back), a reload and a second tab all find it. With storage off, the query cache keeps it for the
// session (its entry never expires).

/** What was bought: a Challenge game, or a pack of Cobbles. */
export type PurchaseKind = "game" | "pack";

/**
 * The unknown purchase of a player and kind: its transaction hash and when it was sent (seconds). `hash` null is a send the
 * wallet never answered (timed out): sent at `at`, by this player, and it may still land; there is no receipt to read.
 */
export interface UnknownPurchase {
  hash: string | null;
  at: number;
}

/** The storage key of a player's unknown purchase of `kind`: `paved:purchase-unknown:v1:<kind>:<player>`. */
export const unknownPurchaseStorageKey = (playerId: string, kind: PurchaseKind): string => `paved:purchase-unknown:v1:${kind}:${addressKey(playerId)}`;

/** The query key of the record (`local`: the browser's state, not the chain's). */
export const unknownPurchaseKey = (playerId: string, kind: PurchaseKind) => ["local", "unknownPurchase", kind, addressKey(playerId)] as const;

/**
 * The keys whose last write failed (storage full, or refused) in this page's life: their stored value is stale, so they are
 * read from the cache's copy instead (`readStored` answers `undefined` for them). A write or removal that succeeds drops it.
 */
const failedWrites = new Set<string>();

/** Forgets the failed writes, between tests (a new page's life). */
export function resetFailedWritesForTests(): void {
  failedWrites.clear();
}

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** The stored record, `undefined` when storage cannot be read (the cache's copy is kept then), null when there is none. */
function readStored(playerId: string, kind: PurchaseKind): UnknownPurchase | null | undefined {
  const store = storage();
  const name = unknownPurchaseStorageKey(playerId, kind);
  if (!store || failedWrites.has(name)) return undefined;
  try {
    const raw = store.getItem(name);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as Partial<UnknownPurchase>;
    if (parsed.hash === null && Number.isFinite(parsed.at)) return { hash: null, at: Number(parsed.at) };
    return typeof parsed.hash === "string" && /^0x[0-9a-fA-F]+$/.test(parsed.hash) ? { hash: parsed.hash, at: Number(parsed.at ?? 0) } : null;
  } catch {
    return undefined;
  }
}

/** Records (or clears, with null) a player's unknown purchase: in storage when it can be written, always in the cache. */
export function writeUnknownPurchase(client: QueryClient, playerId: string, kind: PurchaseKind, record: UnknownPurchase | null): void {
  const store = storage();
  const name = unknownPurchaseStorageKey(playerId, kind);
  try {
    if (!store) throw new Error("no storage");
    if (record) store.setItem(name, JSON.stringify(record));
    else store.removeItem(name);
    failedWrites.delete(name);
  } catch {
    // Storage off or full: the cache's copy holds it for the session, and the stale stored value is not read back.
    failedWrites.add(name);
  }
  client.setQueryData(unknownPurchaseKey(playerId, kind), record);
}

/** The player's record as the page would read it: the stored one, or the cache's copy when storage cannot be read. */
function currentRecord(client: QueryClient, playerId: string, kind: PurchaseKind): UnknownPurchase | null {
  const stored = readStored(playerId, kind);
  return stored === undefined ? (client.getQueryData<UnknownPurchase | null>(unknownPurchaseKey(playerId, kind)) ?? null) : stored;
}

/**
 * Clears the hold of a send the wallet never answered, once its late answer arrives: only the hash-less record of that send
 * (`at`, its time of sending), never a record with a hash or a later send's.
 */
export function clearTimedOutPurchase(client: QueryClient, playerId: string, kind: PurchaseKind, at: number): void {
  const record = currentRecord(client, playerId, kind);
  if (record && record.hash === null && record.at === at) writeUnknownPurchase(client, playerId, kind, null);
}

/**
 * The player's unknown purchase of `kind`, or null. Read from storage at each mount (a reload, a second tab), and again
 * when another tab writes it (the `storage` event); with storage off, the cache's copy.
 */
export function useUnknownPurchase(playerId: string | null, kind: PurchaseKind) {
  const client = useQueryClient();
  const key = unknownPurchaseKey(playerId ?? "0x0", kind);
  const query = useQuery({
    queryKey: key,
    queryFn: () => currentRecord(client, playerId as string, kind),
    enabled: playerId !== null,
    staleTime: 0,
    gcTime: Infinity,
  });
  useEffect(() => {
    if (playerId === null) return;
    const name = unknownPurchaseStorageKey(playerId, kind);
    const onStorage = (event: StorageEvent) => {
      if (event.key === name || event.key === null) void client.invalidateQueries({ queryKey: unknownPurchaseKey(playerId, kind) });
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [client, playerId, kind]);
  const record = useCallback(
    (hash: string | null, at = Math.floor(Date.now() / 1000)) => playerId !== null && writeUnknownPurchase(client, playerId, kind, { hash, at }),
    [client, playerId, kind],
  );
  // Read at each render: a write that fails sets it before the cache's copy is, which renders again.
  const unsaved = playerId !== null && failedWrites.has(unknownPurchaseStorageKey(playerId, kind));
  const clear = useCallback(() => playerId !== null && writeUnknownPurchase(client, playerId, kind, null), [client, playerId, kind]);
  return { unknown: playerId === null ? null : (query.data ?? null), isPending: playerId !== null && query.isPending, unsaved, record, clear };
}
