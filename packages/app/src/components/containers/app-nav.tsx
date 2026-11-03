import { useEffect, useId, useState, type CSSProperties } from "react";
import type { Tab } from "../../routes/pages";
import { cn } from "../../lib/utils";
import { DOCK_ART, FRAME_ART, uiFrameImageSet, uiFrameSources, type UiIconName } from "../elements/ui-art";
import { UiIcon } from "../elements/ui-icon";

/**
 * The dock, left to right (the route map's `BAR_TABS`; HOME-DOCK, the owner's asks of 2026-11-03, the mockup's footer: Shop, Chests,
 * Play, Guild, Settings, Guild in League's place, League reached by the crowns' capsule), with the mockup's icons. Its own list, not
 * the route map's: the bar's chunk stays apart from the route map's (the home loads it lazily). Play (#623) is the main action, in
 * the dock's centre: the PLAY medallion.
 */
// `art`, not `icon`: the Font Awesome subset's guard reads an `icon` key as a Font Awesome name; these are the HUD's images.
export const NAV_TABS: readonly { id: Tab; label: string; art: UiIconName }[] = [
  { id: "shop", label: "Shop", art: "shop" },
  { id: "chests", label: "Chests", art: "chests" },
  { id: "play", label: "Play", art: "swords" },
  { id: "guild", label: "Guild", art: "guild" },
  { id: "settings", label: "Settings", art: "settings" },
];

/** A length of the mockup's, in CSS px (`DOCK_ART`: its pixels at a 375 px phone's scale, kept at every width). */
const px = (n: number) => n * DOCK_ART.scale;
/** A 9-slice's border as a share of its image's side, for `border-image-slice` (any copy of the image-set). */
const share = (n: number, side: number) => `${((100 * n) / side).toFixed(3)}%`;
const { wood, panel, divider, medallion } = DOCK_ART;
/** Play's column, the medallion's width; the four items share the rest. */
const PLAY_PX = px(medallion.width);
/** The items' icons and the swords, in CSS px (the copies are picked by them): the mockup's drawings, 41 and 44 px wide. */
const ICON_PX = 44;
const SWORDS_PX = 47;
/** The dividers, between two columns: at the four borders of the five (Play's two under the medallion's rim, their notches showing). */
const DIVIDERS = [1, 2, 3, 4];
/** A column's left edge in the row: `before` items and, past Play, its column. */
const columnLeft = (before: number, pastPlay: boolean) => `calc((100% - ${PLAY_PX}px) / 4 * ${before}${pastPlay ? ` + ${PLAY_PX}px` : ""})`;

/*
 * The painted pieces, inline: boxes of the dock's own chunk, not utilities of the app's stylesheet. The 9-slices' borders are
 * transparent until their image comes (a border image not yet drawn falls back to the border's own colour).
 */
