import { useCallback, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { useInRouterContext, useLocation, useNavigationType } from "react-router";
import { pageScrollHintRef } from "../../lib/page-scroll-hint";
import { usePagePanel } from "./page-panel-context";
import { PageRegionProvider } from "./page-region";

export interface TabFrameProps {
  children: ReactNode;
}

/**
 * The frame of a tab page (#611): one viewport tall (`h-dvh`), the page in its own scrolling region. The document never scrolls
 * (`html, body` take no overscroll, theme.css), so a pull past the top or the bottom never moves the page's header; the region's
 * own bounce stays inside it (`overscroll-contain`). Home and `TabPage` use it (a file apart from `TabPage`, which Home's first
 * load does not carry). The region is the page's document: it drives the page's edge hint (`pageScrollHintRef`: the fade at the
 * screen's foot below, `page-more`), not the `scroll-hint` mask of a `ScrollRegion`, and it keeps its offset per history entry
 * (`RegionScrollKeeper`). From `desktop` the page is in the home's side panel (DESK-PANELS, #762), whose body is its scrolling
 * region; the frame then draws its page alone.
 * DOCK-UNDER-PAGES (the owner's ask of 2026-11-04): a page carries no dock. The region runs to the screen's foot, its safe area
 * under the page's last line; the page's way out is its header's Back.
 * PAGES-SCROLL (#782): the page is drawn straight in the region, its header and its content as the region's children (no
 * column of its own between them and the region), so the region is the one element that scrolls and its header sticks to its
 * top; the page knows it is in a region (`PageRegionProvider`), and a flow's bar then leaves the document's hint alone.
 */
export function TabFrame({ children }: TabFrameProps) {
  if (usePagePanel()) return <div className="relative flex flex-1 flex-col">{children}</div>;
  return <FullTabFrame>{children}</FullTabFrame>;
}

function FullTabFrame({ children }: TabFrameProps) {
  const region = useRef<HTMLDivElement | null>(null);
  const regionRef = useCallback((el: HTMLDivElement | null) => {
    region.current = el;
    return pageScrollHintRef(el);
  }, []);
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <div ref={regionRef} data-slot="page-scroll" className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
        <PageRegionProvider value>{children}</PageRegionProvider>
      </div>
      {/* The page's edge hint (NO-SCROLLBARS, #609): while its region has more below, a fade at the screen's foot. */}
      <span
        aria-hidden
        data-slot="page-scroll-hint"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-10 h-[calc(2rem+env(safe-area-inset-bottom))] bg-linear-to-b to-background opacity-0 transition-opacity motion-reduce:transition-none page-more:opacity-100"
      />
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
    // A page kept mounted across entries (the current tab picked again, then Back) takes its target too, the top included.
    const target = type === "POP" ? savedOffset(key) : 0;
    let pending = true;
    let frame = 0;
    const restore = () => {
      if (!pending) return;
      el.scrollTop = target;
      if (Math.abs(el.scrollTop - target) < 1) pending = false;
    };
    const stop = () => {
      pending = false;
    };
    const onScroll = () => {
      // A restore under way would save the offset its short content clamps it to.
      if (!frame && !pending) {
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
