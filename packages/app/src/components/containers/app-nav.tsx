import { useEffect, useState, type CSSProperties } from "react";
import type { Tab } from "../../routes/pages";
import { cn } from "../../lib/utils";
import { Icon } from "../ui/icon";
import { Wordmark } from "../elements/wordmark";
import { BalancesSlot } from "./balances-context";
import { ProfileSlot } from "./profile-context";

/**
 * The five destinations of section 6.1, Home · Missions · Play · Vault · Settings (the route map's `TABS`, with icons).
 * Play (#623) is the main action, in the centre: icon only, a gold disc, on a phone only (#668).
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

/** The column of `tab` in the bar, from the left (Play the third). */
const columnOf = (tab: Tab) => NAV_TABS.findIndex((t) => t.id === tab);

/** The tab the last bar drew as current (TAB-SWIPE), `null` once no bar is on screen (a flow: a new bar then starts still). */
let lastDrawn: Tab | null = null;
/** The bars on screen: a tab change unmounts one as the next mounts, in the same commit. */
let live = 0;

/**
 * The tab whose state a new bar starts from: the one the last bar drew, so its transitions run across the remount; `active`
 * when no bar came before (a first load, a flow left). Kept for the bar's life: a bar that stays mounted moves by its transitions.
 */
function useStartTab(active: Tab): Tab {
  const [start] = useState(() => lastDrawn ?? active);
  useEffect(() => {
    live++;
    return () => {
      live--;
      setTimeout(() => {
        if (live === 0) lastDrawn = null;
      }, 0);
    };
  }, []);
  useEffect(() => {
    lastDrawn = active;
  }, [active]);
  return start;
}

/**
 * The tabbed pages' navigation (section 6.2), direction D (#537, the owner's pick): the mockups' bar of five items at the bottom
 * of the page below `desktop`; from `desktop` the same items, icon beside label, in a header across the top, after the player's
 * avatar and the voxel wordmark and before the balances (#620). The current item is gold on the white 15% layer (`state-layer`,
 * theme.css), hover 10%, pressed 20%.
 * TAB-SWIPE (#726, the owner's decisions): below `desktop` the items are icons, and only the current one shows its label (from
 * `mobile`), unfolding under its icon as the icon rises (`grid-template-rows` 0fr to 1fr, and opacity) while the last one folds.
 * One highlight per bar, the selected 15% layer one column wide, slides to the current column (none for Play); the current
 * item's own layer is cleared, except while pressed. Each item is one fixed height (44 px, 52 px from `mobile`), so the bar's
 * height never changes as the labels move. Every tab page mounts its own bar (`TabFrame`), so a tab change remounts it: the new
 * bar starts from the state the last one drew (`@starting-style`: the highlight on the old column, the old label unfolded),
 * and its transitions run in the page's swipe's duration and easing (`--tab-swipe-duration`, `--tab-swipe-ease`), live in the
 * view transition's new snapshot. None under reduced motion. From `desktop` nothing of this applies.
 * Play, the centre item (#623), has no label (`aria-label`) and stands out as the app's accent: a larger gold disc raised
 * above the bar, below `desktop` only. From `desktop` the header has no Play (#668, the owner's review): Home, Missions,
 * Vault, Settings, and Play is reached from the Home page. It opens the mode choice (`/play`).
 * Below `desktop` the bar is `position: fixed` to the viewport's bottom, outside the page's scrolling region (`TabFrame`,
 * #611, which ends the region at the bar's measured height); from `desktop` it is the first child of the page's column. The
 * page lays it out in one column (`flex-col`) at every width. The header is every page's header height from `desktop`
 * (`page-header`, #676), as a flow's top bar and a tab page's title row. It draws the page's edge hint
 * (NO-SCROLLBARS, #609): while the page's region has more below (`page-more`, set by `TabFrame`), a fade just above the bar
 * below `desktop`, at the foot of the viewport from it.
 */
