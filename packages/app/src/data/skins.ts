import { useMutation, useQueries, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { CobbleAccount, DecodedEvent, GameViews, PavedWriter, SkinChange, SkinViews, WriteResult } from "@paved/chain";
import { PLANS } from "../components/containers/cobble-types";
import type { ThemeId } from "../components/containers/theme-card";
import type { ThemeSkinsData } from "../components/scenes/theme-scene";
import { cobbleKeys, cobbleViews } from "./cobbles";
import { createDeviceStore, useDeviceStore } from "./device-store";
import { addressKey } from "./keys";
import { useDataSources, type DataSources } from "./sources";

// The tile skins of `Setup` (P11b; cobbles v1, part 3, CORE #463): a theme's 19 prices, the player's owned skins in it and
// the active set, read from the chain's views (`SkinViews`), the balance from the ledger's `account`. A purchase
// (`buy_skin`) and a saved batch of switches (`set_skins`) go through the signer; their receipts' `SkinBought` and
// `SkinsActivated` go into the cache (`setQueryData`), then one `invalidateQueries` reconciles the reads they touched.
// Nothing polls.

/** The keys of the skins' reads, `[domain, read, ...args]` as `keys.ts`'s and `cobbles.ts`'s. Read from the chain, as the ledger is. */
export const skinKeys = {
  /** The 19 `skin_price(theme, p)` of a theme. */
  prices: (theme: number) => ["chain", "skins", "prices", theme] as const,
  /** `skins(player_id, theme)`. */
  owned: (playerId: string, theme: number) => ["chain", "skins", "owned", addressKey(playerId), theme] as const,
  /** `active_skins(player_id)`. */
  active: (playerId: string) => ["chain", "skins", "active", addressKey(playerId)] as const,
  /** Every read of the skins: what a write's receipt invalidates. */
  all: ["chain", "skins"] as const,
};

/** The two writes of the skins: `PavedWriter`'s. */
export type SkinSigner = Pick<PavedWriter, "address" | "buySkin" | "setSkins">;

/** The signer's skin writes, or null: no signer, or one without them (read only). */
export function skinSigner(sources: Pick<DataSources, "signer">): SkinSigner | null {
  const signer = sources.signer as (Partial<SkinSigner> & { address: string }) | null | undefined;
  return signer && typeof signer.buySkin === "function" && typeof signer.setSkins === "function" ? (signer as SkinSigner) : null;
}

/** The sources' skins views, or null (a views double without them). Probed as `cobbleViews` is. */
export function skinViews(views: GameViews): SkinViews | null {
  const v = views as GameViews & Partial<SkinViews>;
  return typeof v.skinPrices === "function" && typeof v.ownedSkins === "function" && typeof v.activeSkins === "function" ? (v as SkinViews) : null;
}

/** A theme with nothing on sale and nothing owned: what a theme not read is (Snow, Desert, Volcano: coming soon). */
const NO_PRICES: readonly number[] = new Array<number>(PLANS).fill(0);

/**
 * The theme scene's skins for the theme `code` (`THEME_CODES`): its 19 prices, the player's owned skins in it, the active
 * set and the balance. `code` null reads no price and no owned word (a theme that is not out: its prices are all 0). Null
 * without the Cobbles or skins views; disabled without a player.
 */
export function useThemeSkins(playerId: string | null, code: number | null): { data: ThemeSkinsData | null | undefined; isPending: boolean; error: Error | null } {
  const { views } = useDataSources();
  const ledger = cobbleViews(views);
  const skins = skinViews(views);
  const id = playerId ?? "0x0";
  const enabled = playerId !== null && ledger !== null && skins !== null;
  return useQueries({
    queries: [
      { queryKey: skinKeys.prices(code ?? 0), queryFn: () => skins!.skinPrices(code as number), enabled: enabled && code !== null },
      { queryKey: skinKeys.owned(id, code ?? 0), queryFn: () => skins!.ownedSkins(id, code as number), enabled: enabled && code !== null },
      { queryKey: skinKeys.active(id), queryFn: () => skins!.activeSkins(id), enabled },
      { queryKey: cobbleKeys.account(id), queryFn: () => (ledger ? ledger.account(id) : null), enabled },
    ],
    combine: ([prices, owned, active, account]) => {
      if (playerId !== null && !enabled) return { data: null, isPending: false, error: null };
      const priceList = code === null ? NO_PRICES : prices.data;
      const ownedWord = code === null ? 0 : owned.data;
      const ready = priceList !== undefined && ownedWord !== undefined && active.data !== undefined && account.data !== undefined;
      const error = (code === null ? null : (prices.error ?? owned.error)) ?? active.error ?? account.error ?? null;
      return {
        data: ready && account.data ? { balance: account.data.cobbles, prices: priceList!, owned: ownedWord!, active: active.data! } : undefined,
        // A failed read ends the wait: pending only while nothing failed.
        isPending: !ready && !error,
        error,
      };
    },
  });
}

/**
 * The 19 themes of a `SkinsActivated.active` word, plan 1 first: `@paved/chain`'s `activeThemes`, here because a value
 * import of the chain would bring starknet.js into the page's chunk (a test checks the two agree).
 */
export function unpackActive(word: string | number | bigint): number[] {
  let value = BigInt(word);
  return Array.from({ length: PLANS }, () => {
    const theme = Number(value & 0xffn);
    value >>= 8n;
    return theme;
  });
}

/**
 * A skin write's receipt into the cache: `SkinBought` sets the balance (its `balance`, the Cobbles after) and the plan's
 * bit in the theme's owned word; `SkinsActivated` replaces the active set with its word (`activeThemes`). Reads not in the
 * cache are left to the reconciling read.
 */
export function applySkinEvents(client: QueryClient, playerId: string, events: readonly DecodedEvent[]): void {
  for (const { name, fields } of events) {
    if (name === "SkinBought") {
      client.setQueryData<CobbleAccount | null>(cobbleKeys.account(playerId), (a) => (a ? { ...a, cobbles: Number(fields.balance) } : a));
      client.setQueryData<number>(skinKeys.owned(playerId, Number(fields.theme)), (o) => (o === undefined ? o : o | (1 << Number(fields.plan))));
    } else if (name === "SkinsActivated") {
      client.setQueryData<number[]>(skinKeys.active(playerId), unpackActive(fields.active as string | bigint));
    }
  }
}

/** What a write is on its way for: a plan's purchase at the price its card showed, or the batch's save. */
export type SkinWrite = { kind: "buy"; theme: number; plan: number; price: number } | { kind: "save"; changes: SkinChange[] };

/**
 * The skin writes of the connected account: `buy(theme, plan, price)` (one `buy_skin`, at the price the card showed: the
 * writer reads `skin_price` again inside its send and refuses another, `SkinPriceChangedError`) and `save(changes)` (one
 * `set_skins` of the plans that changed). Each puts its receipt's events into the cache and invalidates the reads it touched, after a
 * refusal too (an earlier write may have landed). `buying` is the plan on its way, `saving` the batch; `error` the last
 * refusal (`SkinRefusedError` or another `WriteError`) until `reset`; `saved` true after a save until `reset` or another
 * write. `signer` is null without a signer that writes skins: read only.
 */
export function useSkinWrites(playerId: string | null) {
  const sources = useDataSources();
  const signer = skinSigner(sources);
  const client = useQueryClient();
  const [saved, setSaved] = useState(false);
  const mutation = useMutation<WriteResult, Error, SkinWrite>({
    mutationFn: (write) => {
      if (!signer) return Promise.reject(new Error("Connect to buy and switch skins"));
      setSaved(false);
      if (write.kind === "save") return signer.setSkins(write.changes);
      const prices = skinViews(sources.views);
      if (!prices) return Promise.reject(new Error("The skins' prices cannot be read on this network: nothing was sent"));
      return signer.buySkin({ theme: write.theme, plan: write.plan, confirmedPrice: write.price }, prices);
    },
    onSuccess: ({ events }, write) => {
      if (playerId) applySkinEvents(client, playerId, events);
      if (write.kind === "save") setSaved(true);
    },
    onSettled: (_result, _error, write) => {
      if (!playerId) return;
      void client.invalidateQueries({ queryKey: write.kind === "buy" ? skinKeys.owned(playerId, write.theme) : skinKeys.active(playerId) });
      if (write.kind !== "buy") return;
      void client.invalidateQueries({ queryKey: cobbleKeys.account(playerId) });
      // A refused price change shows the new price on the card.
      void client.invalidateQueries({ queryKey: skinKeys.prices(write.theme) });
    },
  });
  const pending = mutation.isPending ? mutation.variables : undefined;
  return {
    signer,
    buying: pending?.kind === "buy" ? pending.plan : null,
    saving: pending?.kind === "save",
    saved,
    error: mutation.error,
    reset: () => {
      mutation.reset();
      setSaved(false);
    },
    buy: (theme: number, plan: number, price: number) => mutation.mutateAsync({ kind: "buy", theme, plan, price }),
    save: (changes: SkinChange[]) => mutation.mutateAsync({ kind: "save", changes }),
  };
}

/** The batch to send: one change per plan that differs from the saved set, plan order (Save sends only these). */
export function skinChanges(changes: Readonly<Record<number, number>>): SkinChange[] {
  return Object.entries(changes)
    .map(([plan, theme]) => ({ plan: Number(plan), theme }))
    .sort((a, b) => a.plan - b.plan);
}

/**
 * Where this device keeps the theme chosen at the top of the theme page. Since P11a it is also the viewer's skins switch:
 * "default" shows every board on the base models, whoever's game it is, and downloads no skin model; any other value
 * (today "forest") shows the players' skins. The values stored before P11a stay as they are: "default" and "forest" read as
 * before, nothing is migrated.
 */
export const THEME_KEY = "paved.theme.v1";

const isTheme = (value: string): value is "default" | "forest" => value === "default" || value === "forest";

/**
 * The theme store. Nothing stored is "forest", not "default": the skins show until the viewer opts out (the opt-out is
 * the stored "default"); a value it does not know is the same as nothing.
 */
export const deviceTheme = createDeviceStore<"default" | "forest">(THEME_KEY, "forest", (raw) => (isTheme(raw) ? raw : null), (v) => v);

/** The theme chosen on this device, kept when storage allows it and for the visit when not; shared by every page that reads it. */
export function useDeviceTheme(): [ThemeId, (id: ThemeId) => void] {
  const [theme, set] = useDeviceStore(deviceTheme);
  return [theme, (id) => isTheme(id) && set(id)];
}

/** The viewer's skins switch: whether boards show the players' skins (any theme but "default"). One row on the theme page, one in Settings. */
export function useShowSkins(): [boolean, (show: boolean) => void] {
  const [theme, set] = useDeviceStore(deviceTheme);
  return [theme !== "default", (show) => set(show ? "forest" : "default")];
}

// Compile-time check, no runtime code (as `scene-types.ts`'s, kept here with its hook): `useThemeSkins`'s data is the
// scene's `ThemeSkinsData`, or null without the views (`tsc -b` fails on a drift).
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;
export type SkinSceneTypes = [Expect<Equal<Exclude<ReturnType<typeof useThemeSkins>["data"], undefined>, ThemeSkinsData | null>>];
