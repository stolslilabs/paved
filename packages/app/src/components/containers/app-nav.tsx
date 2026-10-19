import type { Tab } from "../../routes/pages";
import { cn } from "../../lib/utils";
import { Icon } from "../ui/icon";
import { Wordmark } from "../elements/wordmark";
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
 * The tabbed pages' navigation (section 6.2), direction D (#537, the owner's pick): the mockups' bar of five items, each an
 * icon over its label (labels from `mobile`), at the bottom of the page below `desktop`; from `desktop` the same items, icon
 * beside label, in a header across the top, after the voxel wordmark and before the three balances. No rail and no sliding
 * indicator: the current item is gold on the white 15% layer (`state-layer`, theme.css), hover 10%, pressed 20%.
 * The bar is sticky, the last child of its page's column on a phone and the first from `desktop`: the content never runs
 * under it (no padding to keep in step with its height). The page lays it out in one column (`flex-col`) at every width.
 */
export function AppNav({ active, onNavigate, className }: AppNavProps) {
  return (
    <nav
      aria-label="Main"
      className={cn(
        "z-20 flex items-center border-border bg-background/95 backdrop-blur",
        "sticky inset-x-0 bottom-0 order-last border-t px-2 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]",
        "desktop:top-0 desktop:bottom-auto desktop:order-first desktop:gap-4 desktop:border-t-0 desktop:border-b desktop:px-6 desktop:py-3 wide:gap-6 wide:px-8",
        className,
      )}
    >
      <Wordmark size="sm" className="hidden shrink-0 desktop:flex" />
      <div className="flex min-w-0 flex-1 justify-between gap-1 desktop:flex-none desktop:justify-start desktop:gap-1.5">
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
                "state-layer flex min-w-0 flex-1 cursor-pointer flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "desktop:flex-none desktop:flex-row desktop:gap-2 desktop:px-3 desktop:py-2.5 desktop:text-sm wide:px-3.5",
                isActive ? "text-primary" : "text-foreground",
              )}
            >
              <Icon name={tab.icon} size="md" />
              {/* Not `sr-only mobile:not-sr-only`: Font Awesome injects its own `.sr-only` after Tailwind's, which wins. */}
              <span className="hidden mobile:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>
      {/* From `desktop`, the three balances close the header (#538); below it the pages' headers carry the pill. */}
      <BalancesSlot layout="rail" className="ml-auto" />
    </nav>
  );
}
