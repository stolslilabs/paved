import { useEffect, useId, useState, type CSSProperties } from "react";
import type { Tab } from "../../routes/pages";
import { cn } from "../../lib/utils";
import { GameIcon, type GameIconName } from "../elements/game-icon";

/**
 * The phone's bar, left to right (the route map's `BAR_TABS`, #763: Shop, Chests, Play, League, Settings), with icons. Its own
 * list, not the route map's: the bar's chunk stays apart from the route map's (the home loads it lazily). Play (#623) is the main
 * action, in the bar's centre: icon only (the two swords, #807), a gold disc (#668). From `desktop` there is no bar, nor header (DESK-PANELS, #762): the
 * navigation is the home's overlay.
 */
export const NAV_TABS: readonly { id: Tab; label: string; icon: GameIconName }[] = [
  { id: "shop", label: "Shop", icon: "store" },
  { id: "chests", label: "Chests", icon: "treasure-chest" },
  { id: "play", label: "Play", icon: "swords" },
  { id: "league", label: "League", icon: "trophy" },
  { id: "settings", label: "Settings", icon: "gear" },
];

/** The current item's description (TAB-RETAP, #800): a tap on it closes its page. */
export const RETAP_HINT = "Tap again to return to the village";

/** The bar's tabs, left to right. */
const BAR = NAV_TABS.map((t) => t.id);

export interface AppNavProps {
  /** The current item; `null` on a page of no item (the home, #763): no highlight. */
  active: Tab | null;
  onNavigate?: (tab: Tab) => void;
  /** Counts on the bar's items (the chests waiting on Chests); none or 0: no badge. */
  badges?: Partial<Record<Tab, number>>;
  className?: string;
}

/** The column of `tab` in the phone's bar, from the left (Play the third); -1 for a tab not in it. */
const columnOf = (tab: Tab | null) => (tab ? BAR.indexOf(tab) : -1);

/** The tab the last bar drew as current (TAB-SWIPE), `null` once no bar is on screen (a flow: a new bar then starts still). */
let lastDrawn: { tab: Tab | null } | null = null;
/** The bars on screen: a tab change unmounts one as the next mounts, in the same commit. */
let live = 0;

/**
 * The tab whose state a new bar starts from: the one the last bar drew, so its transitions run across the remount; `active`
 * when no bar came before (a first load, a flow left). Kept for the bar's life: a bar that stays mounted moves by its transitions.
 */
function useStartTab(active: Tab | null): Tab | null {
  const [start] = useState(() => (lastDrawn ? lastDrawn.tab : active));
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
    lastDrawn = { tab: active };
  }, [active]);
  return start;
}

/**
 * The tabbed pages' navigation (section 6.2), direction D (#537, the owner's pick): the mockups' bar of five items at the bottom
 * of the page, below `desktop` only. The current item is gold on the white 15% layer (`state-layer`, theme.css), hover 10%,
 * pressed 20%.
 * TAB-SWIPE (#726, the owner's decisions): the items are icons, and only the current one shows its label (from `mobile`),
 * unfolding under its icon as the icon rises (`grid-template-rows` 0fr to 1fr, and opacity) while the last one folds.
 * One highlight per bar, the selected 15% layer one column wide, slides to the current column (none for Play); the current
 * item's own layer is cleared, except while pressed. Each item is one fixed height (44 px, 52 px from `mobile`), so the bar's
 * height never changes as the labels move. Every tab page mounts its own bar (`TabFrame`), so a tab change remounts it: the new
 * bar starts from the state the last one drew (`@starting-style`: the highlight on the old column, the old label unfolded),
 * and its transitions run in the page's swipe's duration and easing (`--tab-swipe-duration`, `--tab-swipe-ease`), live in the
 * view transition's new snapshot. None under reduced motion.
 * SWIPE-DISC (#780): during a swipe the bar (`data-slot="app-nav"`) is a view transition of its own, painted above the page's
 * (theme.css, TAB-SWIPE), so the Play disc stays whole over the moving page.
 * Play, the centre item (#623), has no label (`aria-label`) and stands out as the app's accent: a larger gold disc raised
 * above the bar. It opens the mode choice (`/play`).
 * PHONE-NAV (#763, the owner's decisions of 2026-10-25): the bar holds Shop, Chests, Play, League, Settings, and shows on the
 * home too (`active` `null`: no item current, no highlight), with the chests waiting on Chests (`badges`). Missions and the
 * Vault are the home's overlay's; a page of either has the bar with no item current.
 * DESK-PANELS (#762, the owner's decisions of 2026-10-25): from `desktop` there is no bar and no header across the top (the
 * header of #620 went): the navigation is the home's overlay, and the pages open in its side panel.
 * The bar is `position: fixed` to the viewport's bottom, outside the page's scrolling region (`TabFrame`, #611, which ends the
 * region at the bar's measured height). It draws the page's edge hint (NO-SCROLLBARS, #609): while the page's region has more
 * below (`page-more`, set by `TabFrame`), a fade just above the bar.
 * TAB-RETAP (#800, the owner's decision of 2026-10-26): a tap on the current item closes its page and returns to the village
 * (`useTabNavigate`); the item says so (`aria-describedby`, `RETAP_HINT`) and keeps `aria-current="page"`.
 */
