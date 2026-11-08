import type { CSSProperties, ReactNode } from "react";
import { deckSheetCounts, baseDeckPlans, formatNumber, type DeckSheetCounts, type DeckSheetOrder, type PlanType } from "@paved/game-core";
import type { BoardTile } from "@paved/chain";
import type { TileSkins } from "@paved/renderer";
import { useDeckView, type DeckView } from "../../data/deck-view";
import type { AttackCardState, AttackDeckSheet } from "../../lib/attack-deck-sheet";
import { cn } from "../../lib/utils";
import { SectionTitle } from "../elements/section-title";
import { TileChip, UnknownTileChip, planCode, type TileArt } from "../elements/tile-chip";
import { tileName, type TileRenders } from "../elements/tile-render";
import { UiIcon } from "../elements/ui-icon";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { HudDrawer } from "./hud-drawer";

/**
 * The real view's image of a plan (#606): its top-down render in the theme the board draws it in (`skins`, by plan key; the
 * base models without one), then the board's tile art, then none (the chip draws the plan's areas).
 */
export function deckArt(renders: TileRenders | undefined, skins: TileSkins | undefined, tileArt: TileArt | undefined): TileArt | undefined {
  if (!renders && !tileArt) return undefined;
  return (key) => renders?.(skins?.[key] ?? 0, `${key}-top`) ?? renders?.(0, `${key}-top`) ?? tileArt?.(key) ?? null;
}

/**
 * What the page shows, by the game's mode (#613). `counted`: a random draw (Challenge, Training), the deck as a count per
 * plan (`deckSheetCounts`), never its order nor the cards withdrawn at the start. `ordered`: a Story level's fixed draw
 * (`deckSheetOrder`), the next tile first, so the player can plan the level. `attack`: a PvP attack's deck (#789,
 * `attackDeckSheet`), the defender's tiles by plan then the extras drawn at random as unknown cards, never the order.
 */
export type DeckSheetDeck = { mode: "counted"; counts: DeckSheetCounts } | { mode: "ordered"; order: DeckSheetOrder } | { mode: "attack"; attack: AttackDeckSheet };

export interface DeckSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deck: DeckSheetDeck;
  /** Chain plan id of the tile in hand: its plan is marked (counted; the ordered view knows its tile in hand). */
  handPlan?: number | null;
  tileArt?: TileArt;
  /** The build-time renders (`useTileRenders`): the real view draws each plan's top-down render. */
  renders?: TileRenders;
  /** The board's skins (plan key to theme): the real view shows each plan in the theme the board draws it in. */
  skins?: TileSkins;
  /** The real tiles seen from above, or each plan's nine areas (the simplified view); the toggle in the header switches. */
  view?: DeckView;
  onViewChange?: (view: DeckView) => void;
  /**
   * The edge the side panel docks at from `tablet`: the board's left (its tile stack, bottom right, stays free), the scout's right
   * (its deck's corner). A full page with Back on a phone either way.
   */
  edge?: "left" | "right";
  /** A Story level: shows the level's deck presentation again (#593). */
  onPresent?: () => void;
}

/** The gold of the tile in hand (Tiles' chosen tile: the book's wash and the profile's gold ring). */
const CHOSEN = "bg-linear-to-b from-primary/40 to-primary/5 ring-2 ring-medal-1 ring-inset";
/** An attack's next two tiles: the info colour's ring, inline (the one stylesheet keeps no one-off). */
const NEXT: CSSProperties = { boxShadow: "inset 0 0 0 2px var(--info)" };

/** The toggle's view on: the drawer's raised surface (`drawer-raised`), inline over the toggle's own ground. */
const RAISED: CSSProperties = { backgroundColor: "var(--drawer-raised)", boxShadow: "inset 0 1px 0 var(--drawer-bevel), 0 0 0 1px var(--hud-outline), 0 2px 0 1px var(--hud-outline)" };

/** The grid of a section, Tiles' "All tiles": four a row on a carved panel. */
const GRID = "drawer-carved grid grid-cols-4 gap-1 rounded-xl p-1";

/**
 * The deck (#540), in the Tiles page's style (ATTACK-SCOUT, the user's ask of 2026-11-07): the HUD's drawer (a full page with Back on a
 * phone, a side panel from `tablet`), never a sheet over a sheet. At its top a carved band of figures, the tiles left, played and
 * discarded; then the deck's tiles seen from above (each plan's top-down render in the board's skin, or its nine areas: the toggle in
 * the header, #606), four a row on a carved panel. A random draw: one tile per plan, the tiles left of it in the dock's red square, the
 * plan of the tile in hand in Tiles' gold. A Story level: the draw in its order, each tile numbered, the one in hand "Now" (#613). A
 * PvP attack: the village's tiles by plan, then the extras drawn at random as unknown tiles until drawn (#789), the next two ringed.
 * Played and discarded tiles are dimmed and marked. Numbers, not sentences; the sections' titles fixed words (TILE-COUNTS: the band at
 * the top holds the totals).
 */
