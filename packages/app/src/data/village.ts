import { useMutation, useQueries, useQueryClient, type QueryClient, type UseQueryResult } from "@tanstack/react-query";
import type { DecodedEvent, GameViews, PavedWriter, RewardGrants, RewardOffer as ChainOffer, VillageCell, VillageInfo, VillageTile, VillageViews, WriteResult } from "@paved/chain";
import type { ParcelOffer } from "../components/containers/parcel-sheet";
import type { RewardOffer } from "../components/containers/reward-sheet";
import type { SkinTierGate } from "../components/containers/skin-grid";
import { TIERS, type Cell, type Village } from "../components/containers/village-rules";
import { orNone } from "./avatar";
import { cobbleKeys } from "./cobbles";
import { addressKey } from "./keys";
import { usePlayerProgress } from "./player-progress";
import { useDataSources, type DataSources } from "./sources";

// The village screen's data (#646 PR 2): a player's village (`Village`'s views, #640), their reward (`Rewards`' views, #642),
// their tiers and the skins reserved to one, read from the chain; and the four writes of the own village: found it, buy a
// parcel, open a reward, claim it (place a tile, add a copy, or take the Cobbles). A write's receipt events go into the cache
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
  /** `Village.max_cells()`. */
  maxCells: ["chain", "village", "maxCells"] as const,
  /** `Rewards.grants(player_id)`. */
  grants: (playerId: string) => ["chain", "village", "grants", addressKey(playerId)] as const,
  /** `Rewards.offer(player_id)`. */
  offer: (playerId: string) => ["chain", "village", "offer", addressKey(playerId)] as const,
  /** `Rewards.copies(player_id)`. */
  copies: (playerId: string) => ["chain", "village", "copies", addressKey(playerId)] as const,
  /** The 19 `Setup.skin_tier(theme, p)` of a theme. */
  skinTiers: (theme: number) => ["chain", "village", "skinTiers", theme] as const,
  /** Every read of the village. */
  all: ["chain", "village"] as const,
};

/** The sources' village views, or null (a views double without them). Probed as `skinViews` is. */
export function villageViews(views: GameViews): VillageViews | null {
  const v = views as GameViews & Partial<VillageViews>;
  return typeof v.village === "function" && typeof v.villageTiles === "function" && typeof v.rewardOffer === "function" && typeof v.planCopies === "function"
    ? (v as VillageViews)
    : null;
}

/** The village's writes: `PavedWriter`'s. */
export type VillageSigner = Pick<PavedWriter, "address" | "foundVillage" | "buyParcel" | "openReward" | "claimReward">;

/** The signer's village writes, or null: no signer, or one without them (read only). */
export function villageSigner(sources: Pick<DataSources, "signer">): VillageSigner | null {
  const signer = sources.signer as (Partial<VillageSigner> & { address: string }) | null | undefined;
  return signer && typeof signer.foundVillage === "function" && typeof signer.buyParcel === "function" && typeof signer.openReward === "function" && typeof signer.claimReward === "function"
    ? (signer as VillageSigner)
    : null;
}

/** The copies of each plan by chain plan id, from `Rewards.copies` (plan 1 first); the plans with none left out. */
export function copiesByPlan(copies: readonly number[]): Record<number, number> {
  const out: Record<number, number> = {};
  copies.forEach((n, i) => {
    if (n > 0) out[i + 1] = n;
  });
  return out;
}

/** The next parcel as the sheet shows it, from `Village.village`; null once the territory is full (`next_parcel` 0). */
export const parcelOf = (info: VillageInfo): ParcelOffer | null => (info.nextParcel === 0 ? null : { price: info.nextPrice, level: info.nextLevel });

/** A village as the screen shows it: its board, whether it is founded, its next parcel. */
export interface VillageData {
  /** The board. Not founded: the 3 x 3 of the start and the starter, what `found` gives. */
  village: Village;
  founded: boolean;
  /** The next parcel's price and level; null once full. */
  parcel: ParcelOffer | null;
}

type Result<T> = { data: T | null | undefined; isPending: boolean; error: Error | null };

/**
 * Any player's village (#646): `Village.village`, `cells`, `tiles` and `max_cells`, the copies of each plan (`Rewards.copies`),
 * and the player's level (`usePlayerProgress`, the parcels' gate). `owner` is the name the screen shows. Null on a network
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
      { queryKey: villageKeys.maxCells, queryFn: () => orNone(() => village!.villageMaxCells()), enabled },
      { queryKey: villageKeys.copies(id), queryFn: () => orNone(() => village!.planCopies(id)), enabled },
    ],
    combine: (results) => {
      const [info, cells, tiles, max, copies] = results as unknown as [
        UseQueryResult<VillageInfo | null>,
        UseQueryResult<VillageCell[] | null>,
        UseQueryResult<VillageTile[] | null>,
        UseQueryResult<number | null>,
        UseQueryResult<number[] | null>,
      ];
      return { info, cells, tiles, max, copies };
    },
  });
  if (playerId !== null && !enabled) return { data: null, isPending: false, error: null };
  const { info, cells, tiles, max, copies } = read;
  const error = info.error ?? cells.error ?? tiles.error ?? max.error ?? copies.error ?? progress.error ?? null;
  const all = [info, cells, tiles, max, copies];
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
        copies: copiesByPlan(copies.data!),
        score: info.data!.score,
        maxCells: max.data!,
      },
      founded,
      parcel: founded ? parcelOf(info.data!) : null,
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
 * The skins of a theme reserved to a tier (#642), by plan, as the shop shows them: the tier (`Setup.skin_tier`) and whether
 * the player's plan reached it (`Rewards.copies`). A skin with no tier is left out; a guest has reached none. Null on a network
 * without `Rewards`; `code` null reads nothing (a theme not out).
 */
