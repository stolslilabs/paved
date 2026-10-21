import type { Tab } from "../../routes/pages";
import { cn } from "../../lib/utils";
import { Icon } from "../ui/icon";
import { Wordmark } from "../elements/wordmark";
import { BalancesSlot } from "./balances-context";
import { ProfileSlot } from "./profile-context";

/**
 * The five destinations of section 6.1, Home · Missions · Play · Vault · Settings (the route map's `TABS`, with icons).
 * Play (#623) is the main action, in the centre: icon only, a gold disc.
 */
export const NAV_TABS: readonly { id: Tab; label: string; icon: string }[] = [
  { id: "home", label: "Home", icon: "house" },
  { id: "quests", label: "Missions", icon: "scroll" },
  { id: "play", label: "Play", icon: "play" },
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
 * beside label, in a header across the top, after the player's avatar and the voxel wordmark and before the balances (#620). No rail and no sliding
 * indicator: the current item is gold on the white 15% layer (`state-layer`, theme.css), hover 10%, pressed 20%.
 * Play, the centre item (#623), has no label (`aria-label`) and stands out as the app's accent: a larger gold disc raised
 * above the bar on a phone, a gold disc among the items from `desktop`. It opens the mode choice (`/play`).
 * Below `desktop` the bar is `position: fixed` to the viewport's bottom, outside the page's scrolling region (`TabFrame`,
 * #611, which ends the region at the bar's measured height); from `desktop` it is the first child of the page's column. The
 * page lays it out in one column (`flex-col`) at every width. It draws the page's edge hint
 * (NO-SCROLLBARS, #609): while the page's region has more below (`page-more`, set by `TabFrame`), a fade just above the bar
 * below `desktop`, at the foot of the viewport from it.
 */
export function AppNav({ active, onNavigate, className }: AppNavProps) {
  return (
    <>
      <nav
        aria-label="Main"
        className={cn(
          "z-20 flex items-center border-border bg-background/95 backdrop-blur",
          "fixed inset-x-0 bottom-0 border-t px-2 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]",
          "desktop:relative desktop:shrink-0 desktop:gap-4 desktop:border-t-0 desktop:border-b desktop:px-6 desktop:py-3 wide:gap-6 wide:px-8",
          className,
        )}
      >
        <span aria-hidden data-slot="page-scroll-hint" className="pointer-events-none absolute inset-x-0 bottom-full h-8 bg-linear-to-b to-background opacity-0 transition-opacity motion-reduce:transition-none page-more:opacity-100 desktop:hidden" />
        {/* From `desktop`, the player's avatar opens the header, beside the wordmark (#624); below it the pages' headers carry it. */}
        <ProfileSlot className="hidden desktop:block" />
        <Wordmark size="sm" className="hidden shrink-0 desktop:flex" />
        <div className="flex min-w-0 flex-1 justify-between gap-1 desktop:flex-none desktop:justify-start desktop:gap-1.5">
          {NAV_TABS.map((tab) => {
            const isActive = tab.id === active;
            if (tab.id === "play") {
              return (
                // The slot keeps the bar's five equal columns; the disc rises above the bar on a phone (over the edge hint: `z-10`), sits in
                // the row from `desktop`.
                <div key={tab.id} className="flex min-w-0 flex-1 justify-center desktop:flex-none desktop:px-1">
                  <button
                    type="button"
                    aria-label={tab.label}
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => onNavigate?.(tab.id)}
                    className={cn(
                      "state-layer relative z-10 -mt-6 grid size-14 cursor-pointer place-items-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-background transition-colors outline-none focus-visible:ring-ring",
                      "desktop:mt-0 desktop:size-11 desktop:shadow-none desktop:ring-0 desktop:focus-visible:ring-2",
                    )}
                  >
                    {/* The triangle's weight sits left of its box: nudged right so it reads centred in the disc. */}
                    <Icon name={tab.icon} size="lg" className="translate-x-0.5 desktop:text-base" />
                  </button>
                </div>
              );
            }
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
        {/* From `desktop`, the balances close the header (#538, #620); below it the pages' headers carry the pill. */}
        <BalancesSlot layout="rail" className="ml-auto hidden desktop:flex" />
      </nav>
      {/* Outside the bar: its backdrop filter would make it the containing block of a fixed child. */}
      <div aria-hidden data-slot="page-scroll-hint" className="pointer-events-none fixed inset-x-0 bottom-0 z-10 hidden h-16 bg-linear-to-b via-background/70 to-background opacity-0 transition-opacity motion-reduce:transition-none desktop:block page-more:opacity-100" />
    </>
  );
}
