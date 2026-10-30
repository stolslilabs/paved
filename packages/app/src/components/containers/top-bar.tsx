import { useEffect, type ReactNode } from "react";
import { cn } from "../../lib/utils";
import { documentScrollStartHint } from "../../lib/document-scroll-hint";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { BalancesSlot } from "./balances-context";
import { MockMarkSlot } from "./mock-mark";
import { usePagePanel } from "./page-panel-context";
import { useInPageRegion } from "./page-region";

export interface PageHeaderProps {
  title: string;
  /** Shows the Back button; none when omitted. */
  onBack?: () => void;
  /** The page's balances (the shell's, #855), on by default; off where a page shows none (an error, the end of an attack). */
  balances?: boolean;
  /** What the header holds at its top right in place of the balances (the League page's League control, #859). */
  end?: ReactNode;
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
 * - At the top right, the page's balances (#855: only those it uses, `routes/header-balances.ts`), the phone's plates (`pill`)
 *   below `desktop`, the larger ones (`rail`) from it, in the header's row; nothing under the header, so the content starts right under it.
 *   A page can hold something else there instead (`end`: the League page's League control, #859).
 * - At 320 px the title gives way first (`min-w-0`), never Back nor the balances (`shrink-0`).
 * - In the home's side panel from `desktop` (DESK-PANELS, #762) the page is laid out as on a phone (`data-page-panel`, theme.css): the
 *   phone's plates; a page of the overlay itself has no Back (a click outside the panel or Escape leads to the village; no close button,
 *   #782).
 * One module with `TopBar`: the route's error page (`RouteError`) carries it in the entry, and the tab pages share it from there;
 * in a module of its own the bundler split it and the balances' slot into two chunks of the first load (`bundle-budget.json`).
 */
export function PageHeader({ title, onBack, balances = true, end, document = false, className }: PageHeaderProps) {
  const panel = usePagePanel();
  // A sheet's Back closes it (BACK-RULE #783), whatever the page's own.
  const back = panel?.back ?? onBack;
  // In a region (a tab page's frame, the panel's body, #782) the region's hint shows (`pageScrollHintRef`); the document does not scroll.
  const documentHint = document && !useInPageRegion();
  useEffect(() => (documentHint ? documentScrollStartHint() : undefined), [documentHint]);
  return (
    <header data-slot="page-header" className={cn("page-header sticky top-0 z-30 bg-background/95 backdrop-blur", className)}>
      <div className="flex h-full items-center gap-2 pr-3 pl-2">
        {back && !panel?.top && (
          <Button variant="ghost" size="icon" aria-label="Back" onClick={back} className="shrink-0">
            <Icon name="chevron-left" />
          </Button>
        )}
        {/* Cut sideways only (`overflow-x: clip`): the display font's glyphs stand taller than its line. The mark on the title's line, after it (#622). */}
        <span data-slot="page-title" title={title} className={cn("min-w-0 flex-1 overflow-x-clip text-ellipsis whitespace-nowrap", !(back && !panel?.top) && "pl-2")}>
          <h1 className="inline font-display text-3xl font-semibold tracking-wide">{title}</h1>
          <MockMarkSlot className="ml-2 align-[0.375rem]" />
        </span>
        <div data-slot="page-header-end" className="flex shrink-0 items-center gap-2">
          {end ??
            (balances && (
            <>
              <BalancesSlot layout="pill" className="desktop:hidden" />
              <BalancesSlot layout="rail" className="hidden desktop:flex" />
            </>
            ))}
        </div>
      </div>
      <span aria-hidden data-slot="page-top-hint" className="pointer-events-none absolute inset-x-0 top-full h-6 bg-linear-to-t to-background opacity-0 transition-opacity motion-reduce:transition-none page-less:opacity-100" />
    </header>
  );
}

export type TopBarProps = Omit<PageHeaderProps, "document">;

/**
 * The top bar of a full-screen flow (section 6.2): the one page header (`PageHeader`, ONE-HEADER #781) at the top of a page that
 * scrolls as one document. The space under it is the bar's own (`mb-4`, the pages' side padding, #622): the page below starts
 * flush, so every such page has the same gap as a tab page's (`TabPage`). In a page's scrolling region (a tab page's
 * `TabFrame`, the home's side panel from `desktop`, DESK-PANELS #762, PAGES-SCROLL #782) the region scrolls, not the document.
 */
export function TopBar({ className, ...props }: TopBarProps) {
  return <PageHeader {...props} document className={cn("mb-4", className)} />;
}
