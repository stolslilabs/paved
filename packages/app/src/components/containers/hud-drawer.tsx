import type { ReactNode } from "react";
import { useSidePanel } from "../../lib/side-panel";
import { cn } from "../../lib/utils";
import { UiIcon } from "../elements/ui-icon";
import { Icon } from "../ui/icon";
import { ScrollRegion } from "../ui/scroll-region";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from "../ui/sheet";

/** From `tablet` (theme.css `--breakpoint-tablet`): the drawer is a side panel docked at the left, never a page stretched past a phone's width. */
const SIDE_QUERY = "(min-width: 40rem)";

/** The surface, both ways: the face's charcoal under the notch's safe area, the Sheet's padding and gap off. */
const SURFACE = "gap-0 bg-secondary p-0 pt-[env(safe-area-inset-top)] text-foreground";
/** The phone's page: the whole screen, no edge, no shadow. */
const PAGE = "w-full border-0 shadow-none sm:max-w-none";
/**
 * The side panel (direction C of 2026-11-03, its edge A's): the window's height, one straight hairline along its right side and the
 * Sheet's shadow over the village, no rounded end.
 */
const SIDE = "w-[28rem] max-w-full border-input sm:max-w-full";

/** The header's control, Back or the close: a 44 px target at its top line's end. */
const CONTROL = "state-layer absolute top-2.5 grid size-11 cursor-pointer place-items-center rounded-full outline-none";

export interface HudDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The title on its top line: the drawer's accessible name. */
  title: ReactNode;
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
 * sliding in from the right; from `tablet` a side panel docked at the left edge, 28 rem wide (the page panels' width), the window's
 * height, as a shadcn Sheet (the asks of 2026-11-03: side panels, not a floating window; the game-native direction C, a straight edge
 * as A's), its close the red cross. Both in the face's charcoal, the header a darker band, the title centred on its top line in the
 * display font (the owner's ask of 2026-11-04: titles in it).
 * DOCK-UNDER-PAGES (the owner's ask of 2026-11-04): the home's dock stays under both, covered by the phone's page, veiled and blurred
 * beside the side panel; the body ends at the screen's foot, its safe area under its last line.
 * Inside, the phone's layout whatever the width (`data-page-panel`). The village beside the side panel is veiled lightly and blurred,
 * Escape or a tap on it closing the drawer. It takes the focus itself as it opens. The slide is the Sheet's (Motion).
 */
export function HudDrawer({ open, onOpenChange, title, returnFocus, slot = "hud-drawer", className, children }: HudDrawerProps) {
  const side = useSidePanel(SIDE_QUERY);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={side ? "left" : "right"}
        closeButton={false}
        aria-describedby={undefined}
        data-page-panel=""
        data-hud-drawer={slot}
        overlayClassName="drawer-veil backdrop-blur-sm"
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
        <SheetHeader className="drawer-band relative shrink-0 items-center px-14 pt-5 pb-4">
          <SheetTitle className="text-outline text-center font-display text-2xl leading-tight tracking-wide">{title}</SheetTitle>
          {side ? (
            <SheetClose data-slot="hud-drawer-close" className={cn(CONTROL, "right-2")}>
              <UiIcon name="close" px={36} className="drawer-icon size-9" />
              <span className="sr-only">Close</span>
            </SheetClose>
          ) : (
            <SheetClose data-slot="hud-drawer-back" className={cn(CONTROL, "left-2")}>
              <Icon name="chevron-left" className="drawer-icon" />
              <span className="sr-only">Back</span>
            </SheetClose>
          )}
        </SheetHeader>
        <ScrollRegion data-hud-drawer-body="" className="flex min-h-0 flex-1 flex-col gap-3 overscroll-contain px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {children}
        </ScrollRegion>
      </SheetContent>
    </Sheet>
  );
}
