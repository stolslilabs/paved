import type { ReactNode } from "react";
import type { Tab } from "../../routes/pages";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { AppNav } from "./app-nav";

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
 * A page of the five tabs (section 6.2), as Home lays itself out: the bottom bar below `desktop`, the rail from it; the
 * title in the display font, an action on its right, the content in one column that widens with the viewport.
 */
export function TabPage({ tab, title, subtitle, onBack, end, onNavigate, children, className }: TabPageProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground desktop:flex-row">
      <AppNav active={tab} onNavigate={onNavigate} className="desktop:min-h-dvh" />
      <main className={cn("mx-auto flex w-full flex-1 max-w-md flex-col gap-4 px-4 pt-6 pb-6 tablet:max-w-2xl desktop:max-w-4xl desktop:px-8 desktop:pb-10", className)}>
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-1">
            {onBack && (
              <Button variant="ghost" size="icon" aria-label="Back" onClick={onBack} className="-ml-2">
                <Icon name="chevron-left" />
              </Button>
            )}
            <div className="flex min-w-0 flex-col">
              <h1 className="truncate font-display text-2xl font-semibold">{title}</h1>
              {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
            </div>
          </div>
          {end}
        </header>
        {children}
      </main>
    </div>
  );
}