export function AppNav({ active, onNavigate, badges, className }: AppNavProps) {
  const hint = useId();
  const start = useStartTab(active);
  const moved = start !== active;
  const column = columnOf(active);
  const startColumn = columnOf(start);
  return (
    <nav
      aria-label="Main"
      data-slot="app-nav"
      className={cn(
        "fixed inset-x-0 bottom-0 z-20 flex items-center border-t border-border bg-background/95 px-2 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] backdrop-blur desktop:hidden",
        className,
      )}
    >
        <span id={hint} hidden>
          {RETAP_HINT}
        </span>
        <span aria-hidden data-slot="page-scroll-hint" className="pointer-events-none absolute inset-x-0 bottom-full h-8 bg-linear-to-b to-background opacity-0 transition-opacity motion-reduce:transition-none page-more:opacity-100" />
        <div className="relative flex min-w-0 flex-1 justify-between gap-1">
          {/* The sliding highlight (TAB-SWIPE): one column of the five (`gap-1` between them), under the items. */}
          <span
            aria-hidden
            data-slot="app-nav-highlight"
            data-force="selected"
            data-column={column}
            style={{ "--nav-col": Math.max(0, column), "--nav-from": Math.max(0, startColumn) } as CSSProperties}
            className={cn(
              "state-layer pointer-events-none absolute inset-y-0 left-0 w-[calc((100%-1rem)/5)] rounded-lg",
              "[translate:calc(var(--nav-col)*(100%+0.25rem))_0] max-desktop:starting:[translate:calc(var(--nav-from)*(100%+0.25rem))_0]",
              "transition-[translate,opacity] duration-(--tab-swipe-duration) ease-(--tab-swipe-ease) motion-reduce:transition-none",
              // None on Play, nor on a page of no item of the bar (the home, Missions, the Vault): it fades in or out in place.
              (active === "play" || column < 0) && "opacity-0",
              (start === "play" || startColumn < 0) && "max-desktop:starting:opacity-0",
            )}
          />
          {NAV_TABS.map((tab) => {
            const isActive = tab.id === active;
            const badge = badges?.[tab.id] ?? 0;
            if (tab.id === "play") {
              return (
                // The slot keeps the bar's five equal columns; the disc rises above the bar (over the edge hint: `z-10`).
                <div key={tab.id} className="flex min-w-0 flex-1 justify-center">
                  <button
                    type="button"
                    aria-label={tab.label}
                    aria-current={isActive ? "page" : undefined}
                    aria-describedby={isActive ? hint : undefined}
                    onClick={() => onNavigate?.(tab.id)}
                    className="state-layer relative z-10 -mt-6 grid size-14 cursor-pointer place-items-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-background transition-colors outline-none focus-visible:ring-ring"
                  >
                    {/* No nudge (#827): the swords fill their square box, so the grid's centre is theirs. */}
                    <GameIcon name={tab.icon} size="lg" />
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
                aria-label={badge > 0 ? `${tab.label}, ${badge} waiting` : tab.label}
                aria-current={isActive ? "page" : undefined}
                aria-describedby={isActive ? hint : undefined}
                onClick={() => onNavigate?.(tab.id)}
                className={cn(
                  // `relative`: painted over the highlight, which comes first.
                  "state-layer relative flex h-11 min-w-0 flex-1 cursor-pointer flex-col items-center justify-center rounded-lg px-1 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring mobile:h-13",
                  "transition-colors duration-(--tab-swipe-duration) ease-(--tab-swipe-ease) motion-reduce:transition-none",
                  // Below `desktop` the highlight is the current item's layer: its own is cleared, except while pressed.
                  "max-desktop:aria-[current=page]:[--layer:transparent] max-desktop:aria-[current=page]:active:[--layer:var(--state-pressed)]",
                  isActive ? "text-primary" : "text-foreground",
                  wasActive && "max-desktop:starting:text-primary",
                  arrives && "max-desktop:starting:text-foreground",
                )}
              >
                {/* The badge sits inside the icon's box (its side padding), so the item's content never leaves it, two digits included. */}
                <span className={cn("relative", badge > 0 && "px-2.5")}>
                  <GameIcon name={tab.icon} size="md" />
                  {badge > 0 && (
                    <span aria-hidden data-slot="app-nav-badge" className="numeric absolute -top-2 right-0 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-xs leading-none font-semibold text-primary-foreground ring-2 ring-background">
                      {badge}
                    </span>
                  )}
                </span>
                {/* Not `sr-only mobile:not-sr-only`: Font Awesome injects its own `.sr-only` after Tailwind's, which wins. The row
                    folds to nothing but on the current item (0fr to 1fr), and a folded row is hidden (`visibility`, which turns at the end
                    of a fold and the start of an unfold). */}
                <span
                  data-slot="app-nav-label"
                  data-open={isActive || undefined}
                  className={cn(
                    "hidden transition-[grid-template-rows,opacity,visibility] duration-(--tab-swipe-duration) ease-(--tab-swipe-ease) motion-reduce:transition-none mobile:grid",
                    isActive ? "grid-rows-[1fr] opacity-100" : "invisible grid-rows-[0fr] opacity-0",
                    wasActive && "max-desktop:starting:visible max-desktop:starting:grid-rows-[1fr] max-desktop:starting:opacity-100",
                    arrives && "max-desktop:starting:invisible max-desktop:starting:grid-rows-[0fr] max-desktop:starting:opacity-0",
                  )}
                >
                  <span className="min-h-0 overflow-hidden">
                    <span className="block pt-1">{tab.label}</span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </nav>
  );
}
