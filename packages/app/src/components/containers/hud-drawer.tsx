import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useSidePanel } from "../../lib/side-panel";
import { cn } from "../../lib/utils";
import { UiIcon } from "../elements/ui-icon";
import { Icon } from "../ui/icon";
import { ScrollRegion } from "../ui/scroll-region";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from "../ui/sheet";

/** From `tablet` (theme.css `--breakpoint-tablet`): the drawer is a side panel docked at its edge, never a page stretched past a phone's width. */
const SIDE_QUERY = "(min-width: 40rem)";

/** The surface, both ways: the face's charcoal under the notch's safe area, the Sheet's padding and gap off. */
const SURFACE = "gap-0 bg-secondary p-0 pt-[env(safe-area-inset-top)] text-foreground";
/** The phone's page: the whole screen, no edge, no shadow. */
const PAGE = "w-full border-0 shadow-none sm:max-w-none";
/**
 * The side panel (direction C of 2026-11-03, its edge A's): the window's height, one straight hairline along its inner side (the
 * Sheet's, by its side) and the Sheet's shadow over the village, no rounded end.
 */
const SIDE = "w-[28rem] max-w-full border-input sm:max-w-full";
/**
 * The phone's sheet (`phone="sheet"`, FRIENDS-PAGE: a player's profile, the book's "full-width sheet" over the page that opened it): the
 * screen's width, as tall as its content up to 92 % of the screen, its top rounded, the Sheet's grab bar over its band.
 */
const SHEET = "max-h-[92dvh] w-full overflow-hidden rounded-t-2xl border-input pt-0";

/**
 * The title's start after Back: the chevron sits in the middle of its 44 px target, so the visible gap is counted from the glyph, about
 * 12 px (the owner's ask of 2026-11-04), as the pages' header's (`PageHeader`).
 */
const TITLE_AFTER_BACK = "-ml-2";

/** The header's control, Back or the close: a 44 px target at its top line's end. */
const CONTROL = "state-layer grid size-11 cursor-pointer place-items-center rounded-full outline-none";

/** A view a page draws in the drawer's body in its own place: its title on the header, its Back to what it covers. */
interface DrawerView {
  title: string;
  onBack: () => void;
}

const DrawerViewContext = createContext<((view: DrawerView | null) => void) | null>(null);

/**
 * A view a page opens in the drawer, in its place (GUILD-PAGE, the owner's ask of 2026-11-05: what a page opens beyond itself opens in
 * its drawer, never a sheet over it; Back goes back, the red cross or a tap on the village leaves): while `title` is set, the header
 * shows it, with Back calling `onBack`. Null: the page's own title. Returns whether a drawer holds it (outside one, the caller draws its
 * own Back).
 */
export function useDrawerView(title: string | null, onBack: () => void): boolean {
  const set = useContext(DrawerViewContext);
  const back = useRef(onBack);
  useLayoutEffect(() => {
    back.current = onBack;
  });
  useLayoutEffect(() => {
    if (!set || title === null) return;
    set({ title, onBack: () => back.current() });
    return () => set(null);
  }, [set, title]);
  return set !== null;
}

export interface HudDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The title on its top line: the drawer's accessible name. */
  title: ReactNode;
  /**
   * The edge the side panel docks at from `tablet`, the side of the HUD control that opens it: the left for the profile (the player
   * card's), the right for the right column's pages (Missions). The phone's page slides in from the right either way.
   */
  side?: "left" | "right";
  /**
   * What it is on a phone: a full page with Back (`page`, the default), or a sheet from the bottom with the red close (`sheet`,
   * FRIENDS-PAGE: another player's profile and the blocked players, over the page that opened them, as the book draws the first).
   */
  phone?: "page" | "sheet";
  /** What the header holds at its outer end, opposite its control (the page's balance: the Missions' Cobbles). */
  end?: ReactNode;
  /**
   * A view of the page drawn in its place (SHOP-PAGE: a theme's tiles, never a sheet over the drawer; a page's own views can also say
   * so with `useDrawerView`): its Back at the header's start at every width, back to the page, and the red cross at its end, the side
   * panel's and the phone's alike (the owner's ask of 2026-11-05: on a phone too, the cross leaves at once).
   */
  onBack?: () => void;
  /** A press outside it (the Missions': on a dialog over it, the Cobbles' packs). Prevented, the drawer stays open. */
  onInteractOutside?: (event: Event) => void;
  /** Where the focus goes back on close, when the opener is not a Radix trigger. */
  returnFocus?: () => HTMLElement | null;
  /** The drawer's own test hook and styles' handle (`data-slot`). */
  slot?: string;
  className?: string;
  children: ReactNode;
}

/** A view's own Back and title, for a page drawn outside a drawer (its stories, a test): in a drawer the header holds them. */
export function ViewHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex min-w-0 items-center gap-1">
      <button type="button" onClick={onBack} className={cn(CONTROL, "shrink-0")}>
        <Icon name="chevron-left" />
        <span className="sr-only">Back</span>
      </button>
      <h2 className="text-outline min-w-0 text-xl leading-tight font-bold wrap-anywhere">{title}</h2>
    </div>
  );
}

