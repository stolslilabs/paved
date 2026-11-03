import { useLayoutEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useSidePanel } from "../../lib/side-panel";
import { cn } from "../../lib/utils";
import { UiIcon } from "../elements/ui-icon";
import { ScrollRegion } from "../ui/scroll-region";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from "../ui/sheet";

/** From `tablet` (theme.css `--breakpoint-tablet`): the drawer is a side panel docked at the left, never a sheet stretched past a phone's width. */
const SIDE_QUERY = "(min-width: 40rem)";

/** The HUD's end its opener sees (`--hud-end`, the home's, under its capsules), in CSS px; none outside the home. */
function hudEnd(el: HTMLElement | null | undefined): number | undefined {
  const end = el ? Number.parseFloat(getComputedStyle(el).getPropertyValue("--hud-end")) : Number.NaN;
  return Number.isFinite(end) ? end : undefined;
}

/** Where the drawer's top stops with no HUD measured: under the safe area and a page's header. */
const DEFAULT_TOP = "calc(max(0.5rem, env(safe-area-inset-top)) + var(--header-h))";

/** The phone's drawer: the Sheet's own surface off, the HUD's frame drawing it (its layers under the content). */
const FRAME = "isolate gap-0 border-0 bg-transparent p-0 text-foreground shadow-none";
/**
 * The side panel (direction C of 2026-11-03, its edge A's): the window's height, the face's charcoal, one straight hairline along its
 * right side and the Sheet's shadow over the village, no rounded end; its header a band of its own.
 */
const SIDE = "gap-0 border-input bg-secondary p-0 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-foreground w-[28rem] max-w-full sm:max-w-full";

/** The drawer runs this far past the screen's foot, so its frame's bottom edge stays out of sight. */
const BLEED = "1.5rem";

/** The frame's corner, in CSS px: the player card's 13 a little larger. */
const FRAME_PX = 16;

export interface HudDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The title on its top line: the drawer's accessible name. */
  title: ReactNode;
  /**
   * How far down the drawer's top stays, in CSS px from the viewport's top, so what is above it stays in view. Left out: the HUD's end
   * its opener (`returnFocus`) sees as it opens (`--hud-end`, which the home sets under its capsules), else under the safe area and a
   * page's header.
   */
  top?: number;
  /** Where the focus goes back on close, when the opener is not a Radix trigger: the opener, whose HUD's end the drawer reads. */
  returnFocus?: () => HTMLElement | null;
  /** The drawer's own test hook and styles' handle (`data-slot`). */
  slot?: string;
  className?: string;
  children: ReactNode;
}

/**
 * The HUD's drawer (PROFILE-DRAWER, the owner's direction of 2026-11-02 and the profile's mockup, `docs/design/profile.webp`): what a
 * HUD control opens over the village, one layout at every width. On a phone it rises from the bottom and never past the HUD's end
 * (`top`), so the player card and the capsules stay in view; it hugs its content and scrolls past that height. From `tablet` it is a
 * side panel docked at the left edge, 28 rem wide (the page panels' width), the window's height, as a shadcn Sheet (the owner's asks
 * of 2026-11-03: side panels, not a floating window; the game-native direction C, a straight edge as A's), its header a darker band. On a
 * phone, in the HUD's frame, as the player card and the balances (a near-black outline, a grey rim; greys, not the mockup's blue), its
 * rim meeting the screen's edges.
 * The title centred on its top line, the red close at its right; the phone's grab bar (drag it down to close).
 * Inside, the phone's layout whatever the width (`data-page-panel`). The village behind it is veiled lightly and blurred, Escape or a
 * tap on it closing the drawer; on a phone the HUD above the drawer may stand over the veil (`data-over-drawer`, theme.css). It takes the focus
 * itself as it opens. The slide is the Sheet's (Motion).
 */
export function HudDrawer({ open, onOpenChange, title, top, returnFocus, slot = "hud-drawer", className, children }: HudDrawerProps) {
  const side = useSidePanel(SIDE_QUERY);
  // The HUD's end, read from the opener each time the drawer opens (before it paints).
  const [end, setEnd] = useState<number | undefined>(undefined);
  useLayoutEffect(() => {
    if (open) setEnd(hudEnd(returnFocus?.()));
  }, [open, returnFocus]);
  const at = top ?? end;
  const style = { "--drawer-top": at === undefined ? DEFAULT_TOP : `${Math.round(at)}px` } as CSSProperties;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={side ? "left" : "bottom"}
        closeButton={false}
        aria-describedby={undefined}
        data-page-panel=""
        data-hud-drawer={slot}
        overlayClassName="drawer-veil backdrop-blur-sm"
        // The focus on the drawer itself as it opens, not on its close; Tab reaches it next.
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
        // The phone's drawer hugs its content up to the HUD's end, its foot past the screen's; the side panel is the window's height.
        style={side ? undefined : { ...style, bottom: `-${BLEED}`, paddingBottom: `calc(${BLEED} + env(safe-area-inset-bottom))`, maxHeight: `calc(100dvh - var(--drawer-top) + ${BLEED})` }}
        className={cn(side ? SIDE : FRAME, className)}
      >
        {/* On a phone, the HUD's frame (`hud-frame`, the player card's and the balances'), its rim meeting the screen's sides, its foot past the screen's. */}
        {!side && (
          <span aria-hidden className="pointer-events-none absolute inset-0 -z-10" style={{ "--hud-px": FRAME_PX } as CSSProperties}>
            <span className="hud-face absolute bg-secondary" />
            <span className="hud-frame absolute inset-0" />
          </span>
        )}
        <SheetHeader className={cn("relative shrink-0 items-center px-14 pt-5", side ? "drawer-band pb-4" : "pb-1")}>
          <SheetTitle className="text-outline text-center text-2xl leading-tight font-black">{title}</SheetTitle>
          <SheetClose
            data-slot="hud-drawer-close"
            className="state-layer absolute top-2.5 right-2 grid size-11 cursor-pointer place-items-center rounded-full outline-none"
          >
            <UiIcon name="close" px={36} className="drawer-icon size-9" />
            <span className="sr-only">Close</span>
          </SheetClose>
        </SheetHeader>
        <ScrollRegion data-hud-drawer-body="" className={cn("flex min-h-0 flex-1 flex-col gap-3 overscroll-contain px-4 pb-4", side ? "pt-4" : "pt-2")}>
          {children}
        </ScrollRegion>
      </SheetContent>
    </Sheet>
  );
}
