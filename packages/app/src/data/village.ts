import { useMutation, useQueries, useQueryClient, type QueryClient, type UseQueryResult } from "@tanstack/react-query";
import type { DecodedEvent, GameViews, PavedWriter, RewardGrants, RewardOffer as ChainOffer, VillageCell, VillageInfo, VillageTile, VillageViews, WriteResult } from "@paved/chain";
import type { RewardOffer } from "../components/containers/reward-sheet";
import type { Cell, Village } from "../components/containers/village-rules";
import { orNone } from "./avatar";
import { cobbleKeys } from "./cobbles";
import { addressKey } from "./keys";
import { usePlayerProgress } from "./player-progress";
import { useDataSources, type DataSources } from "./sources";

// The village screen's data (#646 PR 2): a player's village (`Village`'s views, #640) and their reward (`Rewards`' views, #642),
// read from the chain; and the three writes of the own village: found it, open a reward, claim it (place a tile, or take the
// Cobbles). The parcels, the copies and the tiers left the client with v2 (#739): the contracts still hold them until #733 and
// #736, the client no longer reads or writes them. A write's receipt events go into the cache
// (`setQueryData`), then one `invalidateQueries` reconciles the reads it touched. Nothing polls. A network without `Village`
// or `Rewards` answers null (their views are `not-configured`): no village there yet. Values are the chain's, as literals
// (a value import of `@paved/chain` would bring starknet.js into the page's chunk; a test checks they agree).

/** The Cobbles of "take Cobbles" (`@paved/chain`'s `REWARD_COBBLES`, rule B of #642). */
export const REWARD_COBBLES = 5;

/** The starter `Village.found` writes at (0, 0): `RFFFRFCFR` (plan 9) facing South (orientation 3). */
export const STARTER = { id: 1, plan: 9, orientation: 3, x: 0, y: 0 } as const;

/** The 9 cells of the start, as `Village.cells` lists them (game-core's `startTerritory`). */
export const START_CELLS: readonly Cell[] = [-1, 0, 1].flatMap((y) => [-1, 0, 1].map((x) => ({ x, y })));

/** The keys of the village's reads, `[domain, read, ...args]` as `keys.ts`'s. Read from the chain. */
export const villageKeys = {
  /** `Village.village(player_id)`. */
  info: (playerId: string) => ["chain", "village", "info", addressKey(playerId)] as const,
  /** `Village.cells(player_id)`. */
  cells: (playerId: string) => ["chain", "village", "cells", addressKey(playerId)] as const,
  /** `Village.tiles(player_id)`. */
  tiles: (playerId: string) => ["chain", "village", "tiles", addressKey(playerId)] as const,
  /** `Rewards.grants(player_id)`. */
  grants: (playerId: string) => ["chain", "village", "grants", addressKey(playerId)] as const,
  /** `Rewards.offer(player_id)`. */
  offer: (playerId: string) => ["chain", "village", "offer", addressKey(playerId)] as const,
  /** Every read of the village. */
  all: ["chain", "village"] as const,
};

/** The sources' village views, or null (a views double without them). Probed as `skinViews` is. */
export function villageViews(views: GameViews): VillageViews | null {
  const v = views as GameViews & Partial<VillageViews>;
  return typeof v.village === "function" && typeof v.villageTiles === "function" && typeof v.rewardOffer === "function"
    ? (v as VillageViews)
    : null;
}

/** The village's writes: `PavedWriter`'s. */
export type VillageSigner = Pick<PavedWriter, "address" | "foundVillage" | "openReward" | "claimReward">;

/** The signer's village writes, or null: no signer, or one without them (read only). */
export function villageSigner(sources: Pick<DataSources, "signer">): VillageSigner | null {
  const signer = sources.signer as (Partial<VillageSigner> & { address: string }) | null | undefined;
  return signer && typeof signer.foundVillage === "function" && typeof signer.openReward === "function" && typeof signer.claimReward === "function"
    ? (signer as VillageSigner)
    : null;
}

