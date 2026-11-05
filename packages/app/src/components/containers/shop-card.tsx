import { type CSSProperties, type ReactNode } from "react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";

/**
 * SHOP-PAGE (the Paved UX Book's Shop: "Tiles, Cobbles and Themes as tabs of one shop, one card style"): the one card of the three
 * tabs, a tile of the day, a pack of Cobbles, a theme's tile. Its art on top, its name (two lines at most), what it is (a chip) and a
 * line under it, then its price's button. Cards stand in a carved panel (`ShopGrid`), a faint rule between them, as the book draws
 * them; the styles that are the Shop's alone are inline, on the theme's tokens, so the one stylesheet does not grow.
 */
export interface ShopCardProps {
  /** The art: a tile's render, a pack's stones. */
  art: ReactNode;
  /** The art's box when it is not the tiles' square (a pack's pile, wider than tall). */
  artStyle?: CSSProperties;
  title: ReactNode;
  /** The title's type, in place of the tiles' name (two lines of bold text at most): a pack's figure, large and on one line. */
  titleClassName?: string;
  /** What it is, under the name: a tile's rarity. */
  chip?: ReactNode;
  /** A line under it: the tiles held. */
  note?: ReactNode;
  /** The price's button, or what replaces it (Bought, Owned). */
  action: ReactNode;
  /** Why the price's button is off (short of Cobbles): under it, the button described by it. */
  reason?: ReactNode;
  /** A card of the row has a reason: this one keeps its line too, empty, so the row's price buttons stand on one line. */
  reserveReason?: boolean;
  /** A mark over the art's corner (a theme tile's models). */
  badge?: ReactNode;
  selected?: boolean;
  /** Its name in the list (a tile's), and its state (a theme tile's: none, owned, active), for a reader and the tests. */
  label?: string;
  state?: string;
  /** Its rules in the panel (`cellRule`). */
  style?: CSSProperties;
  className?: string;
}

export function ShopCard({ art, artStyle, title, titleClassName, chip, note, action, reason, reserveReason, badge, selected, label, state, style, className }: ShopCardProps) {
  return (
    <li data-slot="shop-card" aria-label={label} data-state={state} data-selected={selected || undefined} style={style} className={cn("flex min-w-0 flex-col items-center gap-1 px-1.5 pt-2 pb-2.5 text-center", className)}>
      <span className="relative block aspect-square w-full max-w-28" style={artStyle}>
        {art}
        {badge}
      </span>
      <span className={cn("text-outline font-bold", titleClassName ?? "line-clamp-2 text-base leading-tight wrap-break-word")}>{title}</span>
      {chip}
      {note && <span className="text-xs font-semibold text-muted-foreground">{note}</span>}
      <span className="mt-auto flex w-full flex-col items-center gap-1 pt-1">
        {action}
        {reason ? <span className="text-xs text-warning">{reason}</span> : reserveReason && <span aria-hidden className="text-xs">&nbsp;</span>}
      </span>
    </li>
  );
}

/**
 * A tile's render fades into the panel at its edges: the build-time renders (`scripts/render-tiles.ts`) stand on an opaque navy
 * backdrop, where the book's tiles float on the panel. Any opaque colour masks alike: the background's token.
 */
const FADE: CSSProperties = { maskImage: "radial-gradient(closest-side, var(--background) 78%, transparent)" };
/** The render's tile fills about two thirds of its square: drawn larger, as the book's, its margin cut by the fade. */
const LARGER: CSSProperties = { transform: "scale(1.3)" };

/** A tile's art in a card: its render (`TileRender`), larger and faded at its edges, clipped to its box (what the fade hides takes no room). */
export function ShopTileArt({ children }: { children: ReactNode }) {
  return (
    <span className="block size-full overflow-hidden" style={FADE}>
      <span className="block size-full" style={LARGER}>
        {children}
      </span>
    </span>
  );
}

/**
 * The price's button, raised (the owner's choice "C" of 2026-11-05 over the book's blue: the drawer's raised grey, what presses is
 * raised): the drawer's tile face lit along its top, its near-black outline and lip, the hover and press layers over it.
 */
const PRICE: CSSProperties = {
  backgroundImage: "linear-gradient(var(--layer, transparent), var(--layer, transparent)), linear-gradient(var(--drawer-raised), var(--secondary))",
  boxShadow: "inset 0 1px 0 var(--drawer-bevel), 0 0 0 1px var(--hud-outline), 0 2px 0 1px var(--hud-outline)",
};
/** The pack picked: its price ringed in the primary gold, over its lip. */
const PICKED: CSSProperties = { ...PRICE, boxShadow: "inset 0 1px 0 var(--drawer-bevel), 0 0 0 2px var(--primary), 0 2px 0 2px var(--hud-outline)" };

export interface PriceButtonProps {
  /** The price and its token, as the book writes it ("20" and the Cobble). */
  children: ReactNode;
  /** The button's whole name ("Buy Tile 2 for 20 Cobbles"). */
  label: string;
  disabled?: boolean;
  loading?: boolean;
  /** The pack picked: its button pressed. */
  pressed?: boolean;
  /** The reason it is off, by id (`ShopCard`'s `reason`). */
  describedBy?: string;
  onClick?: () => void;
  className?: string;
}

/**
 * A price's button (SHOP-PAGE): the figure and its token's icon, outlined, on the raised grey; dimmed while it cannot be pressed
 * (short, another purchase on its way). 44 px tall, the card's width.
 */
export function PriceButton({ children, label, disabled, loading, pressed, describedBy, onClick, className }: PriceButtonProps) {
  return (
    <Button
      data-slot="price-button"
      variant="ghost"
      aria-label={label}
      aria-pressed={pressed}
      aria-describedby={describedBy}
      disabled={disabled}
      loading={loading}
      onClick={onClick}
      style={pressed ? PICKED : PRICE}
      className={cn("numeric text-outline h-11 w-full max-w-32 gap-1.5 rounded-xl px-2 text-lg font-bold", className)}
    >
      {children}
    </Button>
  );
}

/** A state in the price's place (the book's Bought), carved: it informs, it does not press. */
export function PriceState({ children }: { children: ReactNode }) {
  return <span className="drawer-carved text-outline flex h-11 w-full max-w-32 items-center justify-center gap-1.5 rounded-xl px-2 text-base font-bold text-muted-foreground">{children}</span>;
}

/** The faint rule between the cards of a panel, the book's: a line of the bevel's grey, half see-through. */
const RULE = "1px solid color-mix(in oklab, var(--drawer-bevel) 45%, transparent)";

/** The style of the card at `index` in a grid of `columns`: a rule on its left after the first column, on its top after the first row. */
export function cellRule(index: number, columns: number): CSSProperties {
  return { borderLeft: index % columns > 0 ? RULE : undefined, borderTop: index >= columns ? RULE : undefined };
}

/**
 * The carved panel of a tab's cards (the book's rounded panel): `columns` a row, the rules between them (`cellRule`, given to each
 * card by the caller as `style`). A list: its name says what it holds.
 */
export function ShopGrid({ label, columns, className, children }: { label: string; columns: 2 | 3; className?: string; children: ReactNode }) {
  return (
    <ul aria-label={label} className={cn("drawer-carved grid rounded-2xl px-1 py-1", columns === 3 ? "grid-cols-3" : "grid-cols-2", className)}>
      {children}
    </ul>
  );
}