const WOOD_STYLE: CSSProperties = {
  top: px(wood.top),
  height: px(wood.height),
  borderStyle: "solid",
  borderColor: "transparent",
  borderWidth: `0 ${px(wood.side)}px ${px(wood.bottom)}px`,
  borderImageSource: uiFrameImageSet("dock-wood"),
  borderImageSlice: `0 ${share(wood.side, FRAME_ART["dock-wood"].width)} ${share(wood.bottom, FRAME_ART["dock-wood"].height)} fill`,
};
const PANEL_STYLE: CSSProperties = {
  borderStyle: "solid",
  borderColor: "transparent",
  borderWidth: px(panel.border),
  borderImageSource: uiFrameImageSet("dock-panel"),
  borderImageSlice: `${share(panel.border, FRAME_ART["dock-panel"].height)} ${share(panel.border, FRAME_ART["dock-panel"].width)} fill`,
};
/** The labels' outline, the mockup's: thick and dark, a drop under it. */
const OUTLINE: CSSProperties = {
  textShadow: [[-1.5, 0], [1.5, 0], [0, -1.5], [0, 1.5], [-1, -1], [1, -1], [-1, 1], [1, 1]]
    .map(([x, y]) => `${x}px ${y}px var(--background)`)
    .concat("0 2px 2px var(--background)")
    .join(", "),
};

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
 * footer, `docs/design/home.webp`), its painted pieces cut from the mockup and drawn at its scale (`DOCK_ART`): a wooden rail at the
 * foot, its stacked ends at the screen's edges, under a parchment band (a 9-slice, its notched corners kept) with a divider between
 * its columns; five items on it, each the mockup's icon over its label (white, outlined; from `mobile`, a 320 px phone too narrow
 * for the five), and Play in the centre, a gold medallion rising above the band, the swords and PLAY on it. Full width on a phone;
 * centred, 34 rem wide, from `tablet`, the band and the plank stretched; shown on the home from `desktop` too (the home's overlay
 * keeps Missions and the Vault, the dock has the rest). Badges: the mockup's red squares at a column's top right.
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
 * region at the bar's measured height: the band's top to the foot, the medallion rising above it). It draws the page's edge hint
 * (NO-SCROLLBARS, #609): while the page's region has more below (`page-more`, set by `TabFrame`), a fade just above the bar.
 * TAB-RETAP (#800, the owner's decision of 2026-10-26): a tap on the current item closes its page and returns to the village
 * (`useTabNavigate`); the item says so (`aria-describedby`, `RETAP_HINT`) and keeps `aria-current="page"`.
 */
export function AppNav({ active, onNavigate, badges, className }: AppNavProps) {
  const hint = useId();
  const start = useStartTab(active);
  const moved = start !== active;
  const column = columnOf(active);
  const startColumn = columnOf(start);
  // The highlight's offset, in its own width (one item's): past Play, the medallion's column less an item's.
  const offset = (col: number) => `calc(${Math.max(0, col)} * 100%${col > 2 ? ` + ${PLAY_PX}px - 100%` : ""})`;
  return (
    <nav
      aria-label="Main"
      data-slot="app-nav"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      className={cn("fixed inset-x-0 bottom-0 z-20 isolate tablet:mx-auto tablet:w-full tablet:max-w-[34rem]", className)}
    >
      <span id={hint} hidden>
        {RETAP_HINT}
      </span>
      <span aria-hidden data-slot="page-scroll-hint" className="pointer-events-none absolute inset-x-0 bottom-full h-8 bg-linear-to-b to-background opacity-0 transition-opacity motion-reduce:transition-none page-more:opacity-100" />
      {/* The safe area's foot, the plank's colour. */}
      <span aria-hidden className="absolute inset-x-0 bottom-0 bg-dock-ink" style={{ height: "env(safe-area-inset-bottom)" }} />
      <div className="relative" style={{ height: px(DOCK_ART.height) }}>
        <span aria-hidden data-slot="dock-wood" className="pointer-events-none absolute inset-x-0" style={WOOD_STYLE} />
        <div className="absolute top-0 flex" style={{ left: px(panel.inset), right: px(panel.inset), height: px(panel.height) }}>
          <span aria-hidden data-slot="dock-panel" className="pointer-events-none absolute inset-0" style={PANEL_STYLE} />
          {DIVIDERS.map((k) => (
            <span
              key={k}
              aria-hidden
              data-slot="dock-divider"
              className="pointer-events-none absolute inset-y-0 -translate-x-1/2 bg-size-[100%_100%]"
              style={{ left: columnLeft(k > 2 ? k - 1 : k, k > 2), width: px(divider.width), backgroundImage: uiFrameImageSet("dock-divider") }}
            />
          ))}
          {/* The sliding highlight (TAB-SWIPE): one item's column, on the parchment inside its frame, under the items. */}
          <span
            aria-hidden
            data-slot="app-nav-highlight"
            data-column={column}
            data-from={startColumn}
            style={{ "--nav-x": offset(column), "--nav-from-x": offset(startColumn), top: px(28), bottom: px(32), width: columnLeft(1, false) } as CSSProperties}
            className={cn(
              "pointer-events-none absolute left-0 rounded-md border-x-4 border-transparent bg-dock-ink/20 bg-clip-padding",
              "[translate:var(--nav-x)_0] starting:[translate:var(--nav-from-x)_0]",
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
                // The medallion's column; the medallion rises above the band (over the edge hint: `z-10`).
                <div key={tab.id} className="relative shrink-0" style={{ width: PLAY_PX }}>
                  <button
                    type="button"
                    aria-label={tab.label}
                    aria-current={isActive ? "page" : undefined}
                    aria-describedby={isActive ? hint : undefined}
                    onClick={() => onNavigate?.(tab.id)}
                    style={{ top: px(medallion.top), height: px(medallion.height) }}
                    className="absolute inset-x-0 z-10 grid cursor-pointer place-items-center rounded-full outline-none transition-transform active:scale-95 motion-reduce:transition-none"
                  >
                    <img {...uiFrameSources("play-medallion", PLAY_PX)} alt="" aria-hidden draggable={false} className="absolute inset-0 size-full" />
                    {/* The swords over PLAY, one group centred in the medallion (`data-centre`: the stories' centre guide reads it), PLAY
                        over the swords' foot and the group's own foot padded, so the drawing sits where the mockup's does. */}
                    <span data-centre className="relative flex flex-col items-center" style={{ paddingBottom: 5 }}>
                      <UiIcon name={tab.art} px={SWORDS_PX} className="size-[47px]" />
                      <span className="text-xl leading-none font-black text-foreground uppercase" style={{ ...OUTLINE, marginTop: -10.5 }}>
                        {tab.label}
                      </span>
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
                  // `relative`: painted over the highlight, which comes first. The icon alone in the band's middle below `mobile`.
                  "relative flex min-w-0 flex-1 cursor-pointer flex-col items-center justify-center pb-1.5 outline-none transition-[color,scale] active:scale-95 mobile:justify-start mobile:pb-0",
                  "duration-(--tab-swipe-duration) ease-(--tab-swipe-ease) motion-reduce:transition-none",
                  isActive ? "text-primary" : "text-foreground",
                  wasActive && "starting:text-primary",
                  arrives && "starting:text-foreground",
                )}
              >
                <UiIcon name={tab.art} px={ICON_PX} className="size-11" />
                {/* Not `sr-only mobile:not-sr-only`: Font Awesome injects its own `.sr-only` after Tailwind's, which wins. */}
                <span data-slot="app-nav-label" className="-mt-1 hidden max-w-full truncate px-0.5 text-xs leading-none font-black tracking-tight mobile:block" style={OUTLINE}>
                  {tab.label}
                </span>
                {badge > 0 && (
                  <span aria-hidden data-slot="app-nav-badge" className="numeric absolute -top-0.5 right-1.5 grid h-4 min-w-4 place-items-center rounded-[0.3rem] bg-dock-badge px-0.5 text-xs leading-none font-bold text-foreground ring-2 ring-background">
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
