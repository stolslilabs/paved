import { useCallback } from "react";
import { matchPath, useLocation, useNavigate, type NavigateOptions } from "react-router";
import { stepsBackTo, useTrackedHistory } from "./history";
import { PAGES, TABS, type PageDef, type Tab } from "./pages";
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

/**
 * A tab was picked in the navigation (a scene's `onNavigate`); below `desktop` the page swipes to another tab's (TAB-SWIPE,
 * `tab-swipe.ts`). The tab it leaves is read from the location, as `parentOf`, so a page of the bar (#763) in a plain router
 * (the stories') has it too.
 * TAB-RETAP (#800, the owner's decision of 2026-10-26): the current tab picked again closes its page, up to the village by the
 * Back rule (`useUpTo`: no push, so a Back afterwards never reopens it), with no swipe. From a page under that tab (a sheet over
 * Settings) the first pick goes up to its parent, the tab's page, the next one to the village.
 */
export function useTabNavigate() {
  const go = useAppNavigate();
  const { pathname } = useLocation();
  const from = pageAt(pathname)?.nav ?? null;
  const up = useUpTo(parentOf(pathname));
  return useCallback((tab: Tab) => (tab === from ? up() : go(TABS.find((t) => t.id === tab)?.to ?? "/", tabSwipe(from, tab))), [go, from, up]);
}

/** The route map's page at `pathname`, in table order (a static path before a parameter's). */
export const pageAt = (pathname: string): PageDef | undefined => PAGES.find((p) => matchPath({ path: `/${p.path}`, end: true }, pathname));

/**
 * The parent in the route map of the page at `pathname` (`PageDef.parent`), the home without one. Read from the location, not
 * the route's matches, so a page in a plain router (the stories' `MemoryRouter`) reads it too.
 */
export function parentOf(pathname: string): string {
  return pageAt(pathname)?.parent ?? "/";
}

/** A full-screen flow (a game, a visit, the welcome, a purchase): neither a tab's page nor the side panel's. */
const isFlow = (page: PageDef): boolean => page.nav === null && !page.panel;

/**
 * Back (a scene's `onBack`, BACK-RULE #783): up to the page's parent in the route map (`PageDef.parent`), the village for a page
 * without one, by the one rule of `useUpTo`. A full-screen flow opened from a page (Training from Play, a visit from the League)
 * goes back to that page, the entry just before it: never a flow's or a game's, so no Back lands in a game. So repeated Back
 * reaches the village and never cycles: the page it goes back to goes up by the rule, the flow is ahead of it.
 */
export function useBack() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const history = useTrackedHistory();
  const up = useUpTo(parentOf(pathname));
  return useCallback(() => {
    const page = pageAt(pathname);
    const h = history.current;
    const opener = h && h.at > 0 ? pageAt(h.entries[h.at - 1]!.path.split(/[?#]/)[0]!) : undefined;
    if (page && isFlow(page) && opener && !isFlow(opener)) navigate(-1);
    else up();
  }, [pathname, navigate, history, up]);
}

/**
 * The one Back rule (BACK-RULE #783, the owner's decisions of 2026-10-26: Back never cycles, it goes up toward the village and
 * ends there). Up to `target`, never by a push: back through the history to the nearest earlier entry that shows `target` when
 * this session knows one (the history after it, a game's entry included, is skipped, never shown), else in place of the current
 * entry (a link, a reload, a page reached by a tab or a flow). A page never pushes its parent, so its parent's Back never finds
 * it again. Full-screen flows (an attack, a result, a replay, a game's end) go up to the page they were opened from the same way.
 */
export function useUpTo(target: string) {
  const navigate = useNavigate();
  const go = useAppNavigate();
  const history = useTrackedHistory();
  return useCallback(() => {
    const steps = history.current && stepsBackTo(history.current, target);
    if (steps) navigate(steps);
    else go(target, { replace: true });
  }, [history, target, navigate, go]);
}
