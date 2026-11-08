import { useId } from "react";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { Notice } from "../elements/notice";
import { TileRender, tileName, type TileRenders } from "../elements/tile-render";
import { TokenIcon } from "../elements/token-icon";
import { UiIcon } from "../elements/ui-icon";
import { planCode } from "../elements/tile-chip";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Skeleton } from "../ui/skeleton";
import { PLANS, ownedCount, ownsSkin, type SkinState } from "./cobble-types";
import { PriceButton, PriceState, ShopCard, ShopGrid, ShopTileArt, cellRule } from "./shop-card";
import { SkinsStatusView, type SkinsStatus } from "./skins-status";
import { SKIN_THEMES, THEMES, THEME_CODES, type SkinThemeId, type ThemeOption } from "./theme-card";

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

export interface ShopThemesProps {
  renders?: TileRenders;
  /** The theme on sale's models per plan key (the manifest's variants): Forest has 1 to 9. */
  variants?: Readonly<Record<string, number>>;
  /** The skins of the theme on sale (Forest, the one `SKIN_THEMES` holds); omitted: `skinsStatus` says why. */
  skins?: ThemeSkinsData | null;
  skinsStatus?: SkinsStatus | null;
  /** The plan whose `buy_skin` is on its way. */
  buying?: number | null;
  /** The last purchase refused or failed: shown until dismissed or the next write. */
  refusal?: string | null;
  refusalDetail?: ErrorDetail;
  onDismissRefusal?: () => void;
  onBuy?: (plan: number) => void;
  /** To the Cobbles tab. */
  onGetCobbles?: () => void;
  onRetry?: () => void;
  /** A theme's tiles, all of them (its own view, in place of the tab). */
  onOpenTheme?: (theme: SkinThemeId) => void;
}

/** How many tiles a theme's section shows in the tab (the book's row); its view shows them all. */
const PREVIEW = 3;

const stateOf = (skins: ThemeSkinsData, plan: number, code: number): SkinState => (!ownsSkin(skins.owned, plan) ? "none" : skins.active[plan - 1] === code ? "active" : "owned");

/** The marks' box: 32 px, the book's beside a theme's name. */
const MARK = "drawer-icon size-8 shrink-0";

/**
 * The theme's mark beside its name, the book's painted ones (the owner's ask of 2026-11-05: Forest's leaf, Snow's snowflake, Desert's
 * cactus, `ui-sources/icons/theme-*`); Volcano, which the book does not draw, its Font Awesome icon (`THEMES`).
 */
function ThemeMark({ theme }: { theme: ThemeOption }) {
  if (theme.id === "forest") return <UiIcon name="theme-forest" px={32} className={MARK} />;
  if (theme.id === "snow") return <UiIcon name="theme-snow" px={32} className={MARK} />;
  if (theme.id === "desert") return <UiIcon name="theme-desert" px={32} className={MARK} />;
  return <Icon name={theme.icon} size="lg" fixedWidth className="drawer-icon w-8 shrink-0 text-muted-foreground" />;
}

/**
 * The Shop's Themes tab (SHOP-PAGE, the book's "Buy a theme": "each tile's skin in the theme, in Cobbles; more themes coming"): each
 * theme on sale as a section, its mark and name, its tiles owned of 19 and All tiles, then its first tiles not owned yet in the
 * Shop's cards; the themes to come in one carved list, Coming soon. All tiles opens the theme's own view (`ShopTheme`) in place of
 * the tab, never a sheet over the Shop (the owner's ask of 2026-11-05).
 */
