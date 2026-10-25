import { useCallback } from "react";
import { matchPath, useLocation, useNavigate, type NavigateOptions } from "react-router";
import { useActiveTab } from "./handle";
import { useCanGoBack } from "./history";
import { PAGES, TABS, type Tab } from "./pages";
import { tabSwipe } from "./tab-swipe";

/** The query key of the referral link (section 6.2): kept across every link and redirect of the app. */
const REF = "ref";

/** `to` with the `?ref=` of `search` appended; `to` unchanged when `search` has none or `to` already carries one. */
export function withRef(to: string, search: string): string {
  const ref = new URLSearchParams(search).get(REF);
  if (!ref) return to;
  const hashAt = to.indexOf("#");
  const hash = hashAt < 0 ? "" : to.slice(hashAt);
  const rest = hashAt < 0 ? to : to.slice(0, hashAt);
  const queryAt = rest.indexOf("?");
  if (queryAt >= 0 && new URLSearchParams(rest.slice(queryAt)).has(REF)) return to;
  return `${rest}${queryAt >= 0 ? "&" : "?"}${REF}=${encodeURIComponent(ref)}${hash}`;
}

/** `navigate` that keeps the current `?ref=`: scenes go through it, never through a bare `navigate`. */
export function useAppNavigate() {
  const navigate = useNavigate();
  const { search } = useLocation();
  return useCallback((to: string, options?: NavigateOptions) => navigate(withRef(to, search), options), [navigate, search]);
}

/** A tab was picked in the navigation (a scene's `onNavigate`); below `desktop` the page swipes to another tab's (TAB-SWIPE, `tab-swipe.ts`). */
export function useTabNavigate() {
  const go = useAppNavigate();
  const from = useActiveTab();
  return useCallback((tab: Tab) => go(TABS.find((t) => t.id === tab)?.to ?? "/", tabSwipe(from, tab)), [go, from]);
}

/**
 * The parent in the route map of the page at `pathname` (`PageDef.parent`), the home without one. Read from the location, not
 * the route's matches, so a page in a plain router (the stories' `MemoryRouter`) reads it too.
 */
export function parentOf(pathname: string): string {
  return PAGES.find((p) => matchPath({ path: `/${p.path}`, end: true }, pathname))?.parent ?? "/";
}

/**
 * Back (a scene's `onBack`): the previous in-app entry, or the page's parent in the route map when there is none (a deep link,
 * an old link, a reload; `PageDef.parent`, #760), the home for a page without one. Only for a page whose previous entry can
 * never be a game: a page reached after a game goes up with `useUpTo` instead.
 */
export function useBack() {
  const navigate = useNavigate();
  const go = useAppNavigate();
  const canGoBack = useCanGoBack();
  const parent = parentOf(useLocation().pathname);
  return useCallback(() => (canGoBack() ? navigate(-1) : go(parent, { replace: true })), [canGoBack, go, navigate, parent]);
}

/**
 * Back up the information hierarchy (#614): always the page's parent route, whatever route the player came from. A page that
 * can be reached after a game (a level list, the modes, a game's end) uses it, so its Back never lands in a game, as the
 * browser history would when it holds the board's entry.
 */
export function useUpTo(parent: string) {
  const go = useAppNavigate();
  return useCallback(() => go(parent), [go, parent]);
}