/**
 * The HUD's drawer (PROFILE-DRAWER, the owner's direction of 2026-11-02 and the profile's mockup, `docs/design/profile.webp`): what a
 * HUD control opens over the village, one layout at every width. The owner's asks of 2026-11-04: on a phone a full page with Back,
 * sliding in from the right; from `tablet` a side panel docked at the edge of the control that opens it (`side`: the profile's at the
 * left, the Missions' at the right, MISSIONS-PAGE), 28 rem wide (the page panels' width), the window's
 * height, as a shadcn Sheet (the asks of 2026-11-03: side panels, not a floating window; the game-native direction C, a straight edge
 * as A's), its close the red cross at its header's right end. Both in the face's charcoal, the header a darker band, the title on its
 * left in the display font (the owner's asks of 2026-11-04: titles in it, on the left, right after Back on a phone), what the page
 * shows at the header's end (`end`: the Missions' Cobbles, the HUD's balance the right panel covers, its claims' bursts' target).
 * DOCK-UNDER-PAGES (the owner's ask of 2026-11-04): the home's dock stays under both, covered by the phone's page, veiled and blurred
 * beside the side panel; the body ends at the screen's foot, its safe area under its last line.
 * Inside, the phone's layout whatever the width (`data-page-panel`). The village beside the side panel is veiled lightly and blurred,
 * Escape or a tap on it closing the drawer. It takes the focus itself as it opens. The slide is the Sheet's (Motion).
 */
export function HudDrawer({ open, onOpenChange, title, side: edge = "left", phone = "page", end, onBack, onInteractOutside, returnFocus, slot = "hud-drawer", className, children }: HudDrawerProps) {
  const wide = useSidePanel(SIDE_QUERY);
  // A phone's sheet closes as the side panel does: its red cross at the header's end.
  const sheet = !wide && phone === "sheet";
  const side = wide || sheet;
  // A view a page opened in its place (`useDrawerView`): its title and its Back, over the drawer's own.
  const [view, setView] = useState<DrawerView | null>(null);
  const toBack = view?.onBack ?? onBack;
  // The phone's Back at the top left, the title right after it; the side panel's close at the header's right end, after what the page
  // shows there (the owner's ask of 2026-11-04: the title on the left, the balance at the top right).
  const close = (
    <SheetClose data-slot="hud-drawer-close" className={CONTROL}>
      <UiIcon name="close" px={36} className="drawer-icon size-9" />
      <span className="sr-only">Close</span>
    </SheetClose>
  );
  const control = side ? (
    close
  ) : (
    <SheetClose data-slot="hud-drawer-back" className={CONTROL}>
      <Icon name="chevron-left" className="drawer-icon" />
      <span className="sr-only">Back</span>
    </SheetClose>
  );
  const back = toBack && (
    <button type="button" data-slot="hud-drawer-back" className={CONTROL} onClick={toBack}>
      <Icon name="chevron-left" className="drawer-icon" />
      <span className="sr-only">Back</span>
    </button>
  );
  const ends = end ? <span data-slot="hud-drawer-end" className="flex min-w-0 items-center">{end}</span> : null;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={wide ? edge : sheet ? "bottom" : "right"}
        closeButton={false}
        aria-describedby={undefined}
        data-page-panel=""
        data-hud-drawer={slot}
        overlayClassName="drawer-veil backdrop-blur-sm"
        onInteractOutside={onInteractOutside}
        // The focus on the drawer itself as it opens, not on its Back or close; Tab reaches them next.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement | null)?.focus();
        }}
        onCloseAutoFocus={(e) => {
          const target = returnFocus?.();
          if (!target) return;
          e.preventDefault();
          target.focus();
        }}
        className={cn(SURFACE, wide ? SIDE : sheet ? SHEET : PAGE, className)}
      >
        {/* One row: Back (a phone's, or a view's), the title on the left, what the page shows at the end, the close (a side panel's, or a view's) last. */}
        <SheetHeader className="drawer-band flex shrink-0 flex-row items-center gap-1 px-2 py-2.5">
          {back || (!side && control)}
          <SheetTitle data-slot="hud-drawer-title" className={cn("text-outline min-w-0 flex-1 truncate text-left font-display text-2xl leading-tight tracking-wide", side && !back ? "pl-2" : TITLE_AFTER_BACK)}>
            {view?.title ?? title}
          </SheetTitle>
          {ends}
          {(side || back) && close}
        </SheetHeader>
        {/* Down only: what glows past the content's edge (a waiting gift's halo at a row's end) is cut at the drawer's, never scrolled to. */}
        <ScrollRegion data-hud-drawer-body="" className="flex min-h-0 flex-1 flex-col gap-3 overflow-x-hidden overscroll-contain px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <DrawerViewContext.Provider value={setView}>{children}</DrawerViewContext.Provider>
        </ScrollRegion>
      </SheetContent>
    </Sheet>
  );
}
