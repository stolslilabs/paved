import { useCallback } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DAY_S, dayOf } from "@paved/game-core";
import type { SkinsStatus } from "../../components/containers/skins-status";
import type { ShopThemesProps } from "../../components/containers/shop-themes";
import type { ShopTilesProps } from "../../components/containers/shop-tiles";
import { SKIN_THEMES, THEMES, THEME_CODES, type SkinThemeId } from "../../components/containers/theme-card";
import { tileName } from "../../components/elements/tile-render";
import { ShopScene, type ShopTab } from "../../components/scenes/shop-scene";
import { cobbleKeys, useCobbleAccount } from "../../data/cobbles";
import { useFreeVillage, useFreeVillageWrites, useShop } from "../../data/free-village";
import { queryKeys } from "../../data/keys";
import { RENDERER_ASSETS } from "../../data/renderer-manifest";
import { skinKeys, useSkinWrites, useThemeSkins } from "../../data/skins";
import { useDataSources } from "../../data/sources";
import { useThemeVariants, useTileRenders } from "../../data/tile-renders";
import { useAccount } from "../../wallet/wallet";
import { useDrawerRoute } from "../drawer-route";
import { errorDetail } from "../error-detail";
import { useNow } from "../now";
import { useAppNavigate, useBack } from "../ref";
import { useShopPacks } from "../shop-packs";
import { skinsStatus } from "../skins-status";
import { countsByPlan, refusalText } from "../village-v2";

/** The state of a theme's view the app opened (`openTheme`, Settings' themes): its Back goes back in the history. */
const THEME_OPENED = { opened: true } as const;

/** The tab of the URL (`?tab=`): Tiles when it names none or another. */
const tabOf = (value: string | null): ShopTab => (value === "cobbles" || value === "themes" ? value : "tiles");
/** The theme of the URL's view (`?theme=`), on the Themes tab only: one of the themes but Default. */
const themeOf = (tab: ShopTab, value: string | null): SkinThemeId | null => (tab === "themes" && THEMES.some((t) => t.id === value && t.id !== "default") ? (value as SkinThemeId) : null);

/**
 * `/village/shop` (SHOP-PAGE, the Paved UX Book's Shop): one page, three tabs, the HUD's drawer over the home (`PageDef.drawer`,
 * `home-hosts.tsx`). The tab is the URL's (`?tab=cobbles`, `?tab=themes`; the owner's choice of 2026-11-05), a change replacing the
 * entry, so the Shop's close still lands where it was opened from; a theme's view (`?tab=themes&theme=forest`) is an entry of its own,
 * its Back the browser's. The old `/cobbles` and `/settings/theme/:theme` land here (`router.tsx`).
 * - Tiles (#739): the day's 3 base plans from `useShop` (the mock ledger in step 1, #741), each bought once a day at the price shown
 *   (`buy`); the tile goes to the inventory. The day is the device's clock (the mock's, step 1), the time left until the next UTC day.
 * - Cobbles (#621): the packs, paid in USDC (`useShopPacks`).
 * - Themes (THEMES-RENDERS): the theme on sale's tiles from the build-time renders, each price, owned and active state from the chain
 *   (`useThemeSkins`), and Buy: one `buy_skin`, with Cobbles only (the owner's ruling of 2026-10-18), at the price the card showed.
 * Every tab's reads start with the page, so a tab change shows its content at once. Short of Cobbles, Get Cobbles opens the Cobbles tab.
 */
export default function Page() {
  const drawer = useDrawerRoute();
  const back = useBack();
  const onBack = drawer?.onClose ?? back;
  const [params, setParams] = useSearchParams();
  const tab = tabOf(params.get("tab"));
  const theme = themeOf(tab, params.get("theme"));
  const navigate = useNavigate();
  const location = useLocation();
  const go = useAppNavigate();

  const setTab = useCallback(
    (next: ShopTab) =>
      setParams(
        (p) => {
          const q = new URLSearchParams(p);
          q.delete("theme");
          if (next === "tiles") q.delete("tab");
          else q.set("tab", next);
          return q;
        },
        { replace: true },
      ),
    [setParams],
  );
  const openTheme = (id: SkinThemeId) =>
    setParams(
      (p) => {
        const q = new URLSearchParams(p);
        q.set("tab", "themes");
        q.set("theme", id);
        return q;
      },
      { state: THEME_OPENED },
    );
  // Back from a theme's view: the page it was opened from (the Shop's tab, Settings' themes), back in the history; reached by a link
  // or a reload, the Themes tab in its place.
  const themeBack = () => ((location.state as typeof THEME_OPENED | null)?.opened ? navigate(-1) : setTab("themes"));

  const tiles = useShopTiles(() => setTab("cobbles"));
  const packs = useShopPacks();
  const themes = useShopThemes(() => setTab("cobbles"), openTheme, go);

  return (
    <ShopScene
      tab={tab}
      theme={theme}
      tiles={tiles}
      packs={packs}
      themes={themes}
      open={drawer?.open ?? true}
      returnFocus={drawer?.returnFocus}
      onTab={setTab}
      onBack={onBack}
      onThemeBack={themeBack}
    />
  );
}

