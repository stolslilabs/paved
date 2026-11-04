import type { ReactNode } from "react";
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
 * The title's start after Back: the chevron sits in the middle of its 44 px target, so the visible gap is counted from the glyph, about
 * 12 px (the owner's ask of 2026-11-04), as the pages' header's (`PageHeader`).
 */
const TITLE_AFTER_BACK = "-ml-2";

/** The header's control, Back or the close: a 44 px target at its top line's end. */
const CONTROL = "state-layer grid size-11 cursor-pointer place-items-center rounded-full outline-none";

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
  /** What the header holds at its outer end, opposite its control (the page's balance: the Missions' Cobbles). */
  end?: ReactNode;
  /** A press outside it (the Missions': on a dialog over it, the Cobbles' packs). Prevented, the drawer stays open. */
  onInteractOutside?: (event: Event) => void;
  /** Where the focus goes back on close, when the opener is not a Radix trigger. */
  returnFocus?: () => HTMLElement | null;
  /** The drawer's own test hook and styles' handle (`data-slot`). */
  slot?: string;
  className?: string;
  children: ReactNode;
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
export function HudDrawer({ open, onOpenChange, title, side: edge = "left", end, onInteractOutside, returnFocus, slot = "hud-drawer", className, children }: HudDrawerProps) {
  const side = useSidePanel(SIDE_QUERY);
  // The phone's Back at the top left, the title right after it; the side panel's close at the header's right end, after what the page
  // shows there (the owner's ask of 2026-11-04: the title on the left, the balance at the top right).
  const control = side ? (
    <SheetClose data-slot="hud-drawer-close" className={CONTROL}>
      <UiIcon name="close" px={36} className="drawer-icon size-9" />
      <span className="sr-only">Close</span>
    </SheetClose>
  ) : (
    <SheetClose data-slot="hud-drawer-back" className={CONTROL}>
      <Icon name="chevron-left" className="drawer-icon" />
      <span className="sr-only">Back</span>
    </SheetClose>
  );
  const ends = end ? <span data-slot="hud-drawer-end" className="flex min-w-0 items-center">{end}</span> : null;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={side ? edge : "right"}
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
        className={cn(SURFACE, side ? SIDE : PAGE, className)}
      >
        {/* One row: Back (a phone's), the title on the left, what the page shows at the end, the close (a side panel's) last. */}
        <SheetHeader className="drawer-band flex shrink-0 flex-row items-center gap-1 px-2 py-2.5">
          {!side && control}
          <SheetTitle data-slot="hud-drawer-title" className={cn("text-outline min-w-0 flex-1 truncate text-left font-display text-2xl leading-tight tracking-wide", side ? "pl-2" : TITLE_AFTER_BACK)}>
            {title}
          </SheetTitle>
          {ends}
          {side && control}
        </SheetHeader>
        {/* Down only: what glows past the content's edge (a waiting gift's halo at a row's end) is cut at the drawer's, never scrolled to. */}
        <ScrollRegion data-hud-drawer-body="" className="flex min-h-0 flex-1 flex-col gap-3 overflow-x-hidden overscroll-contain px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {children}
        </ScrollRegion>
      </SheetContent>
    </Sheet>
  );
}
