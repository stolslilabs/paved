import type { ReactNode } from "react";
import type { Tab } from "../../routes/pages";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { BalancesSlot } from "./balances-context";
import { MockMarkSlot } from "./mock-mark";
import { ProfileSlot } from "./profile-context";
import { TabFrame } from "./tab-frame";

export interface TabPageProps {
  /** The tab shown as active (the route map's `nav`). */
  tab: Tab;
  title: string;
  /** A line under the title. */
  subtitle?: ReactNode;
  /** Shows Back before the title: a page reached from another (theme and referral from Settings). */
  onBack?: () => void;
  /** The right of the header: a day picker, a balance. */
  end?: ReactNode;
  onNavigate?: (tab: Tab) => void;
  children: ReactNode;
  className?: string;
}

/**
 * A page of the five tabs (section 6.2), as Home lays itself out: the bottom bar below `desktop`, the header across the top
 * from it (direction D, #537); the title in the display font, an action on its right, the content in one column that widens
 * with the viewport, in the frame of the tab pages (`TabFrame`). Below `desktop` the header is every page's header height
 * (`page-header`, #676): the title row (the avatar or Back, the title, `end`) over the balances' row. From `desktop` the
 * navigation is the page's one header and the title row opens the content, where a flow's content starts.
 */
export function TabPage({ tab, title, subtitle, onBack, end, onNavigate, children, className }: TabPageProps) {
  return (
    <TabFrame tab={tab} onNavigate={onNavigate}>
      <main className={cn("mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-6 tablet:max-w-2xl desktop:max-w-4xl desktop:px-8 desktop:pt-4 desktop:pb-10", className)}>
        {/*
          Below `desktop` the page's header (`page-header`, #676): the title row over the balances' row. From it the navigation is
          the header, and this row is the content's first, 56 px, as far below it as a flow's content is below its top bar.
        */}
        <header data-slot="page-header" className="page-header grid grid-cols-[1fr_auto] items-center gap-x-3 desktop:h-14">
          <div className="flex min-w-0 items-center gap-1">
            {/* The top left is Back on a page reached from another, the player's avatar on a tab's own page (#624; from `desktop` it is in the navigation). */}
            {onBack ? (
              <Button variant="ghost" size="icon" aria-label="Back" onClick={onBack} className="-ml-2">
                <Icon name="chevron-left" />
              </Button>
            ) : (
              <ProfileSlot className="mr-2 desktop:hidden" />
            )}
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
          <BalancesSlot layout="pill" className="col-span-2 ml-auto desktop:hidden" />
        </header>
        {children}
      </main>
    </TabFrame>
  );
}
