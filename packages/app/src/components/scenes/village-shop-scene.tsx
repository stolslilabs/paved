import { useId } from "react";
import { cn } from "../../lib/utils";
import { Cobbles } from "../elements/cobbles";
import { Countdown } from "../elements/countdown";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { RarityBadge, type Rarity } from "../elements/rarity-badge";
import { TileChip, type TileArt } from "../elements/tile-chip";
import { tileName } from "../elements/tile-render";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Skeleton } from "../ui/skeleton";
import { SHOP_OFFERS } from "../containers/layout-rules";
import { SkinsStatusView, type SkinsStatus } from "../containers/skins-status";
import { TopBar } from "../containers/top-bar";

/** One of the day's offers (#737): a base plan, its rarity and price in Cobbles, bought once a day. */
export interface ShopOffer {
  plan: number;
  rarity: Rarity;
  price: number;
  /** Bought today: it waits for tomorrow's shop. */
  bought: boolean;
}

export interface VillageShopSceneProps {
  status?: SkinsStatus | null;
  /** The day's 3 offers, the same for everyone. */
  offers?: readonly ShopOffer[];
  /** The player's Cobbles. */
  cobbles?: number;
  /** How many of each plan the player holds (the inventory and the layout). */
  owned?: Readonly<Record<number, number>>;
  /** Seconds since the epoch: the next UTC day, tomorrow's shop. */
  resetsAt?: number;
  /** Seconds since the epoch: the scene's clock. */
  now?: number;
  /** The offer being bought (its index): the others wait. */
  buying?: number | null;
  refusal?: string | null;
  refusalDetail?: ErrorDetail;
  tileArt?: TileArt;
  onBack?: () => void;
  onConnect?: () => void;
  onRetry?: () => void;
  onBuy?: (index: number) => void;
  onGetCobbles?: () => void;
  onDismissRefusal?: () => void;
}

/**
 * The daily tile shop (#739, part of #732): the day's 3 base plans, the same for everyone, each with its rarity and its price
 * in Cobbles; each can be bought once a day, all three if the player wants, and the tile goes to the inventory. The time left
 * until tomorrow's shop. Data and writes come as props and callbacks: the page wires them to the shop's contract (#737) in a
 * later task.
 */
export function VillageShopScene({
  status,
  offers = [],
  cobbles = 0,
  owned = {},
  resetsAt,
  now,
  buying = null,
  refusal = null,
  refusalDetail,
  tileArt,
  onBack,
  onConnect,
  onRetry,
  onBuy,
  onGetCobbles,
  onDismissRefusal,
}: VillageShopSceneProps) {
  const short = offers.some((o) => !o.bought && o.price > cobbles);
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <TopBar
        title="Tile shop"
        onBack={onBack}
        ownCobbles
        end={
          <span className="pr-2">
            <Cobbles value={cobbles} />
          </span>
        }
      />
      <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] desktop:max-w-4xl">
        {status ? (
          <SkinsStatusView
            status={status}
            guestTitle="Connect to visit the shop"
            guestText="Three tiles a day, the same for everyone: buy them with Cobbles for your village."
            errorTitle="The shop could not be read"
            skeleton={
              <div className="flex flex-col gap-3">
                {Array.from({ length: SHOP_OFFERS }, (_, i) => (
                  <Skeleton key={i} className="h-24 w-full rounded-xl" />
                ))}
              </div>
            }
            onConnect={onConnect}
            onRetry={onRetry}
          />
        ) : (
          <>
            <header className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-col">
                <h2 className="font-display text-lg">Today's tiles</h2>
                <p className="text-xs text-muted-foreground">The same three for everyone, each bought once a day.</p>
              </div>
              {resetsAt != null && now != null && <Countdown expiresAt={resetsAt} now={now} label="New tiles in" />}
            </header>
            {refusal && (
              <InlineError
                title="Not bought"
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
            )}
            <ul aria-label="Today's offers" className="flex flex-col gap-2 desktop:grid desktop:grid-cols-3 desktop:gap-4">
              {offers.map((offer, i) => (
                <OfferCard
                  key={`${offer.plan}-${i}`}
                  offer={offer}
                  held={owned[offer.plan] ?? 0}
                  cobbles={cobbles}
                  buying={buying === i}
                  busy={buying != null && buying !== i}
                  tileArt={tileArt}
                  onBuy={() => onBuy?.(i)}
                />
              ))}
            </ul>
            {short && onGetCobbles && (
              <Button variant="outline" className="self-center" onClick={onGetCobbles}>
                <Icon name="plus" size="sm" /> Get Cobbles
              </Button>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function OfferCard({ offer, held, cobbles, buying, busy, tileArt, onBuy }: { offer: ShopOffer; held: number; cobbles: number; buying: boolean; busy: boolean; tileArt?: TileArt; onBuy: () => void }) {
  const name = tileName(offer.plan);
  const need = offer.price - cobbles;
  const reasonId = useId();
  return (
    <li
      data-bought={offer.bought || undefined}
      className={cn("flex items-center gap-3 rounded-xl border border-border bg-card p-3 desktop:flex-col desktop:items-stretch desktop:p-4", offer.bought && "opacity-70")}
    >
      <span className="block size-20 shrink-0 desktop:aspect-square desktop:size-auto desktop:w-full">
        <TileChip plan={offer.plan} art={tileArt} className="size-full rounded-[3px] border-0" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-sm font-semibold">{name}</span>
        <span className="flex flex-wrap items-center gap-2">
          <RarityBadge rarity={offer.rarity} />
          <span className="text-xs text-muted-foreground">
            <span className="numeric">{held}</span> held
          </span>
        </span>
        <Cobbles value={offer.price} size="sm" />
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 desktop:items-stretch">
        {offer.bought ? (
          <span className="flex items-center gap-1 text-xs text-success">
            <Icon name="circle-check" size="xs" /> Bought today
          </span>
        ) : (
          <>
            <Button size="sm" disabled={busy || need > 0} loading={buying} onClick={onBuy} aria-label={`Buy ${name} for ${offer.price} Cobbles`} aria-describedby={need > 0 ? reasonId : undefined}>
              Buy
            </Button>
            {need > 0 && (
              <span id={reasonId} className="text-xs text-warning">
                Need <span className="numeric">{need}</span> more
              </span>
            )}
          </>
        )}
      </div>
    </li>
  );
}