export function ShopThemes(props: ShopThemesProps) {
  const { skins, skinsStatus, renders, onOpenTheme } = props;
  const soon = THEMES.filter((t) => !t.available);
  return (
    <>
      {SKIN_THEMES.map((theme) => {
        const code = THEME_CODES[theme.id as SkinThemeId];
        const owned = skins ? ownedCount(skins.owned) : null;
        // The first tiles not owned yet (the book's three); the owned ones after them, once fewer are left.
        const plans = skins ? Array.from({ length: PLANS }, (_, i) => i + 1).sort((a, b) => Number(ownsSkin(skins.owned, a)) - Number(ownsSkin(skins.owned, b))).slice(0, PREVIEW) : [];
        const titleId = `shop-theme-${theme.id}`;
        return (
          <section key={theme.id} aria-labelledby={titleId} className="flex flex-col gap-2">
            <div className="flex min-h-11 items-center gap-2">
              <ThemeMark theme={theme} />
              <h3 id={titleId} className="text-outline outline-room min-w-0 flex-1 truncate font-display text-2xl leading-tight tracking-wide">
                {theme.name}
              </h3>
              {owned !== null && (
                <span className="text-xs text-muted-foreground">
                  <span className="numeric font-semibold text-foreground">{owned}</span>/<span className="numeric">{PLANS}</span> owned
                </span>
              )}
              <Button variant="ghost" size="sm" className="h-11 gap-1 px-2" onClick={() => onOpenTheme?.(theme.id as SkinThemeId)} aria-label={`All ${theme.name} tiles`}>
                All tiles
                <Icon name="chevron-right" size="xs" />
              </Button>
            </div>
            {!skins ? (
              skinsStatus && (
                <SkinsStatusView
                  status={skinsStatus}
                  skeleton={<Skeleton className="h-56 w-full rounded-2xl" />}
                  onRetry={props.onRetry}
                />
              )
            ) : (
              <ShopGrid label={`${theme.name} tiles`} columns={3}>
                {plans.map((plan, i) => (
                  <SkinCard key={plan} {...props} index={i} plan={plan} code={code} skins={skins} reserveReason={plans.some((p) => isShort(skins, p, code))} />
                ))}
              </ShopGrid>
            )}
          </section>
        );
      })}
      {skins && <Refusal {...props} />}
      <ul aria-label="Themes coming" className="drawer-carved flex flex-col rounded-2xl px-3">
        {soon.map((theme, i) => (
          <li key={theme.id} className="flex min-h-14 items-center gap-3" style={cellRule(i, 1)}>
            <ThemeMark theme={theme} />
            <span className="text-outline min-w-0 flex-1 truncate font-display text-xl tracking-wide">{theme.name}</span>
            <span className="text-sm text-muted-foreground italic">Coming soon</span>
          </li>
        ))}
      </ul>
    </>
  );
}

/** The last purchase's refusal, until dismissed. */
function Refusal({ refusal, refusalDetail, onDismissRefusal }: ShopThemesProps) {
  return (
    <InlineError
      title="Not bought"
      message={refusal ?? null}
      detail={refusalDetail}
      action={
        onDismissRefusal && (
          <Button size="sm" variant="ghost" onClick={onDismissRefusal}>
            Dismiss
          </Button>
        )
      }
    />
  );
}

/** One tile of a theme in the Shop's card: its render in the theme, its name, its price, or Owned and In use. */
/** A tile of the theme is short of Cobbles: its card says by how much, and the row keeps that line. */
const isShort = (skins: ThemeSkinsData, plan: number, code: number) => stateOf(skins, plan, code) === "none" && (skins.prices[plan - 1] ?? 0) > skins.balance;

