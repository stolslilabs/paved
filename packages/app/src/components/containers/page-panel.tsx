import { useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { pageScrollHintRef } from "../../lib/page-scroll-hint";
import { Sheet, SheetContent, SheetTitle } from "../ui/sheet";
import { PagePanelProvider } from "./page-panel-context";
import { PageRegionProvider } from "./page-region";

export interface PagePanelProps {
  open: boolean;
  /** The page's title: the panel's accessible name (the page's header shows it too). */
  title: string;
  /** A page of the overlay itself, no Back in its header (`PagePanelValue.top`). */
  top?: boolean;
  /** The side it opens from (`PageDef.panelSide`): the right, or the left for the League (#829). */
  side?: "right" | "left";
  /** The close: Escape, a click or a tap on the village (#782: no close button). */
  onClose: () => void;
  children: ReactNode;
}

/**
 * The side panel of the overlay's pages from `desktop` (DESK-PANELS, #762, the owner's decisions of 2026-10-25): the page in a
 * panel 28 rem wide on the right (the League's on the left, #829; the phone's column, `max-w-md`, and its padding), over the home's village, which stays mounted
 * and dimmed behind it. The page is laid out as on a phone: inside the panel the `tablet`, `desktop` and `wide` variants do not
 * apply (`data-page-panel`, theme.css), so each page has one layout. The panel's body is the page's scrolling region (its sticky
 * header, its edge hints), and the page's header carries, where the page's rule shows them, the Cobbles (`header-balances.ts`).
 * PAGES-SCROLL (#782, the owner's decisions of 2026-10-26): the body scrolls whenever the page is taller than the panel, and
 * the panel has no close button: Escape, or a click or a tap on the dimmed village outside it, closes it, and the focus goes
 * back to the overlay's button that opened it. Its title stays its accessible name. The slide is the Sheet's (Motion), still under reduced motion. Its own chunk: the home's first
 * load does not carry the dialog.
 */
export default function PagePanel({ open, title, top = true, side = "right", onClose, children }: PagePanelProps) {
  const value = useMemo(() => ({ top }), [top]);
  // The panel opens with the route, not from a dialog trigger: the element that had the focus as it opened (the overlay's
  // button) takes it back on its close. A layout effect, before the dialog moves the focus into the panel.
  const opener = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (open) opener.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
  }, [open]);
  const refocus = (event: Event) => {
    const el = opener.current;
    if (!el?.isConnected) return;
    event.preventDefault();
    el.focus();
  };
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent
        side={side}
        closeButton={false}
        aria-describedby={undefined}
        data-page-panel=""
        onCloseAutoFocus={refocus}
        className="w-[28rem] max-w-full gap-0 bg-background p-0 text-foreground sm:max-w-none"
      >
        <SheetTitle className="sr-only">{title}</SheetTitle>
        <PagePanelProvider value={value}>
          <div ref={pageScrollHintRef} data-slot="page-scroll" className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
            <PageRegionProvider value>{children}</PageRegionProvider>
          </div>
        </PagePanelProvider>
      </SheetContent>
    </Sheet>
  );
}
