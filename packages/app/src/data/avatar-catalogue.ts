import { useMutation, useQueries, useQueryClient, type QueryClient, type UseQueryResult } from "@tanstack/react-query";
import type { AvatarItem, CobbleAccount, DecodedEvent, PavedWriter, WriteResult } from "@paved/chain";
import { avatarKeys, avatarViews, orNone } from "./avatar";
import { cobbleKeys, cobbleViews } from "./cobbles";
import { useDataSources, type DataSources } from "./sources";

// The avatar creator's data (#626 PR 2, #627): the catalogue with the player's items, look and balance, read from `Avatar`'s
// views and the ledger's `account`, and the two writes. A purchase (`buy_avatar_item`) and a save (`set_avatar`) go through
// the signer; their receipts' `AvatarItemBought` and `AvatarSet` go into the cache (`setQueryData`), then one
// `invalidateQueries` reconciles the reads they touched. The creator's chunk only: the menus read `avatar.ts`.

/** The two writes of the avatar: `PavedWriter`'s. */
export type AvatarSigner = Pick<PavedWriter, "address" | "buyAvatarItem" | "setAvatar">;

/** The signer's avatar writes, or null: no signer, or one without them (read only). */
export function avatarSigner(sources: Pick<DataSources, "signer">): AvatarSigner | null {
  const signer = sources.signer as (Partial<AvatarSigner> & { address: string }) | null | undefined;
  return signer && typeof signer.buyAvatarItem === "function" && typeof signer.setAvatar === "function" ? (signer as AvatarSigner) : null;
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
