import { cn } from "../../lib/utils";
import { PageHeader, type PageHeaderProps } from "./page-header";

export type TopBarProps = Omit<PageHeaderProps, "document">;

/**
 * The top bar of a full-screen flow (section 6.2): the one page header (`PageHeader`, ONE-HEADER #781) at the top of a page that
 * scrolls as one document. The space under it is the bar's own (`mb-4`, the pages' side padding, #622): the page below starts
 * flush, so every such page has the same gap as a tab page's (`TabPage`). In the home's side panel from `desktop` (DESK-PANELS,
 * #762) the panel's body scrolls, not the document.
 */
export function TopBar({ className, ...props }: TopBarProps) {
  return <PageHeader {...props} document className={cn("mb-4", className)} />;
}
