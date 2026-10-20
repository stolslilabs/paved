import { useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { errorDetail } from "../error-detail";
import { THEMES, THEME_CODES, type SkinThemeId } from "../../components/containers/theme-card";
import { ThemeShopScene } from "../../components/scenes/theme-shop-scene";
import { cobbleKeys } from "../../data/cobbles";
import { RENDERER_ASSETS } from "../../data/renderer-manifest";
import { skinKeys, useSkinWrites, useThemeSkins } from "../../data/skins";
import { useDataSources } from "../../data/sources";
import { useThemeVariants, useTileRenders } from "../../data/tile-renders";
import { useAccount } from "../../wallet/wallet";
import { useAppNavigate, useBack, useTabNavigate } from "../ref";
import NotFound from "./not-found";
import { skinsStatus } from "../skins-status";

/**
 * `/settings/theme/:theme` (THEMES-RENDERS): a theme's shop. Its 19 tiles from the build-time renders, each price, owned
 * and active state from the chain (`useThemeSkins`), and Buy: one `buy_skin`, with Cobbles only (the owner's ruling of
 * 2026-10-18), at the price the card showed. The receipt's `SkinBought` moves the balance and the owned word in the cache
 * (`useSkinWrites`). A theme not out yet (Snow, Desert, Volcano) is not read: coming soon. A path that names no theme (or
 * Default, which sells nothing) is not found.
 */
export default function Page() {
  const { theme = "" } = useParams();
  const option = THEMES.find((t) => t.id === theme && t.id !== "default");
  if (!option) return <NotFound />;
  return <Shop theme={option.id as SkinThemeId} available={option.available} />;
}

function Shop({ theme, available }: { theme: SkinThemeId; available: boolean }) {
  const go = useAppNavigate();
  const onNavigate = useTabNavigate();
  const onBack = useBack();
  useAccount();
  const sources = useDataSources();
  const playerId = sources.signer?.address ?? null;
  const code = THEME_CODES[theme];
  const read = useThemeSkins(playerId, available ? code : null);
  const writes = useSkinWrites(playerId);
  const client = useQueryClient();
  const renders = useTileRenders(RENDERER_ASSETS);
  const variants = useThemeVariants(RENDERER_ASSETS, code);

  const buy = (plan: number) => {
    // The price the card shows: the writer reads `skin_price` again at send and refuses another.
    const price = read.data?.prices[plan - 1];
    if (!available || !price) return;
    writes.reset();
    writes.buy(code, plan, price).then(
      () =>
        toast.success("Tile bought", {
          description: "Use the theme on Themes, or choose it in My tiles.",
          action: { label: "My tiles", onClick: () => go("/settings/tiles") },
        }),
      () => undefined,
    );
  };

  return (
    <ThemeShopScene
      theme={theme}
      renders={renders}
      variants={variants}
      skins={read.data}
      skinsStatus={available ? skinsStatus(playerId, read) : null}
      buying={writes.buying}
      refusal={writes.error?.message ?? null}
      refusalDetail={writes.error ? errorDetail(writes.error) : undefined}
      onDismissRefusal={writes.reset}
      onBuy={buy}
      onBuyCobbles={() => go("/cobbles")}
      onMyTiles={() => go("/settings/tiles")}
      onConnect={() => go("/welcome")}
      onRetry={() => {
        void client.invalidateQueries({ queryKey: skinKeys.all });
        void client.invalidateQueries({ queryKey: cobbleKeys.all });
      }}
      onBack={onBack}
      onNavigate={onNavigate}
    />
  );
}
