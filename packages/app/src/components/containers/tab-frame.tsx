import type { ReactNode } from "react";
import type { Tab } from "../../routes/pages";
import { pageScrollHintRef } from "../../lib/page-scroll-hint";
import { AppNav } from "./app-nav";

export interface TabFrameProps {
  tab: Tab;
  onNavigate?: (tab: Tab) => void;
  children: ReactNode;
}

/**
 * The frame of a tab page (#611): one viewport tall (`h-dvh`), the navigation fixed to its bottom below `desktop` (to its top
 * from it) and the page between, in its own scrolling region. The document never scrolls (`html, body` take no overscroll,
 * theme.css), so a pull past the top or the bottom never moves the navigation; the region's own bounce stays inside it
 * (`overscroll-contain`). Each page brings its region, so a page opens at its top. Home and `TabPage` use it (a file apart
 * from `TabPage`, which Home's first load does not carry). The region is the page's document: it drives the page's edge
 * hint (`pageScrollHintRef`, the fades `AppNav` draws), not the `scroll-hint` mask of a `ScrollRegion`.
 */
export function TabFrame({ tab, onNavigate, children }: TabFrameProps) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <AppNav active={tab} onNavigate={onNavigate} />
      <div ref={pageScrollHintRef} data-slot="page-scroll" className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {children}
      </div>
    </div>
  );
}
