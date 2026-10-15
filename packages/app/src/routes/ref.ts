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

/** Back (a scene's `onBack`): the previous in-app entry, or Home when there is none (a deep link, an old link, a redirect). */
export function useBack() {
  const navigate = useNavigate();
  const go = useAppNavigate();
  const canGoBack = useCanGoBack();
  return useCallback(() => (canGoBack() ? navigate(-1) : go("/", { replace: true })), [canGoBack, go, navigate]);
}
