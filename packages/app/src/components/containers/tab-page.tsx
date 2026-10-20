import type { ReactNode } from "react";
import type { Tab } from "../../routes/pages";
import { usePageScrollHint } from "../../lib/scroll-hint";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { AppNav } from "./app-nav";
import { BalancesSlot } from "./balances-context";
import { MockMarkSlot } from "./mock-mark";

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
 * with the viewport. The page scrolls as one document; while it has more below, a fade at the bottom of the viewport says so
 * (NO-SCROLLBARS, #609): above the bar on a phone (`AppNav`), on the viewport's edge from `desktop`.
 */
export function TabPage({ tab, title, subtitle, onBack, end, onNavigate, children, className }: TabPageProps) {
  usePageScrollHint();
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <AppNav active={tab} onNavigate={onNavigate} />
      <main className={cn("mx-auto flex w-full flex-1 max-w-md flex-col gap-4 px-4 pt-6 pb-6 tablet:max-w-2xl desktop:max-w-4xl desktop:px-8 desktop:pb-10", className)}>
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-1">
            {onBack && (
              <Button variant="ghost" size="icon" aria-label="Back" onClick={onBack} className="-ml-2">
                <Icon name="chevron-left" />
              </Button>
            )}
            <div className="flex min-w-0 flex-col wrap-anywhere">
              <span className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-3xl font-semibold tracking-wide">{title}</h1>
                <MockMarkSlot />
              </span>
              {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
            </div>
          </div>
          <BalancesSlot layout="pill" className="ml-auto" />
          {end}
        </header>
        {children}
      </main>
      <div aria-hidden data-slot="page-scroll-hint" className="pointer-events-none fixed inset-x-0 bottom-0 z-10 hidden h-16 bg-linear-to-b via-background/70 to-background opacity-0 transition-opacity motion-reduce:transition-none desktop:block page-more:opacity-100" />
    </div>
  );
}
