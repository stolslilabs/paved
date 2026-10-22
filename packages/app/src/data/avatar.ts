import { useMutation, useQueries, useQueryClient, type QueryClient, type UseQueryResult } from "@tanstack/react-query";
import type { AvatarItem, AvatarViews, CobbleAccount, DecodedEvent, GameViews, PavedWriter, WriteResult } from "@paved/chain";
import { AVATAR_PARTS, AVATAR_PART_KEYS, decodeAvatar, type Avatar } from "@paved/renderer";
import type { AvatarOffer, AvatarOffers } from "../components/containers/avatar-types";
import { cobbleKeys, cobbleViews } from "./cobbles";
import { addressKey } from "./keys";
import { useDataSources, type DataSources } from "./sources";

// The avatar on chain (#627, `docs/architecture/avatar-chain.md`): any player's avatar (the menus, #624) and the catalogue
// with the player's items and balance (the creator, #626 PR 2), read from `Avatar`'s views (`AvatarViews`), the balance from
// the ledger's `account`. A purchase (`buy_avatar_item`) and a save (`set_avatar`) go through the signer; their receipts'
// `AvatarItemBought` and `AvatarSet` go into the cache (`setQueryData`), then one `invalidateQueries` reconciles the reads they
// touched. Nothing polls. A network without `Avatar` answers null (its views are `not-configured`): no avatar there yet. A look
// is AVATAR-LOOK's value (`@paved/renderer`'s `encodeAvatar` and `decodeAvatar` turn it into the parts the creator draws).

/** The keys of the avatar's reads, `[domain, read, ...args]` as `keys.ts`'s. Read from the chain. A look is a decimal string in the cache. */
export const avatarKeys = {
  /** `parts()`. */
  parts: ["chain", "avatar", "parts"] as const,
  /** `price_bounds()`. */
  bounds: ["chain", "avatar", "bounds"] as const,
  /** `items(part)`. */
  items: (part: number) => ["chain", "avatar", "items", part] as const,
  /** `owned(player_id, part)`. */
  owned: (playerId: string, part: number) => ["chain", "avatar", "owned", addressKey(playerId), part] as const,
  /** `avatar(player_id)`. */
  look: (playerId: string) => ["chain", "avatar", "look", addressKey(playerId)] as const,
  /** Every read of the avatar: what a write's receipt invalidates. */
  all: ["chain", "avatar"] as const,
};

/** The two writes of the avatar: `PavedWriter`'s. */
export type AvatarSigner = Pick<PavedWriter, "address" | "buyAvatarItem" | "setAvatar">;

/** The signer's avatar writes, or null: no signer, or one without them (read only). */
export function avatarSigner(sources: Pick<DataSources, "signer">): AvatarSigner | null {
  const signer = sources.signer as (Partial<AvatarSigner> & { address: string }) | null | undefined;
  return signer && typeof signer.buyAvatarItem === "function" && typeof signer.setAvatar === "function" ? (signer as AvatarSigner) : null;
}

/** The sources' avatar views, or null (a views double without them). Probed as `skinViews` is. */
export function avatarViews(views: GameViews): AvatarViews | null {
  const v = views as GameViews & Partial<AvatarViews>;
  return typeof v.avatar === "function" && typeof v.avatarParts === "function" && typeof v.avatarItems === "function" && typeof v.ownedAvatarItems === "function"
    ? (v as AvatarViews)
    : null;
}

/** A `ViewError` of kind `not-configured`, read by shape: the deployment has no `Avatar`. */
const notConfigured = (error: unknown): boolean => (error as { kind?: unknown } | null)?.kind === "not-configured";

/** A read that answers null where the deployment has no `Avatar`, and throws any other error. */
async function orNone<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (error) {
    if (notConfigured(error)) return null;
    throw error;
  }
}

/**
 * The item id of each of the first `parts` parts of a look, part 0 first; null for 0, another version or a byte past the
 * parts. `@paved/chain`'s `lookIds`, here because a value import of the chain would bring starknet.js into the page's chunk
 * (a test checks the two agree).
 */
export function idsOf(look: bigint, parts: number): number[] | null {
  if (look < 0n || (look & 0xffn) !== 1n) return null;
  let rest = look >> 8n;
  const ids: number[] = [];
  for (let part = 0; part < parts; part++) {
    ids.push(Number(rest & 0xffn));
    rest >>= 8n;
  }
  return rest === 0n ? ids : null;
}

/** A player's avatar as the menus show it: the look, and the item id of each part in use (null: none set, or a look the chain would not take). */
export interface AvatarData {
  look: bigint;
  ids: number[] | null;
}

/**
 * Any player's avatar (the menus' avatar, #624; another player's, later): the look and its item ids. `look` 0n is no avatar
 * set (the client's default). Null on a network without `Avatar`; disabled without a player.
 */
