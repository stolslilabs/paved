import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GameViews, WriteResult } from "@paved/chain";
import type { LayoutTile } from "@paved/game-core";
import { orNone } from "./avatar";
import { invalidateV2, type Result } from "./free-village-base";
import { queryKeys } from "./keys";
import { useDataSources, type DataSources } from "./sources";

// The saved village layouts (#804, PvP v2 step 1, MOCK-FIRST): 3 slots, the first free, the others bought with Cobbles, one
// active (its layout is the village, `freeVillage`'s). Read and written through the same `DataSources` as the village side;
// step 1 serves them from the mock ledger, step 3 (#742) gives `@paved/chain` the same interfaces. The rules are game-core's
// (`rules/layout-slots.ts`). The editor's stage reads them (its own chunk), never the home's first one.

/** A slot as the editor shows it. */
export interface LayoutSlotView {
  /** Its index, 0 to 2 (slot 1 is 0). */
  slot: number;
  /** The player's: the free slot, or one bought. */
  open: boolean;
  /** Its price in Cobbles (0 for the free one). */
  price: number;
  /** Its layout, the starter left out; null: empty (or locked). */
  tiles: LayoutTile[] | null;
  score: number;
  /** Its layout passes the rules against the stock and the slots today (a later rule might remove tiles: #804 open point 4). */
  fits: boolean;
}

export interface LayoutSlotsView {
  /** The active slot: its layout is the village. */
  active: number;
  slots: LayoutSlotView[];
}

/** The slots' read. */
export interface LayoutSlotViews {
  layoutSlots(playerId: string): Promise<LayoutSlotsView>;
}

/** A slot bought at the price the page showed (refused if it is not the slot's). */
export interface BuyLayoutSlotRequest {
  slot: number;
  confirmedPrice: number;
}

/** The slots' writes, for the connected account. */
export interface LayoutSlotWrites {
  /** Saves the layout into an open slot, checked as `layoutRefusal` checks it; into the active one, the village changes. */
  saveLayoutTo(slot: number, tiles: readonly LayoutTile[]): Promise<WriteResult>;
  /** Makes a saved slot's layout the village (checked again against the stock and the slots). */
  activateLayout(slot: number): Promise<WriteResult>;
  /** Buys a locked slot with Cobbles: it opens empty. */
  buyLayoutSlot(request: BuyLayoutSlotRequest): Promise<WriteResult>;
}

/** The sources' slots read, or null (the chain before step 3, or a views double without it). */
export function layoutSlotViews(views: GameViews): LayoutSlotViews | null {
  const v = views as GameViews & Partial<LayoutSlotViews>;
  return typeof v.layoutSlots === "function" ? (v as LayoutSlotViews) : null;
}

/** The signer's slots writes, or null: no signer, or one without them. */
export function layoutSlotSigner(sources: Pick<DataSources, "signer">): LayoutSlotWrites | null {
  const s = sources.signer as (Partial<LayoutSlotWrites> & { address: string }) | null | undefined;
  return s && typeof s.saveLayoutTo === "function" && typeof s.activateLayout === "function" && typeof s.buyLayoutSlot === "function" ? (s as LayoutSlotWrites) : null;
}

/** The player's layout slots: null where they are not served, disabled without a player. */
export function useLayoutSlots(playerId: string | null): Result<LayoutSlotsView> {
  const { views } = useDataSources();
  const read = layoutSlotViews(views);
  const query = useQuery({
    queryKey: queryKeys.chain.v2.layoutSlots(playerId ?? "0x0"),
    queryFn: () => orNone(() => read!.layoutSlots(playerId!)),
    enabled: read !== null && playerId !== null,
  });
  if (read === null || playerId === null) return { data: null, isPending: false, error: null };
  return { data: query.data, isPending: query.isPending && !query.error, error: query.error };
}

/** A slots write on its way: what it is for. */
export type LayoutSlotWrite =
  | { kind: "save-to"; slot: number; tiles: readonly LayoutTile[] }
  | { kind: "activate"; slot: number }
  | { kind: "buy-slot"; request: BuyLayoutSlotRequest };

/**
 * The slots' writes of the connected account. Each invalidates the village side once settled (the village, the slots, the
 * Cobbles). `pending` is the write on its way, `error` the last refusal (`V2RefusedError`) until `reset`; `signer` null: read only.
 */
export function useLayoutSlotWrites(playerId: string | null) {
  const sources = useDataSources();
  const signer = layoutSlotSigner(sources);
  const client = useQueryClient();
  const mutation = useMutation<WriteResult, Error, LayoutSlotWrite>({
    mutationFn: (write) => {
      if (!signer) return Promise.reject(new Error("Connect to build your village"));
      switch (write.kind) {
        case "save-to":
          return signer.saveLayoutTo(write.slot, write.tiles);
        case "activate":
          return signer.activateLayout(write.slot);
        case "buy-slot":
          return signer.buyLayoutSlot(write.request);
      }
    },
    onSettled: () => {
      if (playerId) invalidateV2(client, playerId);
    },
  });
  return {
    signer,
    pending: mutation.isPending ? mutation.variables : undefined,
    error: mutation.error,
    reset: () => mutation.reset(),
    saveTo: (slot: number, tiles: readonly LayoutTile[]) => mutation.mutateAsync({ kind: "save-to", slot, tiles }),
    activate: (slot: number) => mutation.mutateAsync({ kind: "activate", slot }),
    buy: (request: BuyLayoutSlotRequest) => mutation.mutateAsync({ kind: "buy-slot", request }),
  };
}
