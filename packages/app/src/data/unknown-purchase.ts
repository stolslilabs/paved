import { useCallback, useEffect } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { addressKey } from "./keys";

// A purchase whose outcome is unknown (P7b, review loop 2): it was sent, but its receipt could not tell whether it landed,
// or the wallet has not answered (no hash, but the send may still land). The hash-less record is written when the send
// starts (SESSION-NOAPPROVE), so a reload while the wallet's prompt is open still holds Pay. Until its receipt reads, its
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
  /**
   * The send's identity (`newSendId`: milliseconds and a random part), which tells two sends of the same second apart; a
   * record stored before it existed has none, and is then no send's own.
   */
  id?: string;
}

/** A new send's identity: the time in milliseconds and a random part, unique across tabs and sends of the same second. */
export function newSendId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Whether `record` is the send `id`'s own. */
const ownedBy = (record: UnknownPurchase, id: string): boolean => record.id !== undefined && record.id === id;

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

/**
 * The late answer of a send A whose hold a newer send B had replaced (B's prompt open, or B's own record): A's unknown hash,
 * or null when A's answer settled it (it landed or was refused). It is kept aside, so B's answer never loses it: when B's
 * hold goes (B sent nothing and A's record comes back, or B settles and the slot empties), A's answer takes the slot
 * (`settleAside`). One per player and kind, in storage beside the record (`paved:purchase-late:v1:<kind>:<player>`, so a
 * reload keeps it) and in memory when storage is off.
 */
interface AsideAnswer {
  id: string;
  record: UnknownPurchase | null;
}

/** The storage key of a player's late answer kept aside. */
export const lateAnswerStorageKey = (playerId: string, kind: PurchaseKind): string => `paved:purchase-late:v1:${kind}:${addressKey(playerId)}`;

const asideInMemory = new Map<string, AsideAnswer>();

/**
 * The aside keys whose last storage write failed (storage full or refused) in this page's life: only those, and a storage
 * that cannot be read at all, are read from memory. Otherwise storage alone is read, so another tab's removal is seen and a
 * stale copy in this tab's memory never brings a settled answer back.
 */
const asideUnsaved = new Set<string>();

/** Forgets the late answers kept aside in memory, between tests. */
export function resetAsideForTests(): void {
  asideInMemory.clear();
  asideUnsaved.clear();
}

/** The stored answer, `undefined` when storage cannot be read, null when there is none (or it is not one). */
function readStoredAside(name: string): AsideAnswer | null | undefined {
  const store = storage();
  if (!store) return undefined;
  try {
    const raw = store.getItem(name);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as Partial<AsideAnswer>;
    const record = parsed.record as Partial<UnknownPurchase> | null | undefined;
    if (typeof parsed.id === "string" && record === null) return { id: parsed.id, record: null };
    if (typeof parsed.id === "string" && record && typeof record.hash === "string" && /^0x[0-9a-fA-F]+$/.test(record.hash)) {
      return { id: parsed.id, record: { hash: record.hash, at: Number(record.at ?? 0), id: parsed.id } };
    }
    return null;
  } catch {
    return undefined;
  }
}

function readAside(playerId: string, kind: PurchaseKind): AsideAnswer | null {
  const name = lateAnswerStorageKey(playerId, kind);
  const stored = asideUnsaved.has(name) ? undefined : readStoredAside(name);
  return stored === undefined ? (asideInMemory.get(name) ?? null) : stored;
}

function writeAside(playerId: string, kind: PurchaseKind, aside: AsideAnswer | null): void {
  const name = lateAnswerStorageKey(playerId, kind);
  if (aside) asideInMemory.set(name, aside);
  else asideInMemory.delete(name);
  try {
    const store = storage();
    if (!store) throw new Error("no storage");
    if (aside) store.setItem(name, JSON.stringify(aside));
    else store.removeItem(name);
    asideUnsaved.delete(name);
  } catch {
    // Storage full or off: the memory's copy holds it for the page's life, and the stale stored value is not read back.
    asideUnsaved.add(name);
  }
}

/**
 * Keeps A's late answer aside while another send's hold has the slot. A hash is never replaced by a settled answer of
 * another send: a purchase that may have landed outranks one known to be over.
 */