function SkinCard({ index, plan, code, skins, variants, buying, renders, onBuy, withModels, reserveReason }: ShopThemesProps & { index: number; plan: number; code: number; skins: ThemeSkinsData; withModels?: boolean; reserveReason?: boolean }) {
  const name = tileName(plan);
  const price = skins.prices[plan - 1] ?? 0;
  const state = stateOf(skins, plan, code);
  const need = price - skins.balance;
  const reasonId = useId();
  const reason = state === "none" && price > 0 && buying !== plan && need > 0;
  const models = variants?.[planCode(plan).toLowerCase()] ?? 1;
  return (
    <ShopCard
      label={name}
      state={state}
      style={cellRule(index, 3)}
      art={
        <ShopTileArt>
          <TileRender plan={plan} theme={code} renders={renders} />
        </ShopTileArt>
      }
      badge={
        withModels &&
        models > 1 && (
          <span className="drawer-carved absolute right-0 bottom-0 rounded-full px-1.5 text-xs" aria-label={`${models} models: the board picks one per tile`}>
            <span className="numeric">{models}</span>
          </span>
        )
      }
      title={name}
      action={
        state !== "none" ? (
          <PriceState>{state === "active" ? "In use" : "Owned"}</PriceState>
        ) : price === 0 ? (
          <PriceState>Not sold</PriceState>
        ) : (
          <PriceButton label={`Buy ${name} for ${price} Cobbles`} disabled={(buying != null && buying !== plan) || need > 0} loading={buying === plan} describedBy={reason ? reasonId : undefined} onClick={() => onBuy?.(plan)}>
            {buying !== plan && (
              <>
                {price}
                <TokenIcon kind="cobbles" size="md" />
              </>
            )}
          </PriceButton>
        )
      }
      reason={
        reason && (
          <span id={reasonId}>
            Need <span className="numeric">{need}</span> more
          </span>
        )
      }
      reserveReason={reserveReason}
    />
  );
}

/**
 * A theme's own view (SHOP-PAGE: the Themes tab's All tiles, drawn in place of the tab, its Back to it): what it is, its tiles owned
 * of 19, then its 19 tiles in the Shop's cards, three a row; short of Cobbles, Get Cobbles opens the Cobbles tab. A theme not out
 * yet (Snow, Desert, Volcano) is not read: coming soon.
 */
export function ShopTheme({ theme, ...props }: ShopThemesProps & { theme: SkinThemeId }) {
  const { skins, skinsStatus } = props;
  const option = THEMES.find((t) => t.id === theme)!;
  const code = THEME_CODES[theme];
  const forSale = skins ? skins.prices.filter((p, i) => p > 0 && !ownsSkin(skins.owned, i + 1)) : [];
  const cheapest = forSale.length > 0 ? Math.min(...forSale) : 0;
  if (!option.available || (skins && skins.prices.every((p) => p === 0) && skins.owned === 0))
    return (
      <div className="drawer-carved flex flex-col items-center gap-2 rounded-2xl px-4 py-10 text-center">
        <Icon name="lock" size="xl" className="text-muted-foreground" />
        <p className="text-sm font-semibold">{option.name} tiles: coming soon</p>
        <p className="text-xs text-muted-foreground">Its tiles go on sale when its art is in.</p>
      </div>
    );
  if (!skins)
    return skinsStatus ? (
      <SkinsStatusView status={skinsStatus} skeleton={<Skeleton className="h-96 w-full rounded-2xl" />} onRetry={props.onRetry} />
    ) : null;
  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm text-muted-foreground">{option.tagline}</p>
        <span className="text-sm">
          <span className="numeric font-semibold text-primary">{ownedCount(skins.owned)}</span>
          <span className="text-muted-foreground"> of </span>
          <span className="numeric font-semibold">{PLANS}</span>
          <span className="text-muted-foreground"> owned</span>
        </span>
      </div>
      {forSale.length > 0 && skins.balance < cheapest && (
        <Notice
          title={skins.balance === 0 ? "No Cobbles yet" : "Not enough Cobbles"}
          action={
            <Button size="sm" variant="outline" onClick={props.onGetCobbles}>
              Get Cobbles
            </Button>
          }
        >
          A tile costs <span className="numeric">{cheapest}</span> to <span className="numeric">{Math.max(...forSale)}</span> Cobbles. Earn them from missions, or buy a pack.
        </Notice>
      )}
      <Refusal {...props} />
      <ShopGrid label={`${option.name} tiles`} columns={3}>
        {Array.from({ length: PLANS }, (_, i) => i + 1).map((plan, i, all) => (
          <SkinCard key={plan} {...props} index={i} plan={plan} code={code} skins={skins} withModels reserveReason={all.slice(i - (i % 3), i - (i % 3) + 3).some((p) => isShort(skins, p, code))} />
        ))}
      </ShopGrid>
    </>
  );
}
