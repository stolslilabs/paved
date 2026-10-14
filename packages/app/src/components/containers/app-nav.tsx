import * as m from "motion/react-m";
import type { Tab } from "../../routes/pages";
import { cn } from "../../lib/utils";
import { Icon } from "../ui/icon";

/** The five destinations of section 6.1, Home · Ranks · Quests · Vault · Settings (the route map's `TABS`, with icons). */
export const NAV_TABS: readonly { id: Tab; label: string; icon: string }[] = [
  { id: "home", label: "Home", icon: "house" },
  { id: "ranks", label: "Ranks", icon: "ranking-star" },
  { id: "quests", label: "Quests", icon: "scroll" },
  { id: "vault", label: "Vault", icon: "vault" },
  { id: "settings", label: "Settings", icon: "gear" },
];

export interface AppNavProps {
  active: Tab;
  onNavigate?: (tab: Tab) => void;
  className?: string;
}

/**
 * The tabbed pages' navigation (section 6.2), drawn for the scenes: a bottom bar below `desktop` (labels from
 * `mobile`), a left rail with labels from `desktop`. The indicator slides with Motion's `layoutId`. P1 routes it.
 */
export function AppNav({ active, onNavigate, className }: AppNavProps) {
  return (
    <nav
      aria-label="Main"
      className={cn(
        "z-20 flex border-border bg-card/95 backdrop-blur",
        "fixed inset-x-0 bottom-0 border-t pb-[env(safe-area-inset-bottom)]",
        "desktop:static desktop:h-auto desktop:w-56 desktop:shrink-0 desktop:flex-col desktop:gap-1 desktop:border-t-0 desktop:border-r desktop:px-3 desktop:py-6",
        className,
      )}
    >
      {NAV_TABS.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            aria-current={isActive ? "page" : undefined}
            onClick={() => onNavigate?.(tab.id)}
            className={cn(
              "relative flex flex-1 cursor-pointer flex-col items-center gap-1 py-2.5 text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
            <span className="relative">
              <span className="sr-only mobile:not-sr-only">{tab.label}</span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