export function DeckSheet({ open, onOpenChange, deck, handPlan, tileArt, renders, skins, view = "real", onViewChange, edge = "left", onPresent }: DeckSheetProps) {
  const { total, placed, discarded } = deckTotals(deck);
  const real = view === "real";
  const look: CardLook = { art: real ? deckArt(renders, skins, tileArt) : undefined, real };
  return (
    <HudDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Deck"
      side={edge}
      slot="deck"
      end={
        onViewChange && (
          <ToggleGroup
            type="single"
            variant="outline"
            aria-label="Deck view"
            value={view}
            onValueChange={(v) => v && onViewChange(v as DeckView)}
            data-slot="deck-view"
            className="drawer-carved mr-1 gap-0.5 rounded-full p-0.5"
          >
            <ViewItem value="real" label="Real" active={real}>
              <UiIcon name="tile-preview" px={28} className="drawer-icon size-7" />
            </ViewItem>
            <ViewItem value="simple" label="Simplified" active={!real}>
              <UiIcon name="grid" px={28} className="drawer-icon size-7" />
            </ViewItem>
          </ToggleGroup>
        )
      }
    >
      <dl data-testid="deck-summary" aria-label="Deck" className="drawer-carved drawer-rule flex rounded-xl">
        <Figure term="Left" value={total - placed - discarded} art={<UiIcon name="tile-stack" px={24} className="drawer-icon size-6" />} />
        <Figure term="Played" value={placed} art={<UiIcon name="check" px={24} className="drawer-icon size-6" />} />
        <Figure term="Discarded" value={discarded} art={<UiIcon name="discard" px={24} className="drawer-icon size-6" />} />
      </dl>
      <p className="text-sm leading-snug font-semibold text-muted-foreground">{NOTE[deck.mode]}</p>
      {deck.mode === "ordered" ? (
        <OrderedDeck order={deck.order} look={look} view={view} />
      ) : deck.mode === "attack" ? (
        <AttackDeck attack={deck.attack} look={look} view={view} />
      ) : (
        <section aria-labelledby="deck-tiles" className="flex flex-col gap-2">
          <SectionTitle id="deck-tiles">Tiles</SectionTitle>
          <ul aria-label="Tiles" className={GRID} data-testid="deck-plans" data-view={view}>
            {deck.counts.plans.map((plan) => (
              <PlanCell key={plan.plan} plan={plan.plan} total={plan.total} placed={plan.placed} discarded={plan.discarded} hand={handPlan === plan.plan && plan.total - plan.placed - plan.discarded > 0} look={look} />
            ))}
          </ul>
        </section>
      )}
      {onPresent && (
        <button type="button" onClick={onPresent} className="drawer-raised state-layer flex min-h-11 cursor-pointer items-center justify-center gap-2 self-center rounded-full px-4 outline-none">
          <UiIcon name="play" px={24} className="drawer-icon size-6" />
          <span className="text-outline text-base font-bold">Present the level again</span>
        </button>
      )}
    </HudDrawer>
  );
}

/** One line under the figures, the mode's rule. */
const NOTE: Record<DeckSheetDeck["mode"], string> = {
  counted: "Drawn at random: some never come.",
  ordered: "Dealt in this order, the next one first.",
  attack: "The village's tiles, then the extras, in a hidden order.",
};

/** The cards of a deck, and those out of it: played (on the board) and discarded. */
function deckTotals(deck: DeckSheetDeck): { total: number; placed: number; discarded: number } {
  if (deck.mode === "ordered") return { total: deck.order.slots.length, placed: deck.order.placed, discarded: deck.order.discarded };
  if (deck.mode === "attack") return { total: deck.attack.size, placed: deck.attack.placed, discarded: deck.attack.discarded };
  return { total: deck.counts.total, placed: deck.counts.placed, discarded: deck.counts.discarded };
}

/** One of the toggle's two sides: its painted icon alone, raised when it is the view (raised presses, carved informs). */
function ViewItem({ value, label, active, children }: { value: DeckView; label: string; active: boolean; children: ReactNode }) {
  return (
    <ToggleGroupItem value={value} aria-label={label} style={active ? RAISED : undefined} className={cn("size-11 min-w-0 rounded-full border-0 p-0", !active && "opacity-60")}>
      {children}
    </ToggleGroupItem>
  );
}