export function useSkinTierGates(playerId: string | null, code: number | null): Result<Record<number, SkinTierGate>> {
  const { views } = useDataSources();
  const village = villageViews(views);
  const id = playerId ?? "0x0";
  return useQueries({
    queries: [
      { queryKey: villageKeys.skinTiers(code ?? 0), queryFn: () => orNone(() => village!.skinTiers(code!)), enabled: village !== null && code !== null },
      { queryKey: villageKeys.copies(id), queryFn: () => orNone(() => village!.planCopies(id)), enabled: village !== null && code !== null && playerId !== null },
    ],
    combine: ([tiers, copies]) => {
      if (village === null || code === null) return { data: null, isPending: false, error: null };
      const error = tiers.error ?? copies.error ?? null;
      if (tiers.data === null) return { data: null, isPending: false, error };
      const owned = playerId === null ? [] : copies.data;
      const ready = tiers.data !== undefined && owned !== undefined;
      return { data: ready ? tierGates(tiers.data!, owned ?? []) : undefined, isPending: !ready && !error, error };
    },
  });
}

/** The gates of a theme's 19 tiers (plan 1 first) against the player's copies (plan 1 first; none read: none). */
export function tierGates(tiers: readonly number[], copies: readonly number[]): Record<number, SkinTierGate> {
  const gates: Record<number, SkinTierGate> = {};
  tiers.forEach((tier, i) => {
    if (tier <= 0) return;
    const shown = Math.min(tier, TIERS.length - 1) as SkinTierGate["tier"];
    gates[i + 1] = { tier: shown, name: TIERS[shown].name, reached: chainTier(copies[i] ?? 0) >= tier };
  });
  return gates;
}

/** The chain's tier of `copies` copies (`tier_of`: 0 under 2, then `floor(log2(copies))`), past the tiers the client names too. */
export function chainTier(copies: number): number {
  let tier = 0;
  for (let left = copies; left >= 2; left = Math.floor(left / 2)) tier += 1;
  return tier;
}

/**
 * A village write's receipt into the cache: `RewardOpened` sets the offer; `RewardClaimed` clears it and sets the plan's
 * copies. Everything else (the cells, the tiles, the score, the Cobbles) is left to the reconciling reads.
 */
export function applyVillageEvents(client: QueryClient, playerId: string, events: readonly DecodedEvent[]): void {
  for (const { name, fields } of events) {
    if (name === "RewardOpened") {
      const opened: ChainOffer = { index: Number(fields.index), plans: [Number(fields.plan1), Number(fields.plan2), Number(fields.plan3)] };
      client.setQueryData<ChainOffer | null>(villageKeys.offer(playerId), () => opened);
    } else if (name === "RewardClaimed") {
      client.setQueryData<ChainOffer | null>(villageKeys.offer(playerId), (o) => (o ? { index: o.index, plans: [0, 0, 0] } : o));
      const plan = Number(fields.plan);
      if (plan >= 1) {
        client.setQueryData<number[] | null>(villageKeys.copies(playerId), (c) => (c ? c.map((n, i) => (i === plan - 1 ? Number(fields.copies) : n)) : c));
      }
    }
  }
}

/** A write of the own village on its way: what it is for. */
export type VillageWrite =
  | { kind: "found" }
  | { kind: "parcel"; cell: Cell; price: number }
  | { kind: "open" }
  | { kind: "place"; slot: number; orientation: number; cell: Cell }
  | { kind: "merge"; slot: number }
  | { kind: "cobbles" };

/**
 * The village writes of the connected account (#646): `found`, `buyParcel(cell, price)` (at the price the sheet showed: the
 * writer reads it again inside its send and refuses another), `open` (a pending reward's 3 tiles, drawn on the VRF), and the
 * claim of the open offer: `place(slot, orientation, cell)`, `merge(slot)` or `cobbles()`. Each puts its receipt's events
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
        case "parcel":
          return signer.buyParcel({ cell: write.cell, confirmedPrice: write.price }, views);
        case "open":
          return signer.openReward(views);
        case "place":
          return signer.claimReward({ choice: "place", slot: write.slot, orientation: write.orientation, cell: write.cell });
        case "merge":
          return signer.claimReward({ choice: "merge", slot: write.slot });
        case "cobbles":
          return signer.claimReward({ choice: "cobbles" });
      }
    },
    onSuccess: ({ events }) => {
      if (playerId) applyVillageEvents(client, playerId, events);
    },
    onSettled: () => {
      if (!playerId) return;
      for (const key of [villageKeys.info, villageKeys.cells, villageKeys.tiles, villageKeys.grants, villageKeys.offer, villageKeys.copies]) {
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
    buyParcel: (cell: Cell, price: number) => mutation.mutateAsync({ kind: "parcel", cell, price }),
    open: () => mutation.mutateAsync({ kind: "open" }),
    place: (slot: number, orientation: number, cell: Cell) => mutation.mutateAsync({ kind: "place", slot, orientation, cell }),
    merge: (slot: number) => mutation.mutateAsync({ kind: "merge", slot }),
    cobbles: () => mutation.mutateAsync({ kind: "cobbles" }),
  };
}
