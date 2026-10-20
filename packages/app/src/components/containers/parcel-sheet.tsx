import { useSidePanel } from "../../lib/side-panel";
import { cn } from "../../lib/utils";
import { Cobbles } from "../elements/cobbles";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "../ui/sheet";
import { cellName } from "./village-board";
import { MAX_CELLS, type Cell } from "./village-rules";

/** The next parcel (#640): its price in Cobbles and the level it needs (#641). Cobbles alone cannot buy past the level. */
export interface ParcelOffer {
  price: number;
  level: number;
}

/** Why a parcel can or cannot be bought now. */
export type ParcelState = "ready" | "level" | "cobbles" | "full";

export function parcelState(offer: ParcelOffer | null, level: number, cobbles: number, cells: number): ParcelState {
  if (!offer || cells >= MAX_CELLS) return "full";
  if (level < offer.level) return "level";
  if (cobbles < offer.price) return "cobbles";
  return "ready";
}

export interface ParcelSheetProps {
  /** The parcel chosen on the board; null: closed. */
  cell: Cell | null;
  offer: ParcelOffer | null;
  /** The player's level and Cobbles, and the village's cell count. */
  level: number;
  cobbles: number;
  cells: number;
  /** The purchase on its way. */
  buying?: boolean;
  onBuy?: (cell: Cell) => void;
  onClose?: () => void;
  /** Short of Cobbles: the packs (#621). */
  onGetCobbles?: () => void;
}

/**
 * Buying a parcel (#646): the cell, its price, and the level gate. Under the level the price is shown but Buy is off with
 * "Level 5 needed"; short of Cobbles, the shortfall and a way to the packs; at 38 cells, the village is full. A bottom
 * sheet on a phone, a side panel from `tablet` up.
 */
export function ParcelSheet({ cell, offer, level, cobbles, cells, buying, onBuy, onClose, onGetCobbles }: ParcelSheetProps) {
  const wide = useSidePanel();
  const state = parcelState(offer, level, cobbles, cells);
  return (
    <Sheet open={cell != null} onOpenChange={(open) => !open && onClose?.()}>
      <SheetContent side={wide ? "right" : "bottom"} className={wide ? "w-full max-w-sm" : "pb-[max(1.5rem,env(safe-area-inset-bottom))]"}>
        <SheetHeader className="pr-10">
          <SheetTitle className="font-display text-lg">Parcel</SheetTitle>
          <SheetDescription>{cell ? `The cell ${cellName(cell)}, next to your village.` : ""}</SheetDescription>
        </SheetHeader>
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Price</dt>
          <dd className="justify-self-end">{offer ? <Cobbles value={offer.price} /> : "—"}</dd>
          <dt className="text-muted-foreground">Level</dt>
          <dd className={cn("justify-self-end", state === "level" ? "text-warning" : "text-foreground")}>
            <span className="numeric">{level}</span>
            {offer && (
              <>
                {" "}
                / <span className="numeric">{offer.level}</span> needed
              </>
            )}
          </dd>
          <dt className="text-muted-foreground">Cells</dt>
          <dd className="justify-self-end">
            <span className="numeric">
              {cells}/{MAX_CELLS}
            </span>
          </dd>
        </dl>
        {state === "level" && offer && (
          <p role="status" className="flex items-center gap-2 rounded-lg bg-secondary p-3 text-sm">
            <Icon name="lock" size="sm" className="text-warning" />
            <span>
              Level <span className="numeric">{offer.level}</span> needed. Play games to level up: Cobbles alone cannot buy it.
            </span>
          </p>
        )}
        {state === "cobbles" && offer && (
          <p role="status" className="flex items-center gap-2 rounded-lg bg-secondary p-3 text-sm">
            <Icon name="cubes-stacked" size="sm" className="text-warning" />
            <span>
              Need <span className="numeric">{offer.price - cobbles}</span> more Cobbles.
            </span>
          </p>
        )}
        {state === "full" && (
          <p role="status" className="rounded-lg bg-secondary p-3 text-sm">
            Your village holds <span className="numeric">{MAX_CELLS}</span> cells, the most it can.
          </p>
        )}
        <SheetFooter>
          {state === "level" && offer ? (
            <Button disabled className="w-full">
              <Icon name="lock" size="sm" /> Level {offer.level} needed
            </Button>
          ) : state === "cobbles" ? (
            <Button variant="outline" className="w-full" onClick={onGetCobbles}>
              Get Cobbles
            </Button>
          ) : state === "ready" && offer && cell ? (
            <Button className="w-full" loading={buying} onClick={() => onBuy?.(cell)} aria-label={`Buy this parcel for ${offer.price} Cobbles`}>
              Buy for <Cobbles value={offer.price} size="sm" iconClassName="text-primary-foreground" className="text-primary-foreground" />
            </Button>
          ) : null}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
