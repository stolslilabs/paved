import { useId } from "react";
import { cn } from "../../lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Cobbles } from "../elements/cobbles";
import { TierSwatch } from "../elements/tier-base";
import { planCode } from "../elements/tile-chip";
import { TileRender, tileName, type TileRenders } from "../elements/tile-render";
import { PLANS, ownsSkin, type SkinState } from "./cobble-types";
import { THEME_CODES, type SkinThemeId } from "./theme-card";

/** A skin reserved to a tier of its plan (#646): its tier (0 to 4), the tier's name, and whether the player's plan reached it. */
export interface SkinTierGate {
  tier: 0 | 1 | 2 | 3 | 4;
  name: string;
  reached: boolean;
}

export interface SkinCellProps {
  plan: number;
  theme: SkinThemeId;
  /** `skin_price(theme, plan)`, 50 to 100 Cobbles; 0: not for sale. */
  price: number;
  state: SkinState;
  /** The theme's models of this plan: more than one, the board picks one per tile. */
  variants?: number;
  /** The player's Cobbles: Buy is disabled with the reason when the price is higher. */
  balance: number;
  /** This skin's purchase is on its way. */
  buying?: boolean;
  /** Another purchase is on its way: this one waits. */
  busy?: boolean;
  renders?: TileRenders;
  /** Reserved to a tier of the plan (#646): Buy waits until the plan reaches it. */
  gate?: SkinTierGate;
  onBuy?: (plan: number) => void;
}

/** One plan of a theme's shop: its real render, its variants, its price and Buy, or Owned / Active. */
export function SkinCell({ plan, theme, price, state, variants = 1, balance, buying, busy, renders, gate, onBuy }: SkinCellProps) {
  const name = tileName(plan);
  const short = price - balance;
  const forSale = price > 0;
  const reasonId = useId();
  const locked = gate != null && !gate.reached;
  const reason = forSale && !buying && (locked || short > 0);
  return (
    <li
      data-state={state}
      aria-label={name}
      data-plan={planCode(plan).toLowerCase()}
      className={cn("flex flex-col gap-2 rounded-xl border p-2", state === "active" ? "border-primary bg-card state-layer" : "border-border bg-card")}
    >
      <span className="relative block aspect-square overflow-hidden rounded-lg bg-board">
        <TileRender plan={plan} theme={THEME_CODES[theme]} renders={renders} />
        {gate && (
          <Badge variant="outline" className="absolute top-1 right-1 border-border bg-background/80 backdrop-blur-sm" aria-label={`Reserved to ${gate.name} tier`}>
            <TierSwatch tier={gate.tier} />
            {gate.name}
          </Badge>
        )}
        {state !== "none" && <Badge className="absolute top-1 left-1" variant={state === "active" ? "default" : "secondary"}>{state === "active" ? "Active" : "Owned"}</Badge>}
        {variants > 1 && (
          <Badge variant="outline" className="absolute right-1 bottom-1 border-border bg-background/80 backdrop-blur-sm" aria-label={`${variants} variants: the board picks one per tile`}>
            <span className="numeric">{variants}</span>&nbsp;models
          </Badge>
        )}
      </span>
      <span className="text-xs font-semibold">{name}</span>
      {state === "none" ? (
        <div className="flex flex-col gap-1.5">
          {forSale ? <Cobbles value={price} size="sm" /> : <span className="text-xs text-muted-foreground">Not for sale</span>}
          {forSale && (
            <Button size="sm" variant="outline" className="w-full" disabled={busy || locked || short > 0} loading={buying} onClick={() => onBuy?.(plan)} aria-label={`Buy ${name} for ${price} Cobbles`} aria-describedby={reason ? reasonId : undefined}>
              {/* The spinner says it is on its way; a longer label would not fit a 320 px row of three (WRAP360). */}
              Buy
            </Button>
          )}
          {reason && (
            <span id={reasonId} className="text-xs text-warning">
              {locked ? (
                <>Reach {gate.name} on this plan</>
              ) : (
                <>
                  Need <span className="numeric">{short}</span> more
                </>
              )}
            </span>
          )}
        </div>
      ) : (
        <span className={cn("flex items-center gap-1 text-xs", state === "active" ? "text-primary" : "text-muted-foreground")}>
          <Icon name={state === "active" ? "circle-check" : "check"} size="xs" />
          {state === "active" ? "On your boards" : "Yours"}
        </span>
      )}
    </li>
  );
}

export interface SkinGridProps {
  theme: SkinThemeId;
  /** `skin_price(theme, p)` for p = 1 to 19, at index p - 1. */
  prices: readonly number[];
  /** `skins(player_id, theme)`: bit p, plan p owned. */
  owned: number;
  /** `active_skins(player_id)`, as saved. */
  active: readonly number[];
  /** The theme's models per plan key (the manifest's variants); unset or 1: one. */
  variants?: Readonly<Record<string, number>>;
  balance: number;
  /** The plan whose purchase is on its way. */
  buying?: number | null;
  renders?: TileRenders;
  /** The skins reserved to a tier (#646), by plan. */
  gates?: Readonly<Record<number, SkinTierGate>>;
  onBuy?: (plan: number) => void;
  className?: string;
}

/** The 19 plans of a theme (X = 19, gems-v1.md 5.1), in plan order: three columns on a phone, up to six. */
export function SkinGrid({ theme, prices, owned, active, variants, balance, buying, renders, gates, onBuy, className }: SkinGridProps) {
  const code = THEME_CODES[theme];
  return (
    <ul aria-label="Tiles" className={cn("grid grid-cols-3 gap-2 tablet:grid-cols-4 desktop:grid-cols-6", className)}>
      {Array.from({ length: PLANS }, (_, i) => i + 1).map((plan) => {
        const state: SkinState = !ownsSkin(owned, plan) ? "none" : active[plan - 1] === code ? "active" : "owned";
        return (
          <SkinCell
            key={plan}
            plan={plan}
            theme={theme}
            price={prices[plan - 1] ?? 0}
            state={state}
            variants={variants?.[planCode(plan).toLowerCase()]}
            balance={balance}
            buying={buying === plan}
            busy={buying != null && buying !== plan}
            renders={renders}
            gate={gates?.[plan]}
            onBuy={onBuy}
          />
        );
      })}
    </ul>
  );
}
