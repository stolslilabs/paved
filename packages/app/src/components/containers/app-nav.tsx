import { useEffect, useState, type CSSProperties } from "react";
import type { Tab } from "../../routes/pages";
import { cn } from "../../lib/utils";
import { Icon } from "../ui/icon";
import { Wordmark } from "../elements/wordmark";
import { BalancesSlot } from "./balances-context";
import { ProfileSlot } from "./profile-context";

/**
 * The navigation's items (the route map's `TABS`, with icons), in one row: the phone's bar (`bar`, the route map's `BAR_TABS`,
 * #763: Shop, Chests, Play, League, Settings) and the desktop's header (`header`, `HEADER_TABS`: Home, Missions, Vault, Settings)
 * read in this order, each item drawn at the widths of the lists it is in. The flags, not the route map's lists: the bar's chunk
 * stays apart from the route map's (the home loads it lazily). Play (#623) is the main action, in the bar's centre: icon only, a
 * gold disc (#668).
 */
export const NAV_TABS: readonly { id: Tab; label: string; icon: string; bar?: true; header?: true }[] = [
  { id: "home", label: "Home", icon: "house", header: true },
  { id: "quests", label: "Missions", icon: "scroll", header: true },
  { id: "shop", label: "Shop", icon: "store", bar: true },
  { id: "chests", label: "Chests", icon: "gift", bar: true },
  { id: "play", label: "Play", icon: "hammer", bar: true },
  { id: "league", label: "League", icon: "trophy", bar: true },
  { id: "vault", label: "Vault", icon: "piggy-bank", header: true },
  { id: "settings", label: "Settings", icon: "gear", bar: true, header: true },
];

/** The phone's bar, left to right. */
const BAR = NAV_TABS.filter((t) => t.bar).map((t) => t.id);