/** A village as the screen shows it: its board, whether it is founded. */
export interface VillageData {
  /** The board. Not founded: the 3 x 3 of the start and the starter, what `found` gives. */
  village: Village;
  founded: boolean;
}

type Result<T> = { data: T | null | undefined; isPending: boolean; error: Error | null };

/**
 * Any player's village (#646): `Village.village`, `cells` and `tiles`, and the player's level (`usePlayerProgress`). `owner` is the name the screen shows. Null on a network
 * without `Village` or `Rewards`; disabled without a player.
 */
export function useVillage(playerId: string | null, owner: string): Result<VillageData> {
  const { views } = useDataSources();
  const village = villageViews(views);
  const id = playerId ?? "0x0";
  const enabled = playerId !== null && village !== null;
  const progress = usePlayerProgress(playerId);
  const read = useQueries({
    queries: [
      { queryKey: villageKeys.info(id), queryFn: () => orNone(() => village!.village(id)), enabled },
      { queryKey: villageKeys.cells(id), queryFn: () => orNone(() => village!.villageCells(id)), enabled },
      { queryKey: villageKeys.tiles(id), queryFn: () => orNone(() => village!.villageTiles(id)), enabled },
    ],
    combine: (results) => {
      const [info, cells, tiles] = results as unknown as [UseQueryResult<VillageInfo | null>, UseQueryResult<VillageCell[] | null>, UseQueryResult<VillageTile[] | null>];
      return { info, cells, tiles };
    },
  });
  if (playerId !== null && !enabled) return { data: null, isPending: false, error: null };
  const { info, cells, tiles } = read;
  const error = info.error ?? cells.error ?? tiles.error ?? progress.error ?? null;
  const all = [info, cells, tiles];
  if (all.some((r) => r.data === null)) return { data: null, isPending: false, error };
  const ready = all.every((r) => r.data !== undefined) && progress.data !== undefined;
  // A failed read ends the wait: pending only while nothing failed.
  if (!ready) return { data: undefined, isPending: !error, error };
  const founded = info.data!.gameId !== 0;
  return {
    data: {
      village: {
        owner,
        level: progress.data?.level ?? 1,
        cells: founded ? cells.data! : START_CELLS,
        tiles: founded ? tiles.data! : [{ ...STARTER }],
        score: info.data!.score,
      },
      founded,
    },
    isPending: false,
    error,
  };
}

/** The player's reward: the open offer (its 3 tiles and the Cobbles instead), else null, and the rewards waiting to be opened. */
export interface VillageReward {
  offer: RewardOffer | null;
  /** The rewards granted and not opened yet (`grants.pending`): one opens when no offer is open. */
  pending: number;
}

/** The offer as the reward sheet shows it, or null when none is open. */
export const rewardOfferOf = (offer: ChainOffer): RewardOffer | null => (offer.plans[0] === 0 ? null : { plans: [...offer.plans], cobbles: REWARD_COBBLES });

/** The player's reward (#642): `Rewards.offer` and `grants`. Null on a network without `Rewards`; disabled without a player. */
export function useVillageReward(playerId: string | null): Result<VillageReward> {
  const { views } = useDataSources();
  const village = villageViews(views);
  const id = playerId ?? "0x0";
  const enabled = playerId !== null && village !== null;
  return useQueries({
    queries: [
      { queryKey: villageKeys.offer(id), queryFn: () => orNone(() => village!.rewardOffer(id)), enabled },
      { queryKey: villageKeys.grants(id), queryFn: () => orNone(() => village!.rewardGrants(id)), enabled },
    ],
    combine: ([offer, grants]) => {
      if (playerId !== null && !enabled) return { data: null, isPending: false, error: null };
      const error = offer.error ?? grants.error ?? null;
      if (offer.data === null || grants.data === null) return { data: null, isPending: false, error };
      const ready = offer.data !== undefined && grants.data !== undefined;
      return {
        data: ready ? { offer: rewardOfferOf(offer.data!), pending: (grants.data as RewardGrants).pending } : undefined,
        isPending: !ready && !error,
        error,
      };
    },
  });
}

