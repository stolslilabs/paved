import { useEffect } from "react";
import { useLocation, useViewTransitionState, type NavigateOptions } from "react-router";
import { BAR_TABS, type Tab } from "./pages";

/**
 * TAB-SWIPE (#726): below `desktop`, a pick in the bar moves the page sideways, from one tab's page to the next, through a view
 * transition of the page's region only (theme.css, TAB-SWIPE). The way follows the bar's order (`BAR_TABS`, #763), as the mark
 * `data-tab-swipe` on `<html>` says: `next` for a tab to the right, `prev` to the left.
 */
export type TabSwipeWay = "next" | "prev";

/** The mark on `<html>` while a swipe runs; theme.css names the page's region and picks the keyframes from it. */
export const TAB_SWIPE_MARK = "data-tab-swipe";

/** Below `desktop` (theme.css `--breakpoint-desktop`, 64rem): the only widths that swipe. */
const BELOW_DESKTOP = "(width < 64rem)";
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/**
 * The way from the page of `from` to that of `to`, or `null` when the move does not swipe: from a page of no tab, to Play (a
 * full-screen flow), within one tab (Settings from its Themes), or from or to a tab not in the bar (the home, Missions, the
 * Vault, #763: no item of the bar is current there, so the bar shows no way).
 */
export function tabSwipeWay(from: Tab | null, to: Tab): TabSwipeWay | null {
  if (from === null || from === to || from === "play" || to === "play") return null;
  const a = BAR_TABS.indexOf(from);
  const b = BAR_TABS.indexOf(to);
  if (a < 0 || b < 0) return null;
  return b > a ? "next" : "prev";
}

const matches = (query: string) => typeof window.matchMedia === "function" && window.matchMedia(query).matches;

/**
 * The navigation's options for a pick of `to` from the page of `from`: `{ viewTransition: true }`, with the mark set on
 * `<html>`, when the move swipes; `undefined`, the page changing at once, when it does not (see `tabSwipeWay`), from `desktop`,
 * under reduced motion, or in a browser without `document.startViewTransition`.
 */
export function tabSwipe(from: Tab | null, to: Tab): NavigateOptions | undefined {
  const way = tabSwipeWay(from, to);
  if (!way || typeof document.startViewTransition !== "function" || !matches(BELOW_DESKTOP) || matches(REDUCED_MOTION)) return undefined;
  document.documentElement.setAttribute(TAB_SWIPE_MARK, way);
  return { viewTransition: true };
}

/**
 * Removes the mark once no view transition runs (`RootLayout`'s leaf): after the swipe's end, or after a move that never
 * transitioned (a redirect the router took at once). The region then loses its `view-transition-name`.
 */
export function useTabSwipeEnd() {
  const { pathname, key } = useLocation();
  const transitioning = useViewTransitionState(pathname);
  useEffect(() => {
    if (!transitioning) document.documentElement.removeAttribute(TAB_SWIPE_MARK);
  }, [transitioning, key]);
}
