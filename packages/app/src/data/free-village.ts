import { useMutation, useQueries, useQuery, useQueryClient, type QueryClient, type UseQueryResult } from "@tanstack/react-query";
import type { GameViews, WriteResult } from "@paved/chain";
import { freeInventory, type ChestRank, type LayoutRefusal, type LayoutTile, type ShopOffer } from "@paved/game-core";
import { orNone } from "./avatar";
import { cobbleKeys } from "./cobbles";
import { queryKeys } from "./keys";
import { pvpKeys } from "./pvp";
import { useDataSources, type DataSources } from "./sources";

// PvP v2's village side (#741, step 1 of #732): the free village (the layout, its score, the level and slots), the inventory,
// the chests and the daily shop, read and written through the same `DataSources` as every other hook. Step 1 serves them from
// the mock ledger (`data/mock/ledger.ts`, MOCK-FIRST); step 3 (#742) gives `@paved/chain` the same interfaces, and these hooks
// and the screens (#739) stay as they are. The rules are game-core's (`packages/game-core/src/rules`). Values only from
// game-core: a value import of `@paved/chain` would bring starknet.js into the page's chunk.

/** A player's village as `freeVillage` answers it: the layout (the starter left out), its score, the level and its slots. */
export interface FreeVillageView {
  /** Founded: the starter layout was laid out (`foundFreeVillage`). Not founded, `tiles` is empty and `score` 0. */
  founded: boolean;
  xp: number;
  level: number;
  slots: number;
  tiles: LayoutTile[];
  score: number;
}

/** A chest opened: the tiles shown (1, 2 or 3 by rank, one to take) and the Cobbles it held. */
export interface OpenChest {
  rank: ChestRank;
  plans: number[];
  cobbles: number;
}

/** A player's chests: those waiting to be opened (oldest first), the one open, the PvP chests of the day and the cap. */
export interface ChestsView {
  pending: ChestRank[];
  open: OpenChest | null;
  pvpToday: number;
  pvpCap: number;
}

/** The shop of a day: its 3 offers, each with whether the player bought it, and when it ends (seconds). */
export interface ShopView {
  day: number;
  endsAt: number;
  offers: (ShopOffer & { bought: boolean })[];
}

/** The reads of the village side. */
export interface FreeVillageViews {
  /** Any player's village, a rival's too. */
  freeVillage(playerId: string): Promise<FreeVillageView>;
  /** The tiles the player holds, placed or not: `inventory[plan - 1]` copies of each of the 19 plans. */
  inventory(playerId: string): Promise<number[]>;
  chests(playerId: string): Promise<ChestsView>;
  /** The shop of `day` (days from the epoch, UTC) for the player. */
  shop(playerId: string, day: number): Promise<ShopView>;
}

/** A purchase in the shop, at the price the page showed (refused if it is not the offer's). */
export interface BuyTileRequest {
  day: number;
  slot: number;
  confirmedPrice: number;
}

/** A Story level finished (the Story game's report): its campaign, its place in it (from 1) and the stars. */
export interface StoryReport {
  campaign: number;
  level: number;
  stars: number;
}

/** The writes of the village side, for the connected account. */
export interface FreeVillageWrites {
  /** Founds the village: the starter layout picked by the address, its 8 tiles into the inventory. */
  foundFreeVillage(): Promise<WriteResult>;
  /** Saves the whole layout at once (the editor's draft), checked as `layoutRefusal` checks it. */
  saveLayout(tiles: readonly LayoutTile[]): Promise<WriteResult>;
  /** Opens the oldest chest waiting: its tiles drawn, its Cobbles credited when they drop. */
  openChest(): Promise<WriteResult>;
  /** Takes tile `slot` of the open chest into the inventory. */
  claimChest(slot: number): Promise<WriteResult>;
  buyTile(request: BuyTileRequest): Promise<WriteResult>;
  /** Credits a Story run: 5 XP per star earned the first time, a chest on 3 stars the first time. */
  reportStory(report: StoryReport): Promise<WriteResult>;
}