/**
 * A village write's receipt into the cache: `RewardOpened` sets the offer; `RewardClaimed` clears it. Everything else (the cells, the tiles, the score, the Cobbles) is left to the reconciling reads.
 */
export function applyVillageEvents(client: QueryClient, playerId: string, events: readonly DecodedEvent[]): void {
  for (const { name, fields } of events) {
    if (name === "RewardOpened") {
      const opened: ChainOffer = { index: Number(fields.index), plans: [Number(fields.plan1), Number(fields.plan2), Number(fields.plan3)] };
      client.setQueryData<ChainOffer | null>(villageKeys.offer(playerId), () => opened);
    } else if (name === "RewardClaimed") {
      client.setQueryData<ChainOffer | null>(villageKeys.offer(playerId), (o) => (o ? { index: o.index, plans: [0, 0, 0] } : o));
    }
  }
}

/** A write of the own village on its way: what it is for. */
export type VillageWrite =
  | { kind: "found" }
  | { kind: "open" }
  | { kind: "place"; slot: number; orientation: number; cell: Cell }
  | { kind: "cobbles" };

/**
 * The village writes of the connected account (#646): `found`, `open` (a pending reward's 3 tiles, drawn on the VRF), and the
 * claim of the open offer: `place(slot, orientation, cell)` or `cobbles()` (the parcels and the copies left with v2, #739). Each puts its receipt's events
 * into the cache and invalidates the player's village reads and their Cobbles, after a refusal too. `pending` is the write on
 * its way, `error` the last refusal (`VillageRefusedError` or another `WriteError`) until `reset`. `signer` is null without a
 * signer that writes the village: read only.
 */
export function useVillageWrites(playerId: string | null) {
  const sources = useDataSources();
  const signer = villageSigner(sources);
  const client = useQueryClient();
  const mutation = useMutation<WriteResult, Error, VillageWrite>({
    mutationFn: (write) => {
      if (!signer) return Promise.reject(new Error("Connect to build your village"));
      const views = villageViews(sources.views);
      if (!views) return Promise.reject(new Error("The village cannot be read on this network: nothing was sent"));
      switch (write.kind) {
        case "found":
          return signer.foundVillage();
        case "open":
          return signer.openReward(views);
        case "place":
          return signer.claimReward({ choice: "place", slot: write.slot, orientation: write.orientation, cell: write.cell });
        case "cobbles":
          return signer.claimReward({ choice: "cobbles" });
      }
    },
    onSuccess: ({ events }) => {
      if (playerId) applyVillageEvents(client, playerId, events);
    },
    onSettled: () => {
      if (!playerId) return;
      for (const key of [villageKeys.info, villageKeys.cells, villageKeys.tiles, villageKeys.grants, villageKeys.offer]) {
        void client.invalidateQueries({ queryKey: key(playerId) });
      }
      void client.invalidateQueries({ queryKey: cobbleKeys.account(playerId) });
    },
  });
  return {
    signer,
    pending: mutation.isPending ? mutation.variables : undefined,
    /** The last write that landed, until the next one or `reset`. */
    done: mutation.isSuccess ? mutation.variables : undefined,
    error: mutation.error,
    reset: () => mutation.reset(),
    found: () => mutation.mutateAsync({ kind: "found" }),
    open: () => mutation.mutateAsync({ kind: "open" }),
    place: (slot: number, orientation: number, cell: Cell) => mutation.mutateAsync({ kind: "place", slot, orientation, cell }),
    cobbles: () => mutation.mutateAsync({ kind: "cobbles" }),
  };
}
