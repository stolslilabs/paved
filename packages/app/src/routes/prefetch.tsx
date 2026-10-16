import { useEffect, type ReactNode } from "react";
import { matchPath } from "react-router";
import { PAGE_LOADERS, type PageLoader } from "./page-loaders";
import { PAGES, TABS } from "./pages";

/**
 * Route prefetch (docs/client/v2-architecture.md, section 12, Q3 (d)). Pages are lazy: a page's chunk is fetched when
 * its route is first visited. Two rules fetch it earlier, so the tap that follows does not wait on the network:
 *
 * - once the first render is done and the browser is idle, the chunks of the tab pages (`TABS`), one idle slot each;
 * - when the pointer goes over, or focus lands in, a part of a page that leads to a route (`PrefetchOnIntent`), the
 *   chunk of that route.
 *
 * Neither runs on a save-data connection or on 2G (`prefetchAllowed`). A prefetch is the page's own `import()`, so the
 * module the route renders later is the one already fetched; a failed one is forgotten and tried again by the route.
 */

/** The parts of the Network Information API this reads (not in the DOM types). */
interface Connection {
  saveData?: boolean;
  effectiveType?: string;
}

/** False when the visitor asked to save data, or the connection is `slow-2g` or `2g`. An unknown connection allows it. */
export function prefetchAllowed(connection: Connection | undefined = (navigator as Navigator & { connection?: Connection }).connection): boolean {
  if (!connection) return true;
  if (connection.saveData) return false;
  return !/(^|-)2g$/.test(connection.effectiveType ?? "");
}

const started = new Set<PageLoader>();

/** The loader of the page a path (`/play/challenge?ref=x`, `/game/12`) shows, or `undefined` for no page of the table. */
export function loaderFor(to: string): PageLoader | undefined {
  const pathname = new URL(to, "http://prefetch.invalid").pathname;
  const page = PAGES.find((p) => matchPath({ path: `/${p.path}`, end: true }, pathname));
  return page && PAGE_LOADERS[page.path];
}

/** Fetch the chunk of the page at `to`, once. Returns whether a fetch started now. */
export function prefetchRoute(to: string): boolean {
  if (!prefetchAllowed()) return false;
  const load = loaderFor(to);
  if (!load || started.has(load)) return false;
  started.add(load);
  load().catch(() => started.delete(load));
  return true;
}

/** Run `task` when the browser is idle (or soon after, where it cannot tell). Returns the cancel. */
export function whenIdle(task: () => void): () => void {
  if (typeof requestIdleCallback === "function") {
    const id = requestIdleCallback(task);
    return () => cancelIdleCallback(id);
  }
  const id = setTimeout(task, 200);
  return () => clearTimeout(id);
}

/** The tab pages' chunks, one per idle slot, so no slot holds the main thread for more than one page's evaluation. */
export function prefetchTabsWhenIdle(): () => void {
  const queue = TABS.map((t) => t.to);
  let cancel = () => {};
  const next = () => {
    const to = queue.shift();
    if (to === undefined) return;
    prefetchRoute(to);
    cancel = whenIdle(next);
  };
  cancel = whenIdle(next);
  return () => cancel();
}

/** Test seam: forget what was fetched. */
export function resetPrefetchForTests(): void {
  started.clear();
}

/**
 * Prefetch `routes` when the pointer first goes over, or focus first lands in, `children`. It adds no box
 * (`display: contents`). Scenes navigate from buttons, so the part that is hovered is the page, not a link.
 */
export function PrefetchOnIntent({ routes, children }: { routes: readonly string[]; children: ReactNode }) {
  const intent = () => routes.forEach(prefetchRoute);
  return (
    <div className="contents" onPointerOver={intent} onFocus={intent}>
      {children}
    </div>
  );
}

/** Start the idle prefetch of the tab pages once, after the first render. */
export function usePrefetchTabs(): void {
  useEffect(() => prefetchTabsWhenIdle(), []);
}
