import { useEffect } from "react";
import { cn } from "../../lib/utils";
import { documentScrollStartHint } from "../../lib/document-scroll-hint";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { BalancesSlot } from "./balances-context";
import { MockMarkSlot } from "./mock-mark";
import { usePagePanel } from "./page-panel-context";
import { PanelClose } from "./panel-close";

export interface PageHeaderProps {
  title: string;
  /** Shows the Back button; none when omitted. */
  onBack?: () => void;
  /** The player's balances, on by default; off where a page shows none (an error, the end of an attack). */
  balances?: boolean;
  /** The page scrolls as one document (a flow's), so its header draws the fade of the document's top (`documentScrollStartHint`). */
  document?: boolean;
  className?: string;
}

/**
 * ONE-HEADER (#781, the owner's decisions of 2026-10-26): every page's header but the game scenes', the tab pages' (`TabPage`) and
 * the flows' (`TopBar`). One row at every width, every page's header height (`page-header`, #676), sticky at the top of the page's
 * scrolling region on the navigation's backdrop, a fade under it while the region has more above (`page-less`).
 * - At the top left, Back (`chevron-left`) and the title in the Vault's format: the display font, one line, cut with an ellipsis,
 *   its whole text in the tooltip (the heading's accessible name keeps it whole). No subtitle.
 * - At the top right, the home's balances in the home's format (`home-village-scene.tsx`): the Cobbles' `pill` below `desktop`, the
 *   `rail` from it, the same on every page, in the header's row; nothing under the header, so the content starts right under it.
 * - At 320 px the title gives way first (`min-w-0`), never Back nor the balances (`shrink-0`).
 * - In the home's side panel from `desktop` (DESK-PANELS, #762) the page is laid out as on a phone (`data-page-panel`, theme.css): the
 *   `pill`, then the panel's close (`PanelClose`); a page of the overlay itself has no Back (the close leads to the village).
 */
export function PageHeader({ title, onBack, balances = true, document = false, className }: PageHeaderProps) {
  const panel = usePagePanel();
  // In a panel its body is the region whose hint shows (`page-panel.tsx`); the document does not scroll.
  const documentHint = document && panel === null;
  useEffect(() => (documentHint ? documentScrollStartHint() : undefined), [documentHint]);
  return (
    <header data-slot="page-header" className={cn("page-header sticky top-0 z-30 bg-background/95 backdrop-blur", className)}>
      <div className="flex h-full items-center gap-2 pr-3 pl-2">
        {onBack && !panel?.top && (
          <Button variant="ghost" size="icon" aria-label="Back" onClick={onBack} className="shrink-0">
            <Icon name="chevron-left" />
          </Button>
        )}
        {/* Cut sideways only (`overflow-x: clip`): the display font's glyphs stand taller than its line. The mark on the title's line, after it (#622). */}
        <span data-slot="page-title" title={title} className={cn("min-w-0 flex-1 overflow-x-clip text-ellipsis whitespace-nowrap", !(onBack && !panel?.top) && "pl-2")}>
          <h1 className="inline font-display text-3xl font-semibold tracking-wide">{title}</h1>
          <MockMarkSlot className="ml-2 align-[0.375rem]" />
        </span>
        <div data-slot="page-header-end" className="flex shrink-0 items-center gap-2">
          {balances && (
            <>
              <BalancesSlot layout="pill" className="desktop:hidden" />
              <BalancesSlot layout="rail" className="hidden desktop:flex" />
            </>
          )}
          <PanelClose className="-mr-1" />
        </div>
      </div>
      <span aria-hidden data-slot="page-top-hint" className="pointer-events-none absolute inset-x-0 top-full h-6 bg-linear-to-t to-background opacity-0 transition-opacity motion-reduce:transition-none page-less:opacity-100" />
    </header>
  );
}
