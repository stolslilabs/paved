import * as m from "motion/react-m";
import type { Tab } from "../../routes/pages";
import { cn } from "../../lib/utils";
import { Icon } from "../ui/icon";
import { BalancesSlot } from "./balances-context";

/** The five destinations of section 6.1, Home · Ranks · Missions · Vault · Settings (the route map's `TABS`, with icons). */
export const NAV_TABS: readonly { id: Tab; label: string; icon: string }[] = [
  { id: "home", label: "Home", icon: "house" },
  { id: "ranks", label: "Ranks", icon: "ranking-star" },
  { id: "quests", label: "Missions", icon: "scroll" },
  { id: "vault", label: "Vault", icon: "piggy-bank" },
  { id: "settings", label: "Settings", icon: "gear" },
];

export interface AppNavProps {
  active: Tab;
  onNavigate?: (tab: Tab) => void;
  className?: string;
}

/**
 * The tabbed pages' navigation (section 6.2), drawn for the scenes: a bottom bar below `desktop` (labels from
 * `mobile`), a left rail with labels from `desktop` (sticky, one viewport high: the balances at its bottom stay in view while the page scrolls). The indicator slides with Motion's `layoutId`. P1 routes it.
 * The bar is sticky, the last child of its page's column: it stays at the bottom of the scrolling area, and the content
 * above it never runs under it (no padding to keep in step with its height). The page lays it out with `flex-col desktop:flex-row`.
 */
export function AppNav({ active, onNavigate, className }: AppNavProps) {
  return (
    <nav
      aria-label="Main"
      className={cn(
        "z-20 flex border-border bg-card/95 backdrop-blur",
        "sticky inset-x-0 bottom-0 order-last border-t pb-[env(safe-area-inset-bottom)]",
        "desktop:sticky desktop:top-0 desktop:order-none desktop:h-dvh desktop:self-start desktop:overflow-y-auto desktop:w-56 desktop:shrink-0 desktop:flex-col desktop:gap-1 desktop:border-t-0 desktop:border-r desktop:px-3 desktop:py-6",
        className,
      )}
    >
      {NAV_TABS.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            aria-label={tab.label}
            aria-current={isActive ? "page" : undefined}
            onClick={() => onNavigate?.(tab.id)}
            className={cn(
              "relative flex flex-1 cursor-pointer flex-col items-center gap-1 py-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "desktop:flex-none desktop:flex-row desktop:gap-3 desktop:rounded-md desktop:px-3 desktop:py-2.5 desktop:text-sm",
              isActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {isActive && (
              <m.span
                layoutId="app-nav-indicator"
                className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-primary desktop:inset-0 desktop:h-auto desktop:rounded-md desktop:bg-accent"
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
              />
            )}
            <Icon name={tab.icon} className="relative" size="md" />
            {/* Not `sr-only mobile:not-sr-only`: Font Awesome injects its own `.sr-only` after Tailwind's, which wins. */}
            <span className="relative hidden mobile:inline">{tab.label}</span>
          </button>
        );
      })}
      {/* From `desktop`, the three balances close the rail (#538); below it the pages' headers carry the pill. */}
      <BalancesSlot layout="rail" className="mt-auto" />
    </nav>
  );
}
