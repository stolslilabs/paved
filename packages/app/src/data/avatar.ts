import { useMutation, useQueries, useQueryClient, type QueryClient, type UseQueryResult } from "@tanstack/react-query";
import type { AvatarItem, AvatarViews, CobbleAccount, DecodedEvent, GameViews, PavedWriter, WriteResult } from "@paved/chain";
import { cobbleKeys, cobbleViews } from "./cobbles";
import { addressKey } from "./keys";
import { useDataSources, type DataSources } from "./sources";

// The avatar on chain (#627, `docs/architecture/avatar-chain.md`): any player's avatar (the menus, #624) and the catalogue
// with the player's items and balance (the creator, #626 PR 2), read from `Avatar`'s views (`AvatarViews`), the balance from
// the ledger's `account`. A purchase (`buy_avatar_item`) and a save (`set_avatar`) go through the signer; their receipts'
// `AvatarItemBought` and `AvatarSet` go into the cache (`setQueryData`), then one `invalidateQueries` reconciles the reads they
// touched. Nothing polls. A network without `Avatar` answers null (its views are `not-configured`): no avatar there yet.

/** The keys of the avatar's reads, `[domain, read, ...args]` as `keys.ts`'s. Read from the chain. A look is a decimal string in the cache. */
export const avatarKeys = {
  /** `layout()`. */
  layout: ["chain", "avatar", "layout"] as const,
  /** `price_bounds()`. */
  bounds: ["chain", "avatar", "bounds"] as const,
  /** `items(category)`. */
  items: (category: number) => ["chain", "avatar", "items", category] as const,
  /** `owned(player_id, category)`. */
  owned: (playerId: string, category: number) => ["chain", "avatar", "owned", addressKey(playerId), category] as const,
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
  return typeof v.avatar === "function" && typeof v.avatarLayout === "function" && typeof v.avatarItems === "function" && typeof v.ownedAvatarItems === "function"
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
 * The item id of each category of a look, category 0 first; null when a bit is set above the layout. `@paved/chain`'s
 * `lookIds`, here because a value import of the chain would bring starknet.js into the page's chunk (a test checks the two agree).
 */
export function partsOf(look: bigint, widths: readonly number[]): number[] | null {
  let rest = look;
  const ids: number[] = [];
  for (const width of widths) {
    const unit = 1n << BigInt(width);
    ids.push(Number(rest % unit));
    rest /= unit;
  }
  return rest === 0n ? ids : null;
}

/** A player's avatar as the menus show it: the look, its parts by the layout (null: none set, or a look the layout does not read). */
export interface AvatarData {
  look: bigint;
  parts: number[] | null;
}

/**
 * Any player's avatar (the menus' avatar, #624; another player's, later): the look and its parts by the layout. `look` 0n is
 * no avatar set (the client's default). Null on a network without `Avatar`; disabled without a player.
 */
export function useAvatar(playerId: string | null): { data: AvatarData | null | undefined; isPending: boolean; error: Error | null } {
  const { views } = useDataSources();
  const avatar = avatarViews(views);
  const id = playerId ?? "0x0";
  const enabled = playerId !== null && avatar !== null;
  return useQueries({
    queries: [
      { queryKey: avatarKeys.look(id), queryFn: () => orNone(async () => String(await avatar!.avatar(id))), enabled },
      { queryKey: avatarKeys.layout, queryFn: () => orNone(() => avatar!.avatarLayout()), enabled },
    ],
    combine: ([look, layout]) => {
      if (playerId !== null && !enabled) return { data: null, isPending: false, error: null };
      const ready = look.data !== undefined && layout.data !== undefined;
      const error = look.error ?? layout.error ?? null;
      const data = !ready ? undefined : look.data === null || layout.data === null ? null : avatarData(BigInt(look.data), layout.data);
      // A failed read ends the wait: pending only while nothing failed.
      return { data, isPending: !ready && !error, error };
    },
  });
}

const avatarData = (look: bigint, widths: readonly number[]): AvatarData => ({ look, parts: look === 0n ? null : partsOf(look, widths) });

/** The creator's data: the layout, the price bounds, every category's items and the player's owned bitmap of each, the look and the balance. */
export interface AvatarCatalogue {
  widths: number[];
  bounds: [number, number];
  /** By category, id 0 first. */
  items: AvatarItem[][];
  /** By category: bit `id` is item `id`, owned. */
  owned: bigint[];
  look: bigint;
  balance: number;
}

/**
 * The avatar creator's catalogue (#626 PR 2): the layout first, then each category's items and the player's owned bitmap
 * (`items(c)` and `owned(player, c)`, one read each), the look and the balance. Null on a network without `Avatar` or
 * without the ledger; disabled without a player. An owned bitmap is a decimal string in the cache (no bigint in a key or
 * its data's JSON).
 */
export function useAvatarCatalogue(playerId: string | null): { data: AvatarCatalogue | null | undefined; isPending: boolean; error: Error | null } {
  const { views } = useDataSources();
  const ledger = cobbleViews(views);
  const avatar = avatarViews(views);
  const id = playerId ?? "0x0";
  const enabled = playerId !== null && avatar !== null && ledger !== null;
  const [layout] = useQueries({
    queries: [{ queryKey: avatarKeys.layout, queryFn: () => orNone(() => avatar!.avatarLayout()), enabled }],
  });
  const widths = layout?.data ?? [];
  return useQueries({
    queries: [
      { queryKey: avatarKeys.bounds, queryFn: () => orNone(() => avatar!.avatarPriceBounds()), enabled },
      { queryKey: avatarKeys.look(id), queryFn: () => orNone(async () => String(await avatar!.avatar(id))), enabled },
      { queryKey: cobbleKeys.account(id), queryFn: () => (ledger ? ledger.account(id) : null), enabled },
      ...widths.map((_, category) => ({ queryKey: avatarKeys.items(category), queryFn: () => avatar!.avatarItems(category), enabled })),
      ...widths.map((_, category) => ({
        queryKey: avatarKeys.owned(id, category),
        queryFn: async () => String(await avatar!.ownedAvatarItems(id, category)),
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
      const error = layout?.error ?? bounds.error ?? look.error ?? account.error ?? rest.find((r) => r.error)?.error ?? null;
      if (layout?.data === null || bounds.data === null || look.data === null || account.data === null) return { data: null, isPending: false, error };
      const ready = layout?.data !== undefined && bounds.data !== undefined && look.data !== undefined && account.data !== undefined && rest.every((r) => r.data !== undefined);
      const items = rest.slice(0, widths.length).map((r) => r.data as AvatarItem[]);
      const owned = rest.slice(widths.length).map((r) => BigInt(r.data as string));
      return {
        data: ready ? { widths, bounds: bounds.data!, items, owned, look: BigInt(look.data!), balance: account.data!.cobbles } : undefined,
        // A failed read ends the wait: pending only while nothing failed.
        isPending: !ready && !error,
        error,
      };
    },
  });
}

/**
 * An avatar write's receipt into the cache: `AvatarItemBought` sets the balance (its `balance`, the Cobbles after) and the
 * item's bit in the category's owned bitmap; `AvatarSet` replaces the look. Reads not in the cache are left to the reconciling read.
 */
export function applyAvatarEvents(client: QueryClient, playerId: string, events: readonly DecodedEvent[]): void {
  for (const { name, fields } of events) {
    if (name === "AvatarItemBought") {
      client.setQueryData<CobbleAccount | null>(cobbleKeys.account(playerId), (a) => (a ? { ...a, cobbles: Number(fields.balance) } : a));
      client.setQueryData<string>(avatarKeys.owned(playerId, Number(fields.category)), (o) =>
        o === undefined ? o : String(BigInt(o) | (1n << BigInt(Number(fields.id)))),
      );
    } else if (name === "AvatarSet") {
      client.setQueryData<string | null>(avatarKeys.look(playerId), String(BigInt(fields.look as string | bigint)));
    }
  }
}

/** What a write is on its way for: an item's purchase at the price the creator showed, or the avatar's save. */
export type AvatarWrite = { kind: "buy"; category: number; id: number; price: number } | { kind: "save"; look: bigint };

/**
 * The avatar writes of the connected account: `buy(category, id, price)` (one `buy_avatar_item`, at the price the creator
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
      return signer.buyAvatarItem({ category: write.category, id: write.id, confirmedPrice: write.price }, items);
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
      void client.invalidateQueries({ queryKey: avatarKeys.owned(playerId, write.category) });
      void client.invalidateQueries({ queryKey: cobbleKeys.account(playerId) });
      // A refused price change, a sold-out or ended sale shows the item as it is now.
      void client.invalidateQueries({ queryKey: avatarKeys.items(write.category) });
    },
  });
  const pending = mutation.isPending ? mutation.variables : undefined;
  return {
    signer,
    buying: pending?.kind === "buy" ? { category: pending.category, id: pending.id } : null,
    saving: pending?.kind === "save",
    error: mutation.error,
    reset: () => mutation.reset(),
    buy: (category: number, id: number, price: number) => mutation.mutateAsync({ kind: "buy", category, id, price }),
    save: (look: bigint) => mutation.mutateAsync({ kind: "save", look }),
  };
}
