import { useId } from "react";
import { cn } from "../../lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { Cobbles } from "../elements/cobbles";
import { TileChip, planCode, type TileArt } from "../elements/tile-chip";
import { PLANS, ownsSkin, type SkinState } from "./cobble-types";
import { THEME_TINT, THEMES, type ThemeId } from "./theme-card";

/**
 * The `u8` theme ids of `skins` and `active_skins` (cobbles-v1.md 5: 0 is the default theme). Forest is theme 1, the
 * high-forest set the fresh deployment prices (CORE #463). Snow, Desert and Volcano have no id on chain yet: the client's
 * order is used meanwhile, and none of them is read (coming soon).
 */
export const THEME_CODES: Record<ThemeId, number> = { default: 0, forest: 1, snow: 2, desert: 3, volcano: 4 };

/** The theme of an `active_skins` entry. */
export const themeOfCode = (code: number): ThemeId | undefined => (Object.keys(THEME_CODES) as ThemeId[]).find((id) => THEME_CODES[id] === code);

export interface SkinCellProps {
  plan: number;
  theme: ThemeId;
  /** `skin_price(theme, plan)`, 50 to 100 Cobbles; 0: not for sale. */
  price: number;
  state: SkinState;
  /** Another theme's skin of this plan is active (or will be once saved): activating this one replaces it. */
  replaces?: ThemeId;
  /** The player's Cobbles: Buy is disabled with the reason when the price is higher. */
  balance: number;
  /** This skin's purchase is on its way. */
  buying?: boolean;
  /** Any purchase or the save is on its way: the others wait. */
  busy?: boolean;
  tileArt?: TileArt;
  onBuy?: (plan: number) => void;
  onToggle?: (plan: number) => void;
}

/** One plan of a theme: the tile in the theme's look, its price, and Buy or the switch that activates it. */
export function SkinCell({ plan, theme, price, state, replaces, balance, buying, busy, tileArt, onBuy, onToggle }: SkinCellProps) {
  const name = `Tile ${planCode(plan).toLowerCase()}`;
  const short = price - balance;
  const forSale = price > 0;
  const reasonId = useId();
  const reason = forSale && !buying && short > 0;
  return (
    <li
      data-state={state}
      aria-label={name}
      className={cn("flex flex-col gap-2 rounded-xl border p-2", state === "active" ? "border-primary bg-accent" : "border-border bg-card")}
    >
      <span className="relative block aspect-square overflow-hidden rounded-lg bg-secondary">
        <span className="absolute inset-0" style={{ filter: THEME_TINT[theme] }}>
          <TileChip plan={plan} art={tileArt} className="size-full rounded-none border-0" />
        </span>
        {state === "active" && <Badge className="absolute top-1 left-1">Active</Badge>}
      </span>
      {state === "none" ? (
        <div className="flex flex-col gap-1.5">
          {forSale ? <Cobbles value={price} size="sm" /> : <span className="text-xs text-muted-foreground">Not for sale</span>}
          {forSale && (
            <Button size="sm" variant="outline" className="w-full" disabled={busy || short > 0} loading={buying} onClick={() => onBuy?.(plan)} aria-label={`Buy ${name} for ${price} Cobbles`} aria-describedby={reason ? reasonId : undefined}>
              {/* The spinner says it is on its way; a longer label would not fit a 320 px row of three (WRAP360). */}
              Buy
            </Button>
          )}
          {reason && (
            <span id={reasonId} className="text-xs text-warning">
              Need {short} more
            </span>
          )}
        </div>
      ) : (
        // Stacked: in a 360 px row of three, the switch beside its label would leave the label too narrow (WRAP360).
        <label className="flex min-h-11 cursor-pointer flex-col items-start gap-1.5 text-xs">
          <span className="flex min-w-0 flex-col">
            <span className={state === "active" ? "text-primary" : "text-muted-foreground"}>{state === "active" ? "Active" : "Owned"}</span>
            {replaces && state !== "active" && <span className="text-xs text-muted-foreground">Replaces {THEMES.find((t) => t.id === replaces)?.name}</span>}
          </span>
          <Switch checked={state === "active"} disabled={busy} onCheckedChange={() => onToggle?.(plan)} aria-label={`${name} skin active`} />
        </label>
      )}
    </li>
  );
}

export interface SkinGridProps {
  theme: ThemeId;
  /** `skin_price(theme, p)` for p = 1 to 19, at index p - 1. */
  prices: readonly number[];
  /** `skins(player_id, theme)`: bit p, plan p owned. */
  owned: number;
  /** The active set with the unsaved batch applied (`applySkinChanges`). */
  active: readonly number[];
  balance: number;
  /** The plan whose purchase is on its way. */
  buying?: number | null;
  busy?: boolean;
  tileArt?: TileArt;
  onBuy?: (plan: number) => void;
  onToggle?: (plan: number) => void;
  className?: string;
}

/** The 19 plans of a theme (X = 19, gems-v1.md 5.1), in plan order: three columns on a phone, up to six. */
export function SkinGrid({ theme, prices, owned, active, balance, buying, busy, tileArt, onBuy, onToggle, className }: SkinGridProps) {
  const code = THEME_CODES[theme];
  return (
    <ul aria-label="Skins" className={cn("grid grid-cols-3 gap-2 tablet:grid-cols-4 desktop:grid-cols-6", className)}>
      {Array.from({ length: PLANS }, (_, i) => i + 1).map((plan) => {
        const current = active[plan - 1];
        const state: SkinState = !ownsSkin(owned, plan) ? "none" : current === code ? "active" : "owned";
        return (
          <SkinCell
            key={plan}
            plan={plan}
            theme={theme}
            price={prices[plan - 1] ?? 0}
            state={state}
            replaces={current !== 0 && current !== code ? themeOfCode(current) : undefined}
            balance={balance}
            buying={buying === plan}
            busy={busy || (buying != null && buying !== plan)}
            tileArt={tileArt}
            onBuy={onBuy}
            onToggle={onToggle}
          />
        );
      })}
    </ul>
  );
}
