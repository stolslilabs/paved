import type { ReactNode } from "react";
import type { Tab } from "../../routes/pages";
import { cn } from "../../lib/utils";
import { PageHeader } from "./top-bar";
import { TabFrame } from "./tab-frame";

export interface TabPageProps {
  /** The tab shown as active (the route map's `nav`). */
  tab: Tab;
  title: string;
  /**
   * Back, at the top left (#760): up to the page's parent, the village (BACK-RULE #783, `useBack`). Omitted, the bar's Home
   * (`onNavigate("home")`). A sheet over a page (`PageSheet`) shows its close instead.
   */
  onBack?: () => void;
  onNavigate?: (tab: Tab) => void;
  children: ReactNode;
  className?: string;
}

/** The content's column: the phone's, wider from `tablet` (a side panel keeps the phone's). */
const COLUMN = "mx-auto w-full max-w-md px-4 tablet:max-w-2xl";

/**
 * A page of the tabs (section 6.2), in the frame of the tab pages (`TabFrame`): the bottom bar below `desktop` (direction D,
 * #537); the content in one column that widens with the viewport up to `desktop`. Its header is every page's (`PageHeader`,
 * ONE-HEADER #781): Back at the top left (up to the village), the
 * title, the page's balances at the top right (#855); sticky at the top of the page's scrolling region. The content starts right under it.
 * DESK-PANELS (#762): from `desktop` the page is in the home's side panel, laid out as on a phone.
 */
export function TabPage({ tab, title, onBack, onNavigate, children, className }: TabPageProps) {
  return (
    <TabFrame tab={tab} onNavigate={onNavigate}>
      <PageHeader title={title} onBack={onBack ?? (() => onNavigate?.("home"))} />
      <main className={cn(COLUMN, "flex flex-col gap-4 pt-4 pb-6", className)}>{children}</main>
    </TabFrame>
  );
}