export function AppNav({ active, onNavigate, className }: AppNavProps) {
  const start = useStartTab(active);
  const moved = start !== active;
  const column = columnOf(active);
  const startColumn = columnOf(start);
  return (
    <>
      <nav
        aria-label="Main"
        className={cn(
          "z-20 flex items-center border-border bg-background/95 backdrop-blur",
          "fixed inset-x-0 bottom-0 border-t px-2 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]",
          "desktop:page-header desktop:relative desktop:gap-4 desktop:border-t-0 desktop:border-b desktop:px-6 desktop:pb-0 wide:gap-6 wide:px-8",
          className,
        )}
      >
        <span aria-hidden data-slot="page-scroll-hint" className="pointer-events-none absolute inset-x-0 bottom-full h-8 bg-linear-to-b to-background opacity-0 transition-opacity motion-reduce:transition-none page-more:opacity-100 desktop:hidden" />
        {/* From `desktop`, the player's avatar opens the header, beside the wordmark (#624); below it the pages' headers carry it. */}
        <ProfileSlot className="hidden desktop:block" />
        <Wordmark size="sm" className="hidden shrink-0 desktop:flex" />
        <div className="relative flex min-w-0 flex-1 justify-between gap-1 desktop:flex-none desktop:justify-start desktop:gap-1.5">
          {/* The sliding highlight (TAB-SWIPE): one column of the five (`gap-1` between them), under the items. */}
          <span
            aria-hidden
            data-slot="app-nav-highlight"
            data-force="selected"
            data-column={column}
            style={{ "--nav-col": column, "--nav-from": startColumn } as CSSProperties}
            className={cn(
              "state-layer pointer-events-none absolute inset-y-0 left-0 w-[calc((100%-1rem)/5)] rounded-lg desktop:hidden",
              "[translate:calc(var(--nav-col)*(100%+0.25rem))_0] max-desktop:starting:[translate:calc(var(--nav-from)*(100%+0.25rem))_0]",
              "transition-[translate,opacity] duration-(--tab-swipe-duration) ease-(--tab-swipe-ease) motion-reduce:transition-none",
              active === "play" && "opacity-0",
              start === "play" && "max-desktop:starting:opacity-0",
            )}
          />
          {NAV_TABS.map((tab) => {
            const isActive = tab.id === active;
            if (tab.id === "play") {
              return (
                // The slot keeps the bar's five equal columns; the disc rises above the bar (over the edge hint: `z-10`). Gone from `desktop`
                // (#668): the header keeps four items, Play is on the Home page.
                <div key={tab.id} className="flex min-w-0 flex-1 justify-center desktop:hidden">
                  <button
                    type="button"
                    aria-label={tab.label}
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => onNavigate?.(tab.id)}
                    className="state-layer relative z-10 -mt-6 grid size-14 cursor-pointer place-items-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-background transition-colors outline-none focus-visible:ring-ring"
                  >
                    {/* The triangle's weight sits left of its box: nudged right so it reads centred in the disc. */}
                    <Icon name={tab.icon} size="lg" className="translate-x-0.5" />
                  </button>
                </div>
              );
            }
            // The state the last bar drew, where this one's transitions start (TAB-SWIPE): the old item gold, its label unfolded.
            const wasActive = moved && tab.id === start;
            const arrives = moved && isActive;
            return (
              <button
                key={tab.id}
                type="button"
                aria-label={tab.label}
                aria-current={isActive ? "page" : undefined}
                onClick={() => onNavigate?.(tab.id)}
                className={cn(
                  // `relative`: painted over the highlight, which comes first.
                  "state-layer relative flex h-11 min-w-0 flex-1 cursor-pointer flex-col items-center justify-center rounded-lg px-1 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring mobile:h-13",
                  "transition-colors duration-(--tab-swipe-duration) ease-(--tab-swipe-ease) motion-reduce:transition-none",
                  // Below `desktop` the highlight is the current item's layer: its own is cleared, except while pressed.
                  "max-desktop:aria-[current=page]:[--layer:transparent] max-desktop:aria-[current=page]:active:[--layer:var(--state-pressed)]",
                  "desktop:h-auto desktop:flex-none desktop:flex-row desktop:gap-2 desktop:px-3 desktop:py-2.5 desktop:text-sm desktop:duration-150 desktop:ease-in-out wide:px-3.5",
                  isActive ? "text-primary" : "text-foreground",
                  wasActive && "max-desktop:starting:text-primary",
                  arrives && "max-desktop:starting:text-foreground",
                )}
              >
                <Icon name={tab.icon} size="md" />
                {/* Not `sr-only mobile:not-sr-only`: Font Awesome injects its own `.sr-only` after Tailwind's, which wins. Below
                    `desktop` the row folds to nothing but on the current item (0fr to 1fr), and a folded row is hidden (`visibility`, which
                    turns at the end of a fold and the start of an unfold); from `desktop` it is always there. */}
                <span
                  data-slot="app-nav-label"
                  data-open={isActive || undefined}
                  className={cn(
                    "hidden transition-[grid-template-rows,opacity,visibility] duration-(--tab-swipe-duration) ease-(--tab-swipe-ease) motion-reduce:transition-none mobile:grid",
                    "desktop:visible desktop:block desktop:opacity-100 desktop:transition-none",
                    isActive ? "grid-rows-[1fr] opacity-100" : "invisible grid-rows-[0fr] opacity-0",
                    wasActive && "max-desktop:starting:visible max-desktop:starting:grid-rows-[1fr] max-desktop:starting:opacity-100",
                    arrives && "max-desktop:starting:invisible max-desktop:starting:grid-rows-[0fr] max-desktop:starting:opacity-0",
                  )}
                >
                  <span className="min-h-0 overflow-hidden">
                    <span className="block pt-1 desktop:pt-0">{tab.label}</span>
                  </span>
                </span>
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