/** The Tiles tab's wiring (the daily shop of #739). */
function useShopTiles(onGetCobbles: () => void): ShopTilesProps {
  const wallet = useAccount();
  const sources = useDataSources();
  const client = useQueryClient();
  // The day is the device's, as the mock ledger rules on it in step 1 (#741); step 3 (#742) reads the chain's with the contracts.
  const now = useNow();
  const me = sources.signer?.address ?? null;
  const day = dayOf(now);
  const read = useShop(me, day);
  const village = useFreeVillage(me);
  const account = useCobbleAccount(me);
  const writes = useFreeVillageWrites(me);
  const renders = useTileRenders(RENDERER_ASSETS);

  const data = read.data;
  const failed = read.error ?? account.error ?? null;
  const waiting = data === undefined || account.data === undefined;
  const status: SkinsStatus | null =
    // No guest (NO-GUEST): until the account is read, the shop loads.
    me === null
      ? { kind: "loading" }
      : data === null
        ? { kind: "error", message: "The tile shop is not on this network yet." }
        : failed
          ? { kind: "error", message: failed.message, detail: errorDetail(failed) }
          : waiting
            ? { kind: "loading" }
            : null;
  const offers = data?.offers ?? [];
  const pending = writes.pending;
  return {
    status,
    offers: offers.map((o) => ({ plan: o.plan, rarity: o.rarity, price: o.price, bought: o.bought })),
    cobbles: account.data?.cobbles ?? 0,
    owned: village.data ? countsByPlan(village.data.inventory) : {},
    resetsAt: data?.endsAt ?? (day + 1) * DAY_S,
    now,
    buying: pending?.kind === "buy" ? offers.findIndex((o) => o.slot === pending.request.slot) : null,
    refusal: writes.error ? refusalText(writes.error) : null,
    refusalDetail: writes.error ? errorDetail(writes.error) : undefined,
    renders,
    onRetry: () => {
      void client.invalidateQueries({ queryKey: queryKeys.chain.v2.all });
      void client.invalidateQueries({ queryKey: cobbleKeys.all });
    },
    onBuy: (index) => {
      const offer = offers[index];
      if (pending || !data || !offer || offer.bought) return;
      writes.reset();
      writes.buy({ day: data.day, slot: offer.slot, confirmedPrice: offer.price }).then(
        () => toast.success(`${tileName(offer.plan)} bought`, { description: "It is in your inventory: place it in the editor." }),
        () => undefined,
      );
    },
    onGetCobbles,
    onDismissRefusal: writes.reset,
  };
}

/** The theme on sale (Forest): the one whose skins the Themes tab reads. */
const ON_SALE = SKIN_THEMES[0]!.id as SkinThemeId;

/** The Themes tab's wiring (THEMES-RENDERS): the theme on sale's skins, read and bought. */
function useShopThemes(onGetCobbles: () => void, onOpenTheme: (theme: SkinThemeId) => void, go: ReturnType<typeof useAppNavigate>): ShopThemesProps {
  const wallet = useAccount();
  const sources = useDataSources();
  const playerId = sources.signer?.address ?? null;
  const code = THEME_CODES[ON_SALE];
  const read = useThemeSkins(playerId, code);
  const writes = useSkinWrites(playerId);
  const client = useQueryClient();
  const renders = useTileRenders(RENDERER_ASSETS);
  const variants = useThemeVariants(RENDERER_ASSETS, code);
  return {
    renders,
    variants,
    skins: read.data,
    skinsStatus: skinsStatus(playerId, read),
    buying: writes.buying,
    refusal: writes.error?.message ?? null,
    refusalDetail: writes.error ? errorDetail(writes.error) : undefined,
    onDismissRefusal: writes.reset,
    onBuy: (plan) => {
      // The price the card shows: the writer reads `skin_price` again at send and refuses another.
      const price = read.data?.prices[plan - 1];
      if (!price) return;
      writes.reset();
      writes.buy(code, plan, price).then(
        () =>
          toast.success("Tile bought", {
            description: "Use the theme on Themes, or choose it in Tiles.",
            action: { label: "Tiles", onClick: () => go("/tiles") },
          }),
        () => undefined,
      );
    },
    onGetCobbles,
    onRetry: () => {
      void client.invalidateQueries({ queryKey: skinKeys.all });
      void client.invalidateQueries({ queryKey: cobbleKeys.all });
    },
    onOpenTheme,
  };
}