/** Why a v2 write is refused. */
export type V2Refusal =
  | LayoutRefusal
  | "founded"
  | "no-village"
  | "no-chest"
  | "chest-open"
  | "no-open-chest"
  | "not-a-slot"
  | "shop-closed"
  | "bought"
  | "price-changed"
  | "not-enough-cobbles"
  | "no-level"
  | "not-joined"
  | "attack-open"
  | "attack-started"
  | "no-attack"
  | "nothing-drawn"
  | "opponent-drawn"
  | "opponent-shielded"
  | "no-opponent"
  | "cannot-place";

/** A v2 write the rules refused: its reason, and the receipt's hash when it was sent. */
export class V2RefusedError extends Error {
  constructor(
    readonly reason: V2Refusal,
    readonly transactionHash?: string,
  ) {
    super(`Refused: ${reason}`);
    this.name = "V2RefusedError";
  }
}

/** The sources' village-side views, or null (the chain before step 3, or a views double without them). */
export function freeVillageViews(views: GameViews): FreeVillageViews | null {
  const v = views as GameViews & Partial<FreeVillageViews>;
  return typeof v.freeVillage === "function" && typeof v.inventory === "function" && typeof v.chests === "function" && typeof v.shop === "function"
    ? (v as FreeVillageViews)
    : null;
}

/** The signer's village-side writes, or null: no signer, or one without them (read only). */
export function freeVillageSigner(sources: Pick<DataSources, "signer">): FreeVillageWrites | null {
  const s = sources.signer as (Partial<FreeVillageWrites> & { address: string }) | null | undefined;
  return s && typeof s.foundFreeVillage === "function" && typeof s.saveLayout === "function" && typeof s.openChest === "function" && typeof s.buyTile === "function"
    ? (s as FreeVillageWrites)
    : null;
}

type Result<T> = { data: T | null | undefined; isPending: boolean; error: Error | null };

/** A village with its inventory: what the editor and the village screen show. */
export interface FreeVillageData extends FreeVillageView {
  inventory: number[];
  /** The inventory's tiles not placed, by plan. */
  free: number[];
}

/**
 * A player's village and inventory (#739's screens): `freeVillage` and `inventory` joined. Null where they are not served (the
 * chain before step 3); disabled without a player.
 */
export function useFreeVillage(playerId: string | null): Result<FreeVillageData> {
  const { views } = useDataSources();
  const v2 = freeVillageViews(views);
  const id = playerId ?? "0x0";
  const enabled = playerId !== null && v2 !== null;
  return useQueries({
    queries: [
      { queryKey: queryKeys.chain.v2.village(id), queryFn: () => orNone(() => v2!.freeVillage(id)), enabled },
      { queryKey: queryKeys.chain.v2.inventory(id), queryFn: () => orNone(() => v2!.inventory(id)), enabled },
    ],
    combine: (results) => {
      const [village, inventory] = results as unknown as [UseQueryResult<FreeVillageView | null>, UseQueryResult<number[] | null>];
      if (playerId === null || !enabled) return { data: null, isPending: false, error: null };
      const error = village.error ?? inventory.error ?? null;
      if (village.data === null || inventory.data === null) return { data: null, isPending: false, error };
      const ready = village.data !== undefined && inventory.data !== undefined;
      if (!ready) return { data: undefined, isPending: !error, error };
      return { data: { ...village.data!, inventory: inventory.data!, free: freeInventory(inventory.data!, village.data!.tiles) }, isPending: false, error };
    },
  });
}