/** A figure of the band, as Tiles' (`Feature`): its term over its value, the painted icon beside it; dimmed at 0. */
function Figure({ term, value, art }: { term: string; value: number; art: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 basis-0 flex-col items-center gap-0.5 px-0.5 py-2">
      <dt className="text-center text-xs leading-tight font-bold text-muted-foreground">{term}</dt>
      <dd className={cn("flex items-center gap-1.5", value === 0 && "opacity-50")}>
        {art}
        <span className="text-outline text-xl leading-tight font-bold tabular-nums">{formatNumber(value)}</span>
      </dd>
    </div>
  );
}

/** How a tile is drawn: the real view's image (`deckArt`) or the plan's nine areas (the simplified view). */
interface CardLook {
  art?: TileArt;
  real: boolean;
}

/**
 * A tile's face in a cell, as Tiles' grid: seen from above in its rounded box, its shadow under it, scaled a little so the render's
 * backdrop pixel is cut; a null `plan` is a tile not known yet (an attack's extra). `out`: dimmed, played or discarded.
 */
function Face({ plan, look, out }: { plan: number | null; look: CardLook; out: boolean }) {
  return (
    <span data-out={out || undefined} className={cn("block size-full overflow-hidden rounded-md shadow-[0_2px_0_var(--hud-outline)]", out && "opacity-40")}>
      {plan === null ? (
        <UnknownTileChip className="size-full rounded-none border-0" />
      ) : (
        <TileChip plan={plan} art={look.art} view={look.real ? "art" : "areas"} className={cn("size-full rounded-none border-0", look.real && "scale-105")} />
      )}
    </span>
  );
}

/**
 * The copies of a plan among an attack's next two, at the cell's top left: the info colour's square, beside the red count of the
 * tiles left, so that the plan in hand (gold) still tells whether one or two more of it come next.
 */
function Next({ count }: { count: number }) {
  return (
    <span aria-hidden data-slot="deck-next" className="numeric absolute top-0 left-0 grid h-5 min-w-5 place-items-center rounded-[0.3rem] bg-info px-1 text-xs leading-none font-bold text-foreground ring-2 ring-background">
      {count}
    </span>
  );
}

/** The tiles left of a plan, at the cell's top right: the dock's red square, as the book's Collection counts. */
function Left({ count }: { count: number }) {
  return (
    <span aria-hidden data-slot="deck-left" className="numeric absolute top-0 right-0 grid h-5 min-w-5 place-items-center rounded-[0.3rem] bg-dock-badge px-1 text-xs leading-none font-bold text-foreground ring-2 ring-background">
      {count}
    </span>
  );
}

/** A played or discarded tile's mark, at its cell's foot: the HUD's check or bin. */
function OutMark({ discarded }: { discarded: boolean }) {
  return (
    <span aria-hidden className="absolute right-0.5 bottom-0.5 size-6">
      {discarded ? <UiIcon name="discard" px={24} className="drawer-icon block size-full" /> : <UiIcon name="check" px={24} className="drawer-icon block size-full" />}
    </span>
  );
}

/**
 * One plan of a random draw or of the village's tiles: its face, the tiles of it left in the red square (none once every one is out,
 * the face dimmed); the plan of the tile in hand in Tiles' gold, an attack's coming one ringed in blue, and its copies among the next
 * two in the blue square (also when the plan is in hand, whose gold hides the ring). Named in full for screen readers.
 */
function PlanCell({ plan, total, placed, discarded, hand, next = 0, look }: { plan: number; total: number; placed: number; discarded: number; hand: boolean; next?: number; look: CardLook }) {
  const left = total - placed - discarded;
  const label = [`${tileName(plan)}: ${left} of ${total} left`, placed > 0 && `${placed} played`, discarded > 0 && `${discarded} discarded`, hand && "in hand", next > 0 && `${next} coming next`].filter(Boolean).join(", ");
  return (
    <li data-plan={planCode(plan)} data-left={left} data-played={placed} data-discarded={discarded} data-hand={hand || undefined} data-next={next || undefined} aria-label={label} title={label}>
      <span className={cn("relative block aspect-square w-full rounded-lg p-1.5", hand && CHOSEN)} style={next > 0 && !hand ? NEXT : undefined}>
        <Face plan={plan} look={look} out={left === 0} />
        {next > 0 && <Next count={next} />}
        {left > 0 && <Left count={left} />}
      </span>
    </li>
  );
}

const SLOT_LABEL = { placed: "played", discarded: "discarded", hand: "in hand", next: "to come" } as const;

