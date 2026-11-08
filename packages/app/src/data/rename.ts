import { useMutation, useQueries, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { CobbleAccount, DecodedEvent, GameViews, NameViews, PavedWriter, WriteResult } from "@paved/chain";
import { avatarKeys, orNone } from "./avatar";
import { addressKey } from "./keys";
import { cobbleKeys, cobbleViews } from "./cobbles";
import { useDataSources, type DataSources } from "./sources";

// The player's name (PLAYER-RENAME, `docs/architecture/avatar-chain.md`, "The name"): what the profile's name view reads (the name
// set on chain, the changes made, the rename price and the Cobbles) and its one write, `Avatar.rename` through the signer. Its
// receipt's `Renamed` goes into the cache (`setQueryData`), then the reads it touched are invalidated, the indexer's and the
// social source's too: every list that shows a name reads it again. The profile sheet's chunk only: the menus read `avatar.ts`.

/** The keys of the name view's reads beside the name (`avatarKeys.name`, the menus'), `[domain, read, ...args]` as `keys.ts`'s. */
export const renameKeys = {
  /** `renames(player_id)`: the changes the player has made. */
  renames: (playerId: string) => ["chain", "avatar", "renames", addressKey(playerId)] as const,
  /** `rename_price()`. */
  price: ["chain", "avatar", "renamePrice"] as const,
};

/** The sources' name views (PLAYER-RENAME), or null (a views double without them). Probed as `avatarViews` is. */
export function nameViews(views: GameViews): NameViews | null {
  const v = views as GameViews & Partial<NameViews>;
  return typeof v.playerName === "function" && typeof v.renameCount === "function" && typeof v.renamePrice === "function" && typeof v.nameOwner === "function"
    ? (v as NameViews)
    : null;
}

/** The rename write: `PavedWriter`'s. */
export type RenameSigner = Pick<PavedWriter, "address" | "rename">;

/** The signer's rename, or null: no signer, or one without it (read only). */
export function renameSigner(sources: Pick<DataSources, "signer">): RenameSigner | null {
  const signer = sources.signer as (Partial<RenameSigner> & { address: string }) | null | undefined;
  return signer && typeof signer.rename === "function" ? (signer as RenameSigner) : null;
}

/** What the name view reads: the name set on chain (null: none), the changes made, the rename price, the next change's cost and the Cobbles. */
export interface RenameData {
  name: string | null;
  count: number;
  price: number;
  /** The next change's cost in Cobbles: 0 for the first (free), else the rename price. */
  cost: number;
  balance: number;
}

/**
 * The name view's reads (PLAYER-RENAME): `name`, `renames` and `rename_price` on `Avatar`, and the ledger's `account` for the
 * Cobbles. Null on a network without `Avatar` or without the ledger; disabled without a player. A failed read ends the wait;
 * `refetch` reads the failed ones again (the view's Retry, once the query client's own retry is spent).
 */
export function useRename(playerId: string | null): { data: RenameData | null | undefined; isPending: boolean; error: Error | null; refetch: () => void } {
  const { views } = useDataSources();
  const names = nameViews(views);
  const ledger = cobbleViews(views);
  const id = playerId ?? "0x0";
  const enabled = playerId !== null && names !== null && ledger !== null;
  return useQueries({
    queries: [
      { queryKey: avatarKeys.name(id), queryFn: () => orNone(() => names!.playerName(id)), enabled },
      { queryKey: renameKeys.renames(id), queryFn: () => orNone(() => names!.renameCount(id)), enabled },
      { queryKey: renameKeys.price, queryFn: () => orNone(() => names!.renamePrice()), enabled },
      { queryKey: cobbleKeys.account(id), queryFn: () => (ledger ? ledger.account(id) : null), enabled },
    ],
    combine: ([name, count, price, account]) => {
      if (playerId !== null && !enabled) return { data: null, isPending: false, error: null, refetch: () => undefined };
      const ready = name.data !== undefined && count.data !== undefined && price.data !== undefined && account.data !== undefined;
      const error = name.error ?? count.error ?? price.error ?? account.error ?? null;
      let data: RenameData | null | undefined;
      if (ready) {
        // No `Avatar` (`orNone`) or no ledger: nothing to rename with.
        data =
          count.data === null || price.data === null || account.data === null
            ? null
            : { name: name.data, count: count.data, price: price.data, cost: count.data === 0 ? 0 : price.data, balance: account.data.cobbles };
      }
      const refetch = () => void Promise.all([name, count, price, account].filter((q) => q.isError).map((q) => q.refetch()));
      return { data, isPending: !ready && !error, error, refetch };
    },
  });
}

/**
 * A rename's receipt into the cache: `Renamed` sets the name sent (its felt is that name's short string) and the count,
 * `CobblesSpent` (a paid change) the balance after it. Reads not in the cache are left to the reconciling read.
 */
export function applyRenameEvents(client: QueryClient, playerId: string, sent: string, events: readonly DecodedEvent[]): void {
  for (const { name, fields } of events) {
    if (name === "Renamed") {
      client.setQueryData<string | null>(avatarKeys.name(playerId), sent);
      client.setQueryData<number | null>(renameKeys.renames(playerId), Number(fields.count));
    } else if (name === "CobblesSpent") {
      client.setQueryData<CobbleAccount | null>(cobbleKeys.account(playerId), (a) => (a ? { ...a, cobbles: Number(fields.balance) } : a));
    }
  }
}

/** What the chain's `RenameRefusedError` says of a name taken (`RENAME_REFUSAL_TEXT.taken`; a test keeps them equal). */
export const NAME_TAKEN_TEXT = "This name is taken: pick another one. Nothing was changed.";

/**
 * A name another player holds by the indexer, refused before anything is sent: shaped as the chain's `RenameRefusedError` (its
 * `reason`, its text), without a value of the chain in this chunk.
 */
export class NameTakenError extends Error {
  readonly reason = "taken";
  constructor() {
    super(NAME_TAKEN_TEXT);
    this.name = "RenameRefusedError";
  }
}

/**
 * Whether another player holds `name` by the indexer (PLAYER-RENAME, `/v1/names/{name}`): a name set on chain, or a Cartridge
 * username the chain cannot read. Unknown (an indexer down, or one before the route) is not taken: the chain still refuses a name
 * another player set on it.
 */
async function takenOnIndexer(sources: Pick<DataSources, "indexer">, name: string, self: string): Promise<boolean> {
  try {
    const holder = (await sources.indexer.nameHolder(name)).data.playerId;
    return holder !== null && addressKey(holder) !== addressKey(self);
  } catch {
    return false;
  }
}

/** Every read that shows a player's name, which a rename makes stale: the indexer's lists and profiles, and the social source's. */
const NAMED_READS = [["indexer"], ["social"]] as const;

/**
 * The connected account's rename (PLAYER-RENAME): `rename(name, cost)`, one `Avatar.rename` at the cost the view showed (the writer
 * reads the count, the price, the name's holder and the current name again inside its send, and refuses with a
 * `RenameRefusedError`: taken, the same name, another price). Its receipt goes into the cache, then the name, the count, the
 * Cobbles and every read that shows names are invalidated, after a refusal too. `pending` while it is on its way, `done` the name
 * set by the last success, `error` the last refusal (`RenameRefusedError` or another `WriteError`) until `reset`. `signer` is null
 * without a signer that renames: read only.
 */
export function useRenameWrite(playerId: string | null) {
  const sources = useDataSources();
  const signer = renameSigner(sources);
  const client = useQueryClient();
  const mutation = useMutation<WriteResult, Error, { name: string; cost: number }>({
    mutationFn: async ({ name, cost }) => {
      if (!signer) throw new Error("No account to rename: nothing was sent");
      const names = nameViews(sources.views);
      if (!names) throw new Error("The names cannot be read on this network: nothing was sent");
      // A Cartridge username is another player's name too, which the chain cannot read: the indexer tells it, before anything is sent.
      if (await takenOnIndexer(sources, name, signer.address)) throw new NameTakenError();
      return signer.rename({ name, confirmedPrice: cost }, names);
    },
    onSuccess: ({ events }, { name }) => {
      if (playerId) applyRenameEvents(client, playerId, name, events);
    },
    onSettled: () => {
      if (!playerId) return;
      void client.invalidateQueries({ queryKey: avatarKeys.name(playerId) });
      void client.invalidateQueries({ queryKey: renameKeys.renames(playerId) });
      void client.invalidateQueries({ queryKey: renameKeys.price });
      void client.invalidateQueries({ queryKey: cobbleKeys.account(playerId) });
      for (const queryKey of NAMED_READS) void client.invalidateQueries({ queryKey });
    },
  });
  return {
    signer,
    pending: mutation.isPending,
    done: mutation.isSuccess ? mutation.variables.name : null,
    error: mutation.error,
    reset: () => mutation.reset(),
    rename: (name: string, cost: number) => mutation.mutateAsync({ name, cost }),
  };
}
