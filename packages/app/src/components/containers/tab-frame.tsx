import { useCallback, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { useInRouterContext, useLocation, useNavigationType } from "react-router";
import type { Tab } from "../../routes/pages";
import { pageScrollHintRef } from "../../lib/page-scroll-hint";
import { AppNav } from "./app-nav";

export interface TabFrameProps {
  tab: Tab;
  onNavigate?: (tab: Tab) => void;
  children: ReactNode;
}

/**
 * The frame of a tab page (#611): one viewport tall (`h-dvh`), the page in its own scrolling region and the navigation
 * `position: fixed` to the viewport's bottom below `desktop` (in the column's flow, across the top, from it). The region
 * ends at the bar's top (`--app-nav-h`, the bar's measured height), so the content never runs under it. The document never
 * scrolls (`html, body` take no overscroll, theme.css), so a pull past the top or the bottom never moves the navigation; the
 * region's own bounce stays inside it (`overscroll-contain`). Home and `TabPage` use it (a file apart from `TabPage`, which
 * Home's first load does not carry). The region is the page's document: it drives the page's edge hint (`pageScrollHintRef`,
 * the fades `AppNav` draws), not the `scroll-hint` mask of a `ScrollRegion`, and it keeps its offset per history entry
 * (`RegionScrollKeeper`).
 */
export function TabFrame({ tab, onNavigate, children }: TabFrameProps) {
  const frame = useRef<HTMLDivElement>(null);
  const region = useRef<HTMLDivElement | null>(null);
  const regionRef = useCallback((el: HTMLDivElement | null) => {
    region.current = el;
    return pageScrollHintRef(el);
  }, []);
  // The bar's height, for the region's bottom margin: it changes with the labels (from `mobile`) and the safe area.
  useLayoutEffect(() => {
    const el = frame.current;
    const nav = el?.querySelector<HTMLElement>(":scope > nav");
    if (!el || !nav) return;
    const measure = () => el.style.setProperty("--app-nav-h", `${nav.offsetHeight}px`);
    measure();
    const resize = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    resize?.observe(nav);
    return () => resize?.disconnect();
  }, []);
  return (
    <div ref={frame} className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <AppNav active={tab} onNavigate={onNavigate} />
      <div ref={regionRef} data-slot="page-scroll" className="mb-(--app-nav-h) min-h-0 flex-1 overflow-y-auto overscroll-contain desktop:mb-0">
        {children}
      </div>
      {useInRouterContext() && <RegionScrollKeeper region={region} />}
    </div>
  );
}

/** The offsets of the regions, by history entry; `sessionStorage` keeps them across a reload, as the browser did the document's. */
const offsets = new Map<string, number>();
const STORE = "page-scroll:";

function savedOffset(key: string): number {
  const known = offsets.get(key);
  if (known !== undefined) return known;
  try {
    return Number(sessionStorage.getItem(STORE + key)) || 0;
  } catch {
    return 0;
  }
}

function saveOffset(key: string, top: number) {
  offsets.set(key, top);
  try {
    sessionStorage.setItem(STORE + key, String(top));
  } catch {
    // Storage off: the map above is all there is.
  }
}

/** How long a page that comes back may take to grow tall enough for its offset (its data arriving). */
const RESTORE_MS = 3000;

/**
 * The page's scroll position across route changes, as the document had it before the region (#611): Back, Forward and a
 * reload (a `POP`) bring a page back at the offset it was left at, once its content is tall enough (until the player
 * scrolls, or `RESTORE_MS`); a new entry (a `PUSH`, a `REPLACE`) opens at the top.
 */
function RegionScrollKeeper({ region }: { region: RefObject<HTMLElement | null> }) {
  const { key } = useLocation();
  const type = useNavigationType();
  useLayoutEffect(() => {
    const el = region.current;
    if (!el) return;
    let target = type === "POP" ? savedOffset(key) : 0;
    let frame = 0;
    const restore = () => {
      if (target <= 0) return;
      el.scrollTop = target;
      if (Math.abs(el.scrollTop - target) < 1) target = 0;
    };
    const stop = () => {
      target = 0;
    };
    const onScroll = () => {
      // A restore under way would save the offset its short content clamps it to.
      if (!frame && target <= 0) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          saveOffset(key, el.scrollTop);
        });
      }
    };
    restore();
    const resize = typeof ResizeObserver === "function" ? new ResizeObserver(restore) : null;
    for (const child of el.children) resize?.observe(child);
    const timer = setTimeout(stop, RESTORE_MS);
    el.addEventListener("scroll", onScroll, { passive: true });
    for (const type of ["touchstart", "wheel", "keydown", "pointerdown"]) el.addEventListener(type, stop, { passive: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      clearTimeout(timer);
      resize?.disconnect();
      el.removeEventListener("scroll", onScroll);
      for (const type of ["touchstart", "wheel", "keydown", "pointerdown"]) el.removeEventListener(type, stop);
    };
  }, [region, key, type]);
  return null;
}
