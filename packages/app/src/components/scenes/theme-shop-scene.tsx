import type { Tab } from "../../routes/pages";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { Notice } from "../elements/notice";
import { TokenIcon } from "../elements/token-icon";
import { ThemeCover, type TileRenders } from "../elements/tile-render";
import { PLANS, ownedCount, ownsSkin } from "../containers/cobble-types";
import { SkinGrid } from "../containers/skin-grid";
import { SkinsStatusView, type SkinsStatus } from "../containers/skins-status";
import { TabPage } from "../containers/tab-page";
import { THEMES, THEME_CODES, type SkinThemeId } from "../containers/theme-card";

/** What the chain says of one theme's skins (`useThemeSkins`): the balance, the prices, the owned word, the active set. */
export interface ThemeSkinsData {
  /** `Setup.account(player_id).cobbles`. */
  balance: number;
  /** `skin_price(theme, p)` at index p - 1; all 0: the theme sells nothing yet. */
  prices: readonly number[];
  /** `skins(player_id, theme)`. */
  owned: number;
  /** `active_skins(player_id)`, as saved: one theme id per plan. */
  active: readonly number[];
}

export interface ThemeShopSceneProps {
  /** The theme of the page. */
  theme: SkinThemeId;
  renders?: TileRenders;
  /** The theme's models per plan key (the manifest's variants): Forest has 1 to 9. */
  variants?: Readonly<Record<string, number>>;
  /** The theme's skins; omitted: `skinsStatus` says why. */
  skins?: ThemeSkinsData | null;
  skinsStatus?: SkinsStatus | null;
  /** The plan whose `buy_skin` is on its way. */
  buying?: number | null;
  /** The last purchase refused or failed (`SkinRefusedError`'s text): shown until dismissed or the next write. */
  refusal?: string | null;
  refusalDetail?: ErrorDetail;
  onDismissRefusal?: () => void;
  onBuy?: (plan: number) => void;
  /** To the Cobble packs. */
  onBuyCobbles?: () => void;
  /** My tiles: the skin of each tile. */
  onMyTiles?: () => void;
  onConnect?: () => void;
  onRetry?: () => void;
  onBack?: () => void;
  onNavigate?: (tab: Tab) => void;
}

/**
 * A theme's shop (`/settings/theme/<theme>`): its 19 tiles as the board draws them (build-time renders), each with its
 * Cobble price read from the chain, owned and active, and Buy, with Cobbles only (the owner's ruling of 2026-10-18); Get
 * Cobbles when short. A plan with several models says so: the board picks one per tile. Buying does not put a tile on the
 * board: Use on Themes, or My tiles, does.
 */
export function ThemeShopScene({ theme, renders, variants, skins, skinsStatus, buying, refusal, refusalDetail, onDismissRefusal, onBuy, onBuyCobbles, onMyTiles, onConnect, onRetry, onBack, onNavigate }: ThemeShopSceneProps) {
  const option = THEMES.find((t) => t.id === theme)!;
  const code = THEME_CODES[theme];
  const onSale = skins ? skins.prices.some((p) => p > 0) : false;
  const owned = skins ? ownedCount(skins.owned) : 0;
  const forSale = skins ? skins.prices.filter((p, i) => p > 0 && !ownsSkin(skins.owned, i + 1)) : [];
  const cheapest = forSale.length > 0 ? Math.min(...forSale) : 0;
  const variantCount = variants ? Object.values(variants).reduce((a, b) => a + b, 0) : 0;
  return (
    <TabPage
      tab="settings"
      title={option.name}
      subtitle={option.tagline}
      onBack={onBack}
      onNavigate={onNavigate}
    >
      <div className="overflow-hidden rounded-xl border border-border">
        <ThemeCover theme={option.available ? code : 0} renders={renders} blurred={!option.available} alt={`${option.name}: a few of its tiles`} />
      </div>
      {!option.available || (skins && !onSale && skins.owned === 0) ? (
        <div data-slot="card" className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card px-4 py-10 text-center">
          <Icon name="lock" size="xl" className="text-muted-foreground" />
          <p className="text-sm font-semibold">{option.name} tiles: coming soon</p>
          <p className="text-xs text-muted-foreground">Its tiles go on sale when its art is in.</p>
        </div>
      ) : !skins ? (
        skinsStatus && (
          <SkinsStatusView status={skinsStatus} guestTitle="Connect to buy tiles" guestText="Tiles are bought with the Cobbles of your account and kept on it." onConnect={onConnect} onRetry={onRetry} />
        )
      ) : (
        <section aria-label={`${option.name} tiles`} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>
              <span className="numeric font-semibold text-primary">{owned}</span>
              <span className="text-muted-foreground"> of </span>
              <span className="numeric font-semibold">{PLANS}</span>
              <span className="text-muted-foreground"> tiles owned</span>
            </span>
            {variantCount > PLANS && (
              <span className="text-xs text-muted-foreground">
                <span className="numeric">{variantCount}</span> models: the board picks one per tile
              </span>
            )}
          </div>
          {forSale.length > 0 && skins.balance < cheapest && (
            <Notice
              title={skins.balance === 0 ? "No Cobbles yet" : "Not enough Cobbles"}
              action={
                <Button size="sm" variant="outline" onClick={onBuyCobbles}>
                  Get Cobbles
                </Button>
              }
            >
              A tile costs <span className="numeric">{cheapest}</span> to <span className="numeric">{Math.max(...forSale)}</span> Cobbles. Earn them from missions, or buy a pack.
            </Notice>
          )}
          <InlineError
            title="Not done"
            message={refusal}
            detail={refusalDetail}
            action={
              onDismissRefusal && (
                <Button size="sm" variant="ghost" onClick={onDismissRefusal}>
                  Dismiss
                </Button>
              )
            }
          />
          <SkinGrid theme={theme} prices={skins.prices} owned={skins.owned} active={skins.active} variants={variants} balance={skins.balance} buying={buying} renders={renders} onBuy={onBuy} />
          {forSale.length > 0 && skins.balance >= cheapest && (
            <Button variant="ghost" size="sm" className="self-start" onClick={onBuyCobbles}>
              <TokenIcon kind="cobbles" size="xs" />
              Get Cobbles
            </Button>
          )}
        </section>
      )}
      {option.available && (
        <Button variant="outline" className="min-h-11" onClick={onMyTiles}>
          <Icon name="table-cells-large" size="sm" />
          My tiles: choose tile by tile
        </Button>
      )}
    </TabPage>
  );
}
