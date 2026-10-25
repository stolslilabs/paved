import type { ReactNode } from "react";
import type { Tab } from "../../routes/pages";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { PageBalances } from "./balances-context";
import { MockMarkSlot } from "./mock-mark";
import { TabFrame } from "./tab-frame";

export interface TabPageProps {
  /** The tab shown as active (the route map's `nav`). */
  tab: Tab;
  title: string;
  /** A line under the title. */
  subtitle?: ReactNode;
  /**
   * Back, at the top left (#760): the page's parent (a theme and the referral go back to Settings). Omitted, Back leads to the
   * home, the village (`onNavigate("home")`): Missions, Vault and Settings.
   */
  onBack?: () => void;
  /** The right of the header: a day picker, a balance. */
  end?: ReactNode;
  onNavigate?: (tab: Tab) => void;
  children: ReactNode;
  className?: string;
}

/** The content's column, the header's row and the page's below it: one width per breakpoint. */
const COLUMN = "mx-auto w-full max-w-md px-4 tablet:max-w-2xl desktop:max-w-4xl desktop:px-8";

/**
 * A page of the tabs (section 6.2), in the frame of the tab pages (`TabFrame`): the bottom bar below `desktop`, the header
 * across the top from it (direction D, #537); the content in one column that widens with the viewport.
 * PAGE-HEADER (#760, the owner's decisions of 2026-10-25): the page's header is one row at every width, every page's header
 * height (`page-header`, #676): Back at the top left (to the home on a tab's own page, to the parent on a page reached from
 * another), the title in the display font, `end` on its right. It is sticky at the top of the page's scrolling region, with
 * the navigation's backdrop, so Back stays in reach at the page's bottom; a fade under it shows the region has more above
 * (`page-less`). Below `desktop` the balances, the Cobbles where the page's rule shows them (#720), sit in the page under it,
 * at the content's top right (`PageBalances`), and scroll with it. From `desktop` the navigation is the page's top header
 * (with the balances) and this row, on the same token, opens the content, where a flow's content starts.
 */
export function TabPage({ tab, title, subtitle, onBack, end, onNavigate, children, className }: TabPageProps) {
  return (
    <TabFrame tab={tab} onNavigate={onNavigate}>
      <header data-slot="page-header" className="page-header sticky top-0 z-30 bg-background/95 backdrop-blur desktop:mt-4">
        <div className={cn(COLUMN, "grid h-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3")}>
          <div className="flex min-w-0 items-center gap-1">
            <Button variant="ghost" size="icon" aria-label="Back" onClick={onBack ?? (() => onNavigate?.("home"))} className="-ml-2 shrink-0">
              <Icon name="chevron-left" />
            </Button>
            <div className="flex min-w-0 flex-col">
              {/* The mark on the title's line, after it (#622). One line each: the header's height is fixed, a cut line keeps its whole text in `title`. */}
              {/* Cut sideways only (`overflow-x: clip`): the display font's glyphs stand taller than its line. */}
              <span title={title} className="overflow-x-clip text-ellipsis whitespace-nowrap">
                <h1 className="inline font-display text-3xl font-semibold tracking-wide">{title}</h1>
                <MockMarkSlot className="ml-2 align-[0.375rem]" />
              </span>
              {subtitle && (
                <span title={typeof subtitle === "string" ? subtitle : undefined} className="truncate text-xs text-muted-foreground">
                  {subtitle}
                </span>
              )}
            </div>
          </div>
          {end}
        </div>
        <span aria-hidden data-slot="page-top-hint" className="pointer-events-none absolute inset-x-0 top-full h-6 bg-linear-to-t to-background opacity-0 transition-opacity motion-reduce:transition-none page-less:opacity-100" />
      </header>
      <main className={cn(COLUMN, "flex flex-col gap-4 pt-4 pb-6 desktop:pb-10", className)}>
        {/* Below `desktop`, the balances under the header at the top right (#760): where the content starts on every page, the rest 8 px under them, as a flow's (`TopBar`). */}
        <PageBalances className="-mb-2" />
        {children}
      </main>
    </TabFrame>
  );
}
