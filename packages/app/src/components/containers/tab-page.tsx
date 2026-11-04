import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { PageHeader } from "./top-bar";
import { TabFrame } from "./tab-frame";

export interface TabPageProps {
  title: string;
  /**
   * Back, at the top left (#760): up to the page's parent, the village (BACK-RULE #783, `useBack`); the page's way out, no page
   * carrying the dock (DOCK-UNDER-PAGES). Omitted, no Back. A sheet over a page (`PageSheet`) shows its close instead.
   */
  onBack?: () => void;
  /** What the header holds at its top right (`PageHeader`'s `end`: the chat page's menu, #973). */
  end?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** The content's column: the phone's, wider from `tablet` (a side panel keeps the phone's). */
const COLUMN = "mx-auto w-full max-w-md px-4 tablet:max-w-2xl";

/**
 * A page of the tabs (section 6.2), in the frame of the tab pages (`TabFrame`: no dock since DOCK-UNDER-PAGES); the content in one column that widens with the viewport up to `desktop`. Its header is every page's (`PageHeader`,
 * ONE-HEADER #781): Back at the top left (up to the village), the
 * title, the page's balances at the top right (#855); sticky at the top of the page's scrolling region. The content starts right under it.
 * DESK-PANELS (#762): from `desktop` the page is in the home's side panel, laid out as on a phone.
 */
export function TabPage({ title, onBack, end, children, className }: TabPageProps) {
  return (
    <TabFrame>
      <PageHeader title={title} onBack={onBack} end={end} />
      <main className={cn(COLUMN, "flex flex-col gap-4 pt-4 pb-6", className)}>
        {children}
      </main>
    </TabFrame>
  );
}