export interface AppNavProps {
  /** The current item; `null` on a page of no item (the home, #763): no highlight. */
  active: Tab | null;
  onNavigate?: (tab: Tab) => void;
  /** Counts on the bar's items (the chests waiting on Chests); none or 0: no badge. */
  badges?: Partial<Record<Tab, number>>;
  /**
   * From `desktop`: the header across the top (the tab pages, #620), or nothing (the home, which keeps its overlay's
   * navigation, and the pages of the bar's new items, which keep their flow's top bar until #762).
   */
  desktop?: "header" | "none";
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
 * PHONE-NAV (#763, the owner's decisions of 2026-10-25): the bar holds Shop, Chests, Play, League, Settings, and shows on the
 * home too (`active` `null`: no item current, no highlight), with the chests waiting on Chests (`badges`). Missions and the
 * Vault are the home's overlay's; a page of either has the bar with no item current. The header from `desktop` is unchanged
 * (#762 replaces it); a page that has none there (`desktop="none"`) draws no navigation from `desktop`.
 * Below `desktop` the bar is `position: fixed` to the viewport's bottom, outside the page's scrolling region (`TabFrame`,
 * #611, which ends the region at the bar's measured height); from `desktop` it is the first child of the page's column. The
 * page lays it out in one column (`flex-col`) at every width. The header is every page's header height from `desktop`
 * (`page-header`, #676), as a flow's top bar and a tab page's title row. It draws the page's edge hint
 * (NO-SCROLLBARS, #609): while the page's region has more below (`page-more`, set by `TabFrame`), a fade just above the bar
 * below `desktop`, at the foot of the viewport from it.
 */
export function AppNav({ active, onNavigate, badges, desktop = "header", className }: AppNavProps) {
  const start = useStartTab(active);
  const moved = start !== active;
  const column = columnOf(active);
  const startColumn = columnOf(start);
  const header = desktop === "header";
  // From `desktop` with no header, the bar's own items alone (no header item, even hidden, beside the page's own buttons).
  const items = header ? NAV_TABS : NAV_TABS.filter((t) => t.bar);
  return (
    <>
      <nav
        aria-label="Main"
        className={cn(
          "z-20 flex items-center border-border bg-background/95 backdrop-blur",
          "fixed inset-x-0 bottom-0 border-t px-2 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]",
          header
            ? "desktop:page-header desktop:relative desktop:gap-4 desktop:border-t-0 desktop:border-b desktop:px-6 desktop:pb-0 wide:gap-6 wide:px-8"
            : "desktop:hidden",
          className,
        )}
      >
        <span aria-hidden data-slot="page-scroll-hint" className="pointer-events-none absolute inset-x-0 bottom-full h-8 bg-linear-to-b to-background opacity-0 transition-opacity motion-reduce:transition-none page-more:opacity-100 desktop:hidden" />
        {/* From `desktop`, the player's avatar opens the header, beside the wordmark (#624); below it the pages' headers carry it. */}
        {header && <ProfileSlot className="hidden desktop:block" />}
        {header && <Wordmark size="sm" className="hidden shrink-0 desktop:flex" />}
        <div className="relative flex min-w-0 flex-1 justify-between gap-1 desktop:flex-none desktop:justify-start desktop:gap-1.5">
          {/* The sliding highlight (TAB-SWIPE): one column of the five (`gap-1` between them), under the items. */}
          <span
            aria-hidden
            data-slot="app-nav-highlight"
            data-force="selected"
            data-column={column}
            style={{ "--nav-col": Math.max(0, column), "--nav-from": Math.max(0, startColumn) } as CSSProperties}
            className={cn(
              "state-layer pointer-events-none absolute inset-y-0 left-0 w-[calc((100%-1rem)/5)] rounded-lg desktop:hidden",
              "[translate:calc(var(--nav-col)*(100%+0.25rem))_0] max-desktop:starting:[translate:calc(var(--nav-from)*(100%+0.25rem))_0]",
              "transition-[translate,opacity] duration-(--tab-swipe-duration) ease-(--tab-swipe-ease) motion-reduce:transition-none",
              // None on Play, nor on a page of no item of the bar (the home, Missions, the Vault): it fades in or out in place.
              (active === "play" || column < 0) && "opacity-0",
              (start === "play" || startColumn < 0) && "max-desktop:starting:opacity-0",
            )}
          />
          {items.map((tab) => {
            const isActive = tab.id === active;
            const badge = badges?.[tab.id] ?? 0;
            // Each item at the widths of its lists: the bar's below `desktop`, the header's from it.
            const where = cn(!tab.bar && "max-desktop:hidden", !tab.header && "desktop:hidden");
            if (tab.id === "play") {
              return (
                // The slot keeps the bar's five equal columns; the disc rises above the bar (over the edge hint: `z-10`). Gone from `desktop`
                // (#668): the header keeps four items, Play is on the Home page.
                <div key={tab.id} className={cn("flex min-w-0 flex-1 justify-center", where)}>
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
                aria-label={badge > 0 ? `${tab.label}, ${badge} waiting` : tab.label}
                aria-current={isActive ? "page" : undefined}
                onClick={() => onNavigate?.(tab.id)}
                className={cn(
                  where,
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
                {/* The badge sits inside the icon's box (its side padding), so the item's content never leaves it, two digits included. */}
                <span className={cn("relative", badge > 0 && "px-2.5")}>
                  <Icon name={tab.icon} size="md" fixedWidth />
                  {badge > 0 && (
                    <span aria-hidden data-slot="app-nav-badge" className="numeric absolute -top-2 right-0 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-xs leading-none font-semibold text-primary-foreground ring-2 ring-background">
                      {badge}
                    </span>
                  )}
                </span>
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
        {header && <BalancesSlot layout="rail" className="ml-auto hidden desktop:flex" />}
      </nav>
      {/* Outside the bar: its backdrop filter would make it the containing block of a fixed child. */}
      {header && (
        <div aria-hidden data-slot="page-scroll-hint" className="pointer-events-none fixed inset-x-0 bottom-0 z-10 hidden h-16 bg-linear-to-b via-background/70 to-background opacity-0 transition-opacity motion-reduce:transition-none desktop:block page-more:opacity-100" />
      )}
    </>
  );
}