export function useAvatar(playerId: string | null): { data: AvatarData | null | undefined; isPending: boolean; error: Error | null } {
  const { views } = useDataSources();
  const avatar = avatarViews(views);
  const id = playerId ?? "0x0";
  const enabled = playerId !== null && avatar !== null;
  return useQueries({
    queries: [
      { queryKey: avatarKeys.look(id), queryFn: () => orNone(async () => String(await avatar!.avatar(id))), enabled },
      { queryKey: avatarKeys.parts, queryFn: () => orNone(() => avatar!.avatarParts()), enabled },
    ],
    combine: ([look, parts]) => {
      if (playerId !== null && !enabled) return { data: null, isPending: false, error: null };
      const ready = look.data !== undefined && parts.data !== undefined;
      const error = look.error ?? parts.error ?? null;
      const data = !ready ? undefined : look.data === null || parts.data === null ? null : avatarData(BigInt(look.data), parts.data);
      // A failed read ends the wait: pending only while nothing failed.
      return { data, isPending: !ready && !error, error };
    },
  });
}

const avatarData = (look: bigint, parts: number): AvatarData => ({ look, ids: look === 0n ? null : idsOf(look, parts) });

/**
 * The avatar a player saved, as the menus draw it (#626): the look decoded (`decodeAvatar`: an id this client does not draw
 * is that part's default), or null for none saved, a look the chain would not take, or nothing read yet: the default avatar.
 */
export function savedAvatar(data: AvatarData | null | undefined): Avatar | null {
  return data && data.ids !== null ? decodeAvatar(data.look) : null;
}

// `AVATAR_LISTED` of `@paved/chain`: a literal, as `idsOf`, so the menus' chunk takes no value from the chain.
const LISTED = 1;

/** What one item is to the player at `now` (seconds): owned first (it stays theirs off sale), then free, on sale, or off. */
export function avatarOffer(item: AvatarItem | undefined, owned: bigint, id: number, now: number): AvatarOffer {
  if (((owned >> BigInt(id)) & 1n) === 1n) return { kind: "owned" };
  if (!item || item.state !== LISTED) return { kind: "off" };
  if (item.cobbles === 0) return { kind: "free" };
  const left = item.supply === 0 || item.sold < item.supply;
  const open = item.until === 0 || now < item.until;
  return left && open ? { kind: "sale", cobbles: item.cobbles, until: item.until } : { kind: "off" };
}

/**
 * The creator's offers (#626 PR 2): each part in use (the chain's count, at most the format's ten) and, for each variant
 * this client draws, what it is to the player at `now`; an item the chain lists past the drawn variants is left out.
 */
export function avatarOffers(catalogue: Pick<AvatarCatalogue, "parts" | "items" | "owned">, now: number): AvatarOffers {
  return Object.fromEntries(
    AVATAR_PART_KEYS.slice(0, catalogue.parts).map((part, p) => [
      part,
      AVATAR_PARTS[part].map((_, id) => avatarOffer(catalogue.items[p]?.[id], catalogue.owned[p] ?? 0n, id, now)),
    ]),
  );
}

/** The creator's data: the parts in use, the price bounds, every part's items and the player's owned bitmap of each, the look and the balance. */
export interface AvatarCatalogue {
  parts: number;
  bounds: [number, number];
  /** By part, id 0 up to the highest listed. */
  items: AvatarItem[][];
  /** By part: bit `id` is item `id`, owned. */
  owned: bigint[];
  look: bigint;
  balance: number;
}

/**
 * The avatar creator's catalogue (#626 PR 2): the parts in use first, then each part's items and the player's owned bitmap
 * (`items(p)` and `owned(player, p)`, one read each), the look and the balance. Null on a network without `Avatar` or
 * without the ledger; disabled without a player. An owned bitmap is a decimal string in the cache (no bigint in a key or
 * its data's JSON).
 */
export function useAvatarCatalogue(playerId: string | null): { data: AvatarCatalogue | null | undefined; isPending: boolean; error: Error | null } {
  const { views } = useDataSources();
  const ledger = cobbleViews(views);
  const avatar = avatarViews(views);
  const id = playerId ?? "0x0";
  const enabled = playerId !== null && avatar !== null && ledger !== null;
  const [partsRead] = useQueries({
    queries: [{ queryKey: avatarKeys.parts, queryFn: () => orNone(() => avatar!.avatarParts()), enabled }],
  });
  const parts = Array.from({ length: partsRead?.data ?? 0 }, (_, part) => part);
  return useQueries({
    queries: [
      { queryKey: avatarKeys.bounds, queryFn: () => orNone(() => avatar!.avatarPriceBounds()), enabled },
      { queryKey: avatarKeys.look(id), queryFn: () => orNone(async () => String(await avatar!.avatar(id))), enabled },
      { queryKey: cobbleKeys.account(id), queryFn: () => (ledger ? ledger.account(id) : null), enabled },
      ...parts.map((part) => ({ queryKey: avatarKeys.items(part), queryFn: () => avatar!.avatarItems(part), enabled })),
      ...parts.map((part) => ({
        queryKey: avatarKeys.owned(id, part),
        queryFn: async () => String(await avatar!.ownedAvatarItems(id, part)),
        enabled,
      })),
    ],
    combine: (results) => {
      const [bounds, look, account, ...rest] = results as unknown as [
        UseQueryResult<[number, number] | null>,
        UseQueryResult<string | null>,
        UseQueryResult<CobbleAccount | null>,
        ...UseQueryResult<AvatarItem[] | string>[],
      ];
      if (playerId !== null && !enabled) return { data: null, isPending: false, error: null };
      const error = partsRead?.error ?? bounds.error ?? look.error ?? account.error ?? rest.find((r) => r.error)?.error ?? null;
      if (partsRead?.data === null || bounds.data === null || look.data === null || account.data === null) return { data: null, isPending: false, error };
      const ready = partsRead?.data !== undefined && bounds.data !== undefined && look.data !== undefined && account.data !== undefined && rest.every((r) => r.data !== undefined);
      // Decoded once every read is in: an owned bitmap still on its way has no value to decode.
      const data = ready
        ? {
            parts: parts.length,
            bounds: bounds.data!,
            items: rest.slice(0, parts.length).map((r) => r.data as AvatarItem[]),
            owned: rest.slice(parts.length).map((r) => BigInt(r.data as string)),
            look: BigInt(look.data!),
            balance: account.data!.cobbles,
          }
        : undefined;
      return {
        data,
        // A failed read ends the wait: pending only while nothing failed.
        isPending: !ready && !error,
        error,
      };
    },
  });
}

