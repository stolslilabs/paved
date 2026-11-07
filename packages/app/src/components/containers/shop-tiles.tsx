import { useId } from "react";
import { formatShortRemaining, formatRemaining } from "../elements/countdown";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { RarityBadge, type Rarity } from "../elements/rarity-badge";
import { TileRender, tileName, type TileRenders } from "../elements/tile-render";
import { TokenIcon } from "../elements/token-icon";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Skeleton } from "../ui/skeleton";
import { SHOP_OFFERS } from "./layout-rules";
import { PriceButton, PriceState, ShopCard, ShopGrid, ShopTileArt, cellRule } from "./shop-card";
import { SkinsStatusView, type SkinsStatus } from "./skins-status";

/** One of the day's offers (#737): a base plan, its rarity and price in Cobbles, bought once a day. */
export interface ShopOffer {
  plan: number;
  rarity: Rarity;
  price: number;
  /** Bought today: it waits for tomorrow's shop. */
  bought: boolean;
}

export interface ShopTilesProps {
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
  /** The build-time renders (`useTileRenders`): each tile as the board draws it. */
  renders?: TileRenders;
  onRetry?: () => void;
  onBuy?: (index: number) => void;
  /** To the Cobbles tab. */
  onGetCobbles?: () => void;
  onDismissRefusal?: () => void;
}

/** The time until tomorrow's tiles, the book's "New tiles in 5h 02m", in a carved chip. */
function NewTilesIn({ resetsAt, now }: { resetsAt: number; now: number }) {
  const left = Math.max(0, resetsAt - now);
  return (
    <span role="timer" aria-label={`New tiles in ${formatRemaining(left)}`} className="drawer-carved flex h-9 items-center gap-2 self-center rounded-full px-4 text-sm font-semibold">
      <Icon name="clock" size="sm" className="text-primary" />
      <span aria-hidden>
        New tiles in <span className="numeric">{formatShortRemaining(left)}</span>
      </span>
    </span>
  );
}

/**
 * The Shop's Tiles tab (SHOP-PAGE, the book's "Buy a tile"; the daily shop of #739): the time until tomorrow's tiles, then the day's
 * three base plans in one carved panel, each as the board draws it, its name, its rarity, how many the player holds and its price;
 * each can be bought once a day (`Bought` in its place after), the tile going to the inventory. Short of Cobbles, Get Cobbles opens
 * the Cobbles tab.
 */
export function ShopTiles({ status, offers = [], cobbles = 0, owned = {}, resetsAt, now, buying = null, refusal = null, refusalDetail, renders, onRetry, onBuy, onGetCobbles, onDismissRefusal }: ShopTilesProps) {
  const short = offers.some((o) => !o.bought && o.price > cobbles);
  if (status)
    return (
      <SkinsStatusView
        status={status}
        errorTitle="The shop could not be read"
        skeleton={<Skeleton className="h-64 w-full rounded-2xl" />}
        onRetry={onRetry}
      />
    );
  return (
    <>
      {resetsAt != null && now != null && <NewTilesIn resetsAt={resetsAt} now={now} />}
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
      <ShopGrid label="Today's tiles" columns={3}>
        {offers.slice(0, SHOP_OFFERS).map((offer, i) => (
          <OfferCard
            key={`${offer.plan}-${i}`}
            index={i}
            offer={offer}
            held={owned[offer.plan] ?? 0}
            cobbles={cobbles}
            buying={buying === i}
            busy={buying != null && buying !== i}
            reserveReason={short}
            renders={renders}
            onBuy={() => onBuy?.(i)}
          />
        ))}
      </ShopGrid>
      {short && onGetCobbles && (
        <Button variant="outline" className="self-center" onClick={onGetCobbles}>
          <TokenIcon kind="cobbles" size="sm" /> Get Cobbles
        </Button>
      )}
    </>
  );
}

function OfferCard({ index, offer, held, cobbles, buying, busy, reserveReason, renders, onBuy }: { index: number; offer: ShopOffer; held: number; cobbles: number; buying: boolean; busy: boolean; reserveReason: boolean; renders?: TileRenders; onBuy: () => void }) {
  const name = tileName(offer.plan);
  const need = offer.price - cobbles;
  const reasonId = useId();
  const reason = !offer.bought && need > 0;
  return (
    <ShopCard
      label={name}
      state={offer.bought ? "bought" : undefined}
      style={cellRule(index, 3)}
      art={
        <ShopTileArt>
          <TileRender plan={offer.plan} theme={0} renders={renders} />
        </ShopTileArt>
      }
      title={name}
      chip={<RarityBadge rarity={offer.rarity} />}
      note={
        <>
          <span className="numeric">{held}</span> held
        </>
      }
      action={
        offer.bought ? (
          <PriceState>Bought</PriceState>
        ) : (
          <PriceButton label={`Buy ${name} for ${offer.price} Cobbles`} disabled={busy || need > 0} loading={buying} describedBy={reason ? reasonId : undefined} onClick={onBuy}>
            {!buying && (
              <>
                {offer.price}
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
