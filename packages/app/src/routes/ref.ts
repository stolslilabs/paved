import { useCallback } from "react";
import { useLocation, useNavigate, type NavigateOptions } from "react-router";
import { useCanGoBack } from "./history";
import { TABS, type Tab } from "./pages";

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

/** A tab was picked in the navigation (a scene's `onNavigate`). */
export function useTabNavigate() {
  const go = useAppNavigate();
  return useCallback((tab: Tab) => go(TABS.find((t) => t.id === tab)?.to ?? "/"), [go]);
}

/**
 * Back (a scene's `onBack`): the previous in-app entry, or Home when there is none (a deep link, an old link, a redirect).
 * Only for a page whose previous entry can never be a game: a page reached after a game goes up with `useUpTo` instead.
 */
export function useBack() {
  const navigate = useNavigate();
  const go = useAppNavigate();
  const canGoBack = useCanGoBack();
  return useCallback(() => (canGoBack() ? navigate(-1) : go("/", { replace: true })), [canGoBack, go, navigate]);
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