/**
 * An avatar write's receipt into the cache: `AvatarItemBought` sets the balance (its `balance`, the Cobbles after) and the
 * item's bit in the part's owned bitmap; `AvatarSet` replaces the look. Reads not in the cache are left to the reconciling read.
 */
export function applyAvatarEvents(client: QueryClient, playerId: string, events: readonly DecodedEvent[]): void {
  for (const { name, fields } of events) {
    if (name === "AvatarItemBought") {
      client.setQueryData<CobbleAccount | null>(cobbleKeys.account(playerId), (a) => (a ? { ...a, cobbles: Number(fields.balance) } : a));
      client.setQueryData<string>(avatarKeys.owned(playerId, Number(fields.part)), (o) =>
        o === undefined ? o : String(BigInt(o) | (1n << BigInt(Number(fields.id)))),
      );
    } else if (name === "AvatarSet") {
      client.setQueryData<string | null>(avatarKeys.look(playerId), String(BigInt(fields.look as string | bigint)));
    }
  }
}

/** What a write is on its way for: an item's purchase at the price the creator showed, or the avatar's save. */
export type AvatarWrite = { kind: "buy"; part: number; id: number; price: number } | { kind: "save"; look: bigint };

/**
 * The avatar writes of the connected account: `buy(part, id, price)` (one `buy_avatar_item`, at the price the creator
 * showed: the writer reads the item again inside its send and refuses another, `AvatarPriceChangedError`) and `save(look)`
 * (one `set_avatar`). Each puts its receipt's events into the cache and invalidates the reads it touched, after a refusal
 * too. `buying` is the item on its way, `saving` the save; `error` the last refusal (`AvatarRefusedError` or another
 * `WriteError`) until `reset`. `signer` is null without a signer that writes the avatar: read only.
 */
export function useAvatarWrites(playerId: string | null) {
  const sources = useDataSources();
  const signer = avatarSigner(sources);
  const client = useQueryClient();
  const mutation = useMutation<WriteResult, Error, AvatarWrite>({
    mutationFn: (write) => {
      if (!signer) return Promise.reject(new Error("Connect to buy items and save your avatar"));
      if (write.kind === "save") return signer.setAvatar(write.look);
      const items = avatarViews(sources.views);
      if (!items) return Promise.reject(new Error("The avatar items cannot be read on this network: nothing was sent"));
      return signer.buyAvatarItem({ part: write.part, id: write.id, confirmedPrice: write.price }, items);
    },
    onSuccess: ({ events }) => {
      if (playerId) applyAvatarEvents(client, playerId, events);
    },
    onSettled: (_result, _error, write) => {
      if (!playerId) return;
      if (write.kind === "save") {
        void client.invalidateQueries({ queryKey: avatarKeys.look(playerId) });
        return;
      }
      void client.invalidateQueries({ queryKey: avatarKeys.owned(playerId, write.part) });
      void client.invalidateQueries({ queryKey: cobbleKeys.account(playerId) });
      // A refused price change, a sold-out or ended sale shows the item as it is now.
      void client.invalidateQueries({ queryKey: avatarKeys.items(write.part) });
    },
  });
  const pending = mutation.isPending ? mutation.variables : undefined;
  return {
    signer,
    buying: pending?.kind === "buy" ? { part: pending.part, id: pending.id } : null,
    saving: pending?.kind === "save",
    saved: mutation.isSuccess && mutation.variables?.kind === "save",
    error: mutation.error,
    reset: () => mutation.reset(),
    buy: (part: number, id: number, price: number) => mutation.mutateAsync({ kind: "buy", part, id, price }),
    save: (look: bigint) => mutation.mutateAsync({ kind: "save", look }),
  };
}