/** A Story level's draw: one numbered tile per card, the first drawn first, each in its position once played (marked, dimmed). */
function OrderedDeck({ order, look, view }: { order: DeckSheetOrder; look: CardLook; view: DeckView }) {
  return (
    <section aria-labelledby="deck-order-title" className="flex flex-col gap-2">
      <SectionTitle id="deck-order-title">Order</SectionTitle>
      <ol aria-label="Order" className={GRID} data-testid="deck-order" data-view={view}>
        {order.slots.map((slot, i) => {
          const out = slot.state === "placed" || slot.state === "discarded";
          const hand = slot.state === "hand";
          return (
            <li key={i} className="flex flex-col items-center" data-plan={slot.code} data-slot-state={slot.state} aria-label={`Tile ${i + 1}, ${SLOT_LABEL[slot.state]}`}>
              <span className={cn("relative block aspect-square w-full rounded-lg p-1.5", hand && CHOSEN)}>
                <Face plan={slot.plan} look={look} out={out} />
                {out && <OutMark discarded={slot.state === "discarded"} />}
              </span>
              <span className={cn("text-outline pb-1 text-xs leading-tight font-bold tabular-nums", !hand && "text-muted-foreground")}>{hand ? "Now" : i + 1}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** The cards of an attack's plan by state. */
const count = (cards: readonly AttackCardState[], state: AttackCardState) => cards.filter((c) => c === state).length;

/** A PvP attack's deck (#789): the defender's tiles by plan, as a random draw's; then the extras, unknown until drawn. */
function AttackDeck({ attack, look, view }: { attack: AttackDeckSheet; look: CardLook; view: DeckView }) {
  const village = attack.size - attack.extras.length;
  return (
    <>
      <section aria-labelledby="deck-village" className="flex flex-col gap-2">
        <SectionTitle id="deck-village">Village</SectionTitle>
        <ul aria-label="Village" className={GRID} data-testid="deck-plans" data-view={view}>
          {attack.plans.map((plan) => (
            <PlanCell
              key={plan.plan}
              plan={plan.plan}
              total={plan.cards.length}
              placed={count(plan.cards, "placed")}
              discarded={count(plan.cards, "discarded")}
              hand={plan.cards.includes("hand")}
              next={count(plan.cards, "next")}
              look={look}
            />
          ))}
        </ul>
      </section>
      {attack.extras.length > 0 && (
        <section aria-labelledby="deck-extras-title" className="flex flex-col gap-2">
          <SectionTitle id="deck-extras-title">Extras</SectionTitle>
          <ul aria-label="Extras" className={GRID} data-testid="deck-extras">
            {attack.extras.map((card, i) => {
              const out = card.state === "placed" || card.state === "discarded";
              const hand = card.state === "hand";
              const name = card.plan === null ? "Unknown tile" : tileName(card.plan);
              return (
                <li key={i} data-plan={card.plan === null ? undefined : planCode(card.plan)} data-card-state={card.state} aria-label={`${name}, ${card.state === "left" ? "not drawn" : SLOT_LABEL[card.state]}`}>
                  <span className={cn("relative block aspect-square w-full rounded-lg p-1.5", hand && CHOSEN)} style={card.state === "next" ? NEXT : undefined}>
                    <Face plan={card.plan} look={look} out={out} />
                    {out && <OutMark discarded={card.state === "discarded"} />}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}

/**
 * The deck on the board's tiles: what the board opens from the tile stack, and the scout from its deck. Its own chunk (`BoardScene` and
 * the scout import it on demand). With a PvP attack's deck (`attack`, #789), the defender's tiles and the extras; with a Story level's
 * `order`, the draw in its order; otherwise the game's deck (`plans`: a Puzzle day's 38 cards; the base deck when left out) counted
 * against the board and the discards. The view is the device's
 * (`useDeckView`), kept across games.
 */
export default function BoardDeckSheet({
  open,
  onOpenChange,
  tiles,
  discardedPlans,
  order,
  attack,
  handPlan,
  tileArt,
  renders,
  skins,
  edge,
  onPresent,
  plans,
}: Pick<DeckSheetProps, "open" | "onOpenChange" | "handPlan" | "tileArt" | "renders" | "skins" | "edge" | "onPresent"> & {
  tiles: readonly BoardTile[];
  discardedPlans?: readonly number[];
  order?: DeckSheetOrder;
  attack?: AttackDeckSheet;
  plans?: readonly PlanType[];
}) {
  const deck: DeckSheetDeck = attack
    ? { mode: "attack", attack }
    : order
      ? { mode: "ordered", order }
      : { mode: "counted", counts: deckSheetCounts(plans ?? baseDeckPlans(), tiles.map((t) => t.plan), discardedPlans) };
  const [view, setView] = useDeckView();
  return (
    <DeckSheet
      open={open}
      onOpenChange={onOpenChange}
      deck={deck}
      handPlan={handPlan}
      tileArt={tileArt}
      renders={renders}
      skins={skins}
      view={view}
      onViewChange={setView}
      edge={edge}
      onPresent={onPresent}
    />
  );
}