/** Any one read of the village side as a hook: null where it is not served, disabled without `enabled`. */
function useV2Read<T>(key: readonly unknown[], read: ((v2: FreeVillageViews) => Promise<T>) | null): Result<T> {
  const { views } = useDataSources();
  const v2 = freeVillageViews(views);
  const query = useQuery({ queryKey: key, queryFn: () => orNone(() => read!(v2!)), enabled: v2 !== null && read !== null });
  if (v2 === null || read === null) return { data: null, isPending: false, error: null };
  return { data: query.data, isPending: query.isPending && !query.error, error: query.error };
}

/** The player's chests: those waiting, the one open, the day's PvP chests and the cap. */
export function useChests(playerId: string | null): Result<ChestsView> {
  return useV2Read(queryKeys.chain.v2.chests(playerId ?? "0x0"), playerId === null ? null : (v2) => v2.chests(playerId));
}

/** The shop of `day` (the page's clock, `useChainClock`, in days) for the player. */
export function useShop(playerId: string | null, day: number): Result<ShopView> {
  return useV2Read(queryKeys.chain.v2.shop(playerId ?? "0x0", day), playerId === null ? null : (v2) => v2.shop(playerId, day));
}

/** What a write of the village side touches: the v2 reads, the Cobbles, the level (the ring), the league (a chest's boost). */
export function invalidateV2(client: QueryClient, playerId: string): void {
  void client.invalidateQueries({ queryKey: queryKeys.chain.v2.all });
  void client.invalidateQueries({ queryKey: cobbleKeys.account(playerId) });
  void client.invalidateQueries({ queryKey: queryKeys.chain.playerLevel(playerId) });
  void client.invalidateQueries({ queryKey: pvpKeys.league(playerId) });
}

/** A write of the village side on its way: what it is for. */
export type FreeVillageWrite =
  | { kind: "found" }
  | { kind: "save"; tiles: readonly LayoutTile[] }
  | { kind: "open" }
  | { kind: "claim"; slot: number }
  | { kind: "buy"; request: BuyTileRequest }
  | { kind: "story"; report: StoryReport };

/**
 * The village-side writes of the connected account: found, save the layout, open and claim a chest, buy from the shop, report a
 * Story run. Each invalidates the reads it touches once settled (a refusal too). `pending` is the write on its way, `error`
 * the last refusal (`V2RefusedError`) until `reset`. `signer` is null without a signer that writes them: read only.
 */
export function useFreeVillageWrites(playerId: string | null) {
  const sources = useDataSources();
  const signer = freeVillageSigner(sources);
  const client = useQueryClient();
  const mutation = useMutation<WriteResult, Error, FreeVillageWrite>({
    mutationFn: (write) => {
      if (!signer) return Promise.reject(new Error("Connect to build your village"));
      switch (write.kind) {
        case "found":
          return signer.foundFreeVillage();
        case "save":
          return signer.saveLayout(write.tiles);
        case "open":
          return signer.openChest();
        case "claim":
          return signer.claimChest(write.slot);
        case "buy":
          return signer.buyTile(write.request);
        case "story":
          return signer.reportStory(write.report);
      }
    },
    onSettled: () => {
      if (playerId) invalidateV2(client, playerId);
    },
  });
  return {
    signer,
    pending: mutation.isPending ? mutation.variables : undefined,
    /** The last write that landed and its receipt, until the next one or `reset`. */
    done: mutation.isSuccess ? { write: mutation.variables, receipt: mutation.data } : undefined,
    error: mutation.error,
    reset: () => mutation.reset(),
    found: () => mutation.mutateAsync({ kind: "found" }),
    save: (tiles: readonly LayoutTile[]) => mutation.mutateAsync({ kind: "save", tiles }),
    openChest: () => mutation.mutateAsync({ kind: "open" }),
    claimChest: (slot: number) => mutation.mutateAsync({ kind: "claim", slot }),
    buy: (request: BuyTileRequest) => mutation.mutateAsync({ kind: "buy", request }),
    reportStory: (report: StoryReport) => mutation.mutateAsync({ kind: "story", report }),
  };
}