function putAside(playerId: string, kind: PurchaseKind, aside: AsideAnswer): void {
  const kept = readAside(playerId, kind);
  if (kept?.record && kept.id !== aside.id && aside.record === null) return;
  writeAside(playerId, kind, aside);
}

/**
 * What the slot takes in place of `record`, given the answer kept aside: A's hash when the slot empties, and A's answer
 * (its hash, or nothing) when A's own hash-less record comes back. The aside goes once used, or once the slot empties.
 */
function settleAside(playerId: string, kind: PurchaseKind, record: UnknownPurchase | null): UnknownPurchase | null {
  const aside = readAside(playerId, kind);
  if (!aside) return record;
  if (record === null) {
    writeAside(playerId, kind, null);
    return aside.record;
  }
  if (record.hash === null && record.id === aside.id) {
    writeAside(playerId, kind, null);
    return aside.record;
  }
  return record;
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
    const id = typeof parsed.id === "string" ? { id: parsed.id } : {};
    if (parsed.hash === null && Number.isFinite(parsed.at)) return { hash: null, at: Number(parsed.at), ...id };
    return typeof parsed.hash === "string" && /^0x[0-9a-fA-F]+$/.test(parsed.hash) ? { hash: parsed.hash, at: Number(parsed.at ?? 0), ...id } : null;
  } catch {
    return undefined;
  }
}

/**
 * Records (or clears, with null) a player's unknown purchase: in storage when it can be written, always in the cache. A
 * late answer kept aside (`putAside`) takes the slot when it empties or when its own send's record comes back.
 */
export function writeUnknownPurchase(client: QueryClient, playerId: string, kind: PurchaseKind, next: UnknownPurchase | null): void {
  // A late answer kept aside takes the slot when it empties, or when its own send's record comes back.
  const record = settleAside(playerId, kind, next);
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
export function currentRecord(client: QueryClient, playerId: string, kind: PurchaseKind): UnknownPurchase | null {
  const stored = readStored(playerId, kind);
  return stored === undefined ? (client.getQueryData<UnknownPurchase | null>(unknownPurchaseKey(playerId, kind)) ?? null) : stored;
}

/**
 * Clears the hold of a send the wallet never answered, once its late answer arrives: only the hash-less record of that send
 * (`id`, its identity), never a record with a hash or a later send's. While a later send's hold has the slot, the answer is
 * kept aside: should that send give the slot back to this one's record (it sent nothing), the record goes then.
 */
export function clearTimedOutPurchase(client: QueryClient, playerId: string, kind: PurchaseKind, id: string): void {
  const current = currentRecord(client, playerId, kind);
  if (current && current.hash === null && ownedBy(current, id)) writeUnknownPurchase(client, playerId, kind, null);
  // Another send holds the slot: if it gives the slot back to this send's record, that record is over.
  else if (current && !ownedBy(current, id)) putAside(playerId, kind, { id, record: null });
}

/**
 * Writes the record of the send `record.id` (its hash-less hold, or the hash of its unknown outcome) only when the
 * current record is that send's, or there is none: a late answer of an earlier send never overwrites a newer send's hold.
 * Its hash is kept aside instead, and takes the slot when the newer send's hold goes, so it is still checked.
 */
export function recordOwnSend(client: QueryClient, playerId: string, kind: PurchaseKind, record: UnknownPurchase): void {
  const current = currentRecord(client, playerId, kind);
  if (current === null || (record.id !== undefined && ownedBy(current, record.id))) writeUnknownPurchase(client, playerId, kind, record);
  // A late hash while another send holds the slot: kept aside, and checked once that send's hold goes (`settleAside`).
  else if (record.id !== undefined && record.hash !== null) putAside(playerId, kind, { id: record.id, record });
}

/**
 * Puts back `previous` (null clears) in place of the hash-less hold of the send `id`, when that hold is still the
 * current record: a send that sent nothing (refused before sending, declined in the wallet, or the writer busy) leaves the
 * record as it was before it.
 */
export function restorePurchase(client: QueryClient, playerId: string, kind: PurchaseKind, id: string, previous: UnknownPurchase | null): void {
  const current = currentRecord(client, playerId, kind);
  if (current && current.hash === null && ownedBy(current, id)) writeUnknownPurchase(client, playerId, kind, previous);
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
