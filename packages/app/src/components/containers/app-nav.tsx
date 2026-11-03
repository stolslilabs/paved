import { useEffect, useId, useState, type CSSProperties } from "react";
import type { Tab } from "../../routes/pages";
import { cn } from "../../lib/utils";
import { uiFrameImageSet, uiFrameSources, type UiIconName } from "../elements/ui-art";
import { UiIcon } from "../elements/ui-icon";

/**
 * The dock, left to right (the route map's `BAR_TABS`; HOME-DOCK, the owner's asks of 2026-11-03, the mockup's footer: Shop, Chests,
 * Play, Guild, Settings, Guild in League's place, League reached by the crowns' capsule), with the mockup's icons. Its own list, not
 * the route map's: the bar's chunk stays apart from the route map's (the home loads it lazily). Play (#623) is the main action, in
 * the dock's centre: the PLAY medallion.
 */
export const NAV_TABS: readonly { id: Tab; label: string; icon: UiIconName }[] = [
  { id: "shop", label: "Shop", icon: "shop" },
  { id: "chests", label: "Chests", icon: "chests" },
  { id: "play", label: "Play", icon: "swords" },
  { id: "guild", label: "Guild", icon: "guild" },
  { id: "settings", label: "Settings", icon: "settings" },
];

/** The medallion's side, the swords' and the items' icons', in CSS px (the copies are picked by them). */
const MEDALLION_PX = 76;
const SWORDS_PX = 40;
const ICON_PX = 40;
/** The dividers, a wooden post between two columns: at the four borders of the five (Play's two under the medallion's rim). */
const DIVIDERS = [1, 2, 3, 4];

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
 * The tabbed pages' navigation (section 6.2), the home's footer: the dock (HOME-DOCK, the owner's asks of 2026-11-03, the mockup's
 * anchored ribbon, `docs/design/home.webp`): a painted ribbon (`dock-ribbon`, a 9-slice: its wooden ends and rails kept, its
 * parchment stretched) with wooden posts between its columns, five items on it, each the mockup's icon over its label (white,
 * outlined; from `mobile`, a 320 px phone too narrow for the five), Play in the centre a gold medallion rising above the ribbon, the
 * swords and PLAY on it. Full width on a phone, its wooden ends at the screen's edges; centred, 34 rem wide, from `tablet`; shown
 * on the home from `desktop` too (the home's overlay keeps Missions and the Vault, the dock has the rest).
 * The current item: the sliding highlight (TAB-SWIPE, #726: one column wide, the wood's shade on the parchment, none for Play)
 * slides to its column, and its label turns gold. Every tab page mounts its own bar (`TabFrame`), so a tab change remounts it: the
 * new bar starts from the state the last one drew (`@starting-style`: the highlight on the old column), its transitions run in the
 * page's swipe's duration and easing (`--tab-swipe-duration`, `--tab-swipe-ease`). None under reduced motion. The labels stay shown
 * (the mockup's), no longer folding to the current one's.
 * SWIPE-DISC (#780): during a swipe the bar (`data-slot="app-nav"`) is a view transition of its own, painted above the page's
 * (theme.css, TAB-SWIPE), so the medallion stays whole over the moving page.
 * PHONE-NAV (#763): the bar shows on the home too (`active` `null`: no item current, no highlight), with the chests waiting on
 * Chests and the guild's count on Guild (`badges`). Missions and the Vault are the home's overlay's; a page of either has the bar
 * with no item current.
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
        "fixed inset-x-0 bottom-0 z-20 isolate pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] tablet:mx-auto tablet:w-full tablet:max-w-[34rem]",
        className,
      )}
    >
        <span id={hint} hidden>
          {RETAP_HINT}
        </span>
        <span aria-hidden data-slot="page-scroll-hint" className="pointer-events-none absolute inset-x-0 bottom-full h-8 bg-linear-to-b to-background opacity-0 transition-opacity motion-reduce:transition-none page-more:opacity-100" />
        {/* The ribbon under it all, the safe area's foot included. */}
        <span aria-hidden data-slot="dock-ribbon" className="dock-ribbon pointer-events-none absolute inset-0 -z-10" style={{ borderImageSource: uiFrameImageSet("dock-ribbon") }} />
        <div className="relative mx-4 flex min-w-0 justify-between gap-1">
          {DIVIDERS.map((k) => (
            <span
              key={k}
              aria-hidden
              data-slot="dock-divider"
              className="pointer-events-none absolute top-1/2 h-11 w-2 -translate-x-1/2 -translate-y-1/2 bg-contain bg-center bg-no-repeat"
              style={{ left: `calc((100% + 0.25rem) * ${k} / 5 - 0.125rem)`, backgroundImage: uiFrameImageSet("dock-divider") }}
            />
          ))}
          {/* The sliding highlight (TAB-SWIPE): one column of the five (`gap-1` between them), under the items. */}
          <span
            aria-hidden
            data-slot="app-nav-highlight"
            data-column={column}
            style={{ "--nav-col": Math.max(0, column), "--nav-from": Math.max(0, startColumn) } as CSSProperties}
            className={cn(
              "pointer-events-none absolute inset-y-0 left-0 w-[calc((100%-1rem)/5)] rounded-lg bg-dock-ink/20",
              "[translate:calc(var(--nav-col)*(100%+0.25rem))_0] starting:[translate:calc(var(--nav-from)*(100%+0.25rem))_0]",
              "transition-[translate,opacity] duration-(--tab-swipe-duration) ease-(--tab-swipe-ease) motion-reduce:transition-none",
              // None on Play, nor on a page of no item of the bar (the home, Missions, the Vault): it fades in or out in place.
              (active === "play" || column < 0) && "opacity-0",
              (start === "play" || startColumn < 0) && "starting:opacity-0",
            )}
          />
          {NAV_TABS.map((tab) => {
            const isActive = tab.id === active;
            const badge = badges?.[tab.id] ?? 0;
            if (tab.id === "play") {
              return (
                // The slot keeps the dock's five equal columns; the medallion rises above the ribbon (over the edge hint: `z-10`).
                <div key={tab.id} className="flex min-w-0 flex-1 justify-center">
                  <button
                    type="button"
                    aria-label={tab.label}
                    aria-current={isActive ? "page" : undefined}
                    aria-describedby={isActive ? hint : undefined}
                    onClick={() => onNavigate?.(tab.id)}
                    className="relative z-10 -mt-7 -mb-1 grid size-19 shrink-0 cursor-pointer place-items-center rounded-full outline-none transition-transform active:scale-95 motion-reduce:transition-none"
                  >
                    <img {...uiFrameSources("play-medallion", MEDALLION_PX)} alt="" aria-hidden draggable={false} className="absolute inset-0 size-full drop-shadow-md" />
                    <span className="relative flex flex-col items-center">
                      <UiIcon name={tab.icon} px={SWORDS_PX} className="-mb-1 size-10" />
                      <span className="text-outline text-sm leading-none font-black tracking-wide text-white uppercase">{tab.label}</span>
                    </span>
                  </button>
                </div>
              );
            }
            // The state the last bar drew, where this one's transitions start (TAB-SWIPE): the old item's label gold.
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
                  "relative flex h-12 min-w-0 flex-1 cursor-pointer flex-col items-center justify-center rounded-lg px-1 outline-none transition-[color,scale] active:scale-95 mobile:h-15",
                  "duration-(--tab-swipe-duration) ease-(--tab-swipe-ease) motion-reduce:transition-none",
                  isActive ? "text-primary" : "text-white",
                  wasActive && "starting:text-primary",
                  arrives && "starting:text-white",
                )}
              >
                {/* The badge sits inside the icon's box (its side padding), so the item's content never leaves it, two digits included. */}
                <span className={cn("relative", badge > 0 && "px-2.5")}>
                  <UiIcon name={tab.icon} px={ICON_PX} className="size-10 drop-shadow-sm" />
                  {badge > 0 && (
                    <span aria-hidden data-slot="app-nav-badge" className="numeric absolute -top-1 right-0 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-xs leading-none font-semibold text-primary-foreground ring-2 ring-background">
                      {badge}
                    </span>
                  )}
                </span>
                {/* Not `sr-only mobile:not-sr-only`: Font Awesome injects its own `.sr-only` after Tailwind's, which wins. */}
                <span data-slot="app-nav-label" className="text-outline hidden truncate text-xs leading-tight font-black mobile:block">
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
  );
}
