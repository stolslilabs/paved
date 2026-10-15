import { useMatches } from "react-router";
import type { PageDef, Tab } from "./pages";

/** What a route says of itself (`handle`): its page, and so its tab. */
export interface RouteHandle {
  page: PageDef;
}

function pageOf(handle: unknown): PageDef | null {
  return handle && typeof handle === "object" && "page" in handle ? (handle as RouteHandle).page : null;
}

/** The page of the deepest matched route that has one. */
export function useRoutePage(): PageDef | null {
  const matches = useMatches();
  for (let i = matches.length - 1; i >= 0; i--) {
    const page = pageOf(matches[i]!.handle);
    if (page) return page;
  }
  return null;
}

/**
 * The tab shown as active: the `nav` of the deepest matched route's own entry (never read from the path, so
 * `/player/:id` is Ranks and `/settings/theme` is Settings). `null` on a full-screen flow and on "not found".
 */
export function useActiveTab(): Tab | null {
  return useRoutePage()?.nav ?? null;
}
